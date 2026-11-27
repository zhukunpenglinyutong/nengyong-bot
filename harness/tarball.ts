import { gunzipSync } from 'node:zlib'

const BLOCK = 512

interface TarFile {
  path: string
  data: Buffer
}

/**
 * The regular files of a .tar.gz, by the path the archive gives them. Links, directories and the other special entries
 * are skipped: only file contents come out, so nothing in the archive can point outside where they are written.
 */
export function readTarball(gzipped: Buffer, maxBytes: number): TarFile[] {
  let tar: Buffer
  try {
    tar = gunzipSync(gzipped, { maxOutputLength: maxBytes })
  } catch {
    throw new Error(`压缩包解不开，或者解开超过 ${Math.round(maxBytes / 1_000_000)} MB`)
  }
  const files: TarFile[] = []
  let longPath: string | undefined // from a pax or GNU header: the path of the entry that follows it
  let offset = 0
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK)
    if (header.every((byte) => byte === 0)) break
    const size = Number.parseInt(text(header, 124, 12).trim() || '0', 8)
    if (!Number.isFinite(size) || size < 0) throw new Error('压缩包坏了：读不出文件大小')
    const body = tar.subarray(offset + BLOCK, offset + BLOCK + size)
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK
    const type = String.fromCharCode(header[156])
    switch (type) {
      case 'x':
        longPath = paxPath(body) ?? longPath
        continue
      case 'L':
        longPath = body.toString('utf8').replace(/\0+$/, '')
        continue
      case '0':
      case '\0':
      case '7': {
        const prefix = text(header, 345, 155)
        const name = text(header, 0, 100)
        files.push({ path: longPath ?? (prefix ? `${prefix}/${name}` : name), data: Buffer.from(body) })
        break
      }
      default: // directories, links, devices, global headers: nothing to keep
    }
    longPath = undefined
  }
  return files
}

const text = (header: Buffer, start: number, length: number) =>
  header
    .subarray(start, start + length)
    .toString('utf8')
    .replace(/\0.*$/s, '')

/** A pax header's records are "<length> <key>=<value>\n"; the path one names the next entry. */
function paxPath(body: Buffer): string | undefined {
  for (const record of body.toString('utf8').split('\n')) {
    const match = /^\d+ path=(.*)$/s.exec(record)
    if (match) return match[1]
  }
  return undefined
}
