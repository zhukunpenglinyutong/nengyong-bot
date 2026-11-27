import { crc32, inflateRawSync } from 'node:zlib'
import { BYTES_PER_MB } from '../shared/limits'
import { strings } from '../shared/strings'

const END_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const END_BYTES = 22
const CENTRAL_BYTES = 46
const LOCAL_BYTES = 30
const MAX_COMMENT_BYTES = 0xffff
const ZIP64_MARK = 0xffffffff
const STORED = 0
const DEFLATED = 8
const ENCRYPTED_FLAG = 0x1

interface ZipFile {
  path: string
  data: Buffer
}

/**
 * The files of a .zip, by the path the archive gives them; directories are skipped. Encrypted entries, zip64 and
 * methods other than stored and deflate are refused, and so is an archive that would unpack to more than `maxBytes`:
 * each file is inflated to at most the size it claims, and the claims are added up before anything is inflated.
 */
export function readZipArchive(zip: Buffer, maxBytes: number): ZipFile[] {
  const words = strings().harness.skills
  const entries = centralEntries(zip)
  const total = entries.reduce((sum, entry) => sum + entry.size, 0)
  if (total > maxBytes) throw new Error(words.archiveUnpacksTooLarge(Math.round(maxBytes / BYTES_PER_MB)))
  return entries.map((entry) => ({ path: entry.path, data: unpack(zip, entry) }))
}

interface CentralEntry {
  path: string
  method: number
  crc: number
  packedSize: number
  size: number
  localOffset: number
}

function centralEntries(zip: Buffer): CentralEntry[] {
  const words = strings().harness.skills
  const end = endRecord(zip)
  const count = zip.readUInt16LE(end + 10)
  let offset = zip.readUInt32LE(end + 16)
  if (offset === ZIP64_MARK) throw new Error(words.archiveUnsupported)
  const entries: CentralEntry[] = []
  for (let index = 0; index < count; index++) {
    if (offset + CENTRAL_BYTES > zip.length || zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE)
      throw new Error(words.archiveBroken)
    const flags = zip.readUInt16LE(offset + 8)
    const nameLength = zip.readUInt16LE(offset + 28)
    const skipped = nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32)
    // macOS's Archive Utility writes UTF-8 names without setting the flag that says so; old CP437 names are rare
    const path = zip.subarray(offset + CENTRAL_BYTES, offset + CENTRAL_BYTES + nameLength).toString('utf8')
    const entry = {
      path,
      method: zip.readUInt16LE(offset + 10),
      crc: zip.readUInt32LE(offset + 16),
      packedSize: zip.readUInt32LE(offset + 20),
      size: zip.readUInt32LE(offset + 24),
      localOffset: zip.readUInt32LE(offset + 42),
    }
    offset += CENTRAL_BYTES + skipped
    if (path.endsWith('/')) continue
    if (flags & ENCRYPTED_FLAG) throw new Error(words.archiveEncrypted)
    const isZip64 = [entry.packedSize, entry.size, entry.localOffset].includes(ZIP64_MARK)
    if (isZip64 || (entry.method !== STORED && entry.method !== DEFLATED)) throw new Error(words.archiveUnsupported)
    entries.push(entry)
  }
  return entries
}

/** Where the end of central directory record starts: it closes the archive, after a comment of up to 64 KB. */
function endRecord(zip: Buffer): number {
  const last = zip.length - END_BYTES
  for (let offset = last; offset >= Math.max(0, last - MAX_COMMENT_BYTES); offset--)
    if (zip.readUInt32LE(offset) === END_SIGNATURE) return offset
  throw new Error(strings().harness.skills.archiveBroken)
}

function unpack(zip: Buffer, entry: CentralEntry): Buffer {
  const broken = new Error(strings().harness.skills.archiveBroken)
  const local = entry.localOffset
  if (local + LOCAL_BYTES > zip.length || zip.readUInt32LE(local) !== LOCAL_SIGNATURE) throw broken
  const start = local + LOCAL_BYTES + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
  const packed = zip.subarray(start, start + entry.packedSize)
  if (packed.length !== entry.packedSize) throw broken
  let data: Buffer
  try {
    data =
      entry.method === STORED
        ? Buffer.from(packed)
        : inflateRawSync(packed, { maxOutputLength: Math.max(entry.size, 1) })
  } catch {
    throw broken
  }
  if (data.length !== entry.size || crc32(data) !== entry.crc) throw broken
  return data
}
