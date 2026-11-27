import { crc32, deflateRawSync } from 'node:zlib'

interface ZipEntry {
  path: string
  text?: string // absent: a directory
  method?: 0 | 8
  flags?: number
  size?: number // what the archive claims the file unpacks to, when not its real size
  crc?: number
}

/** For tests: a .zip as archivers write it: local headers and data, then the central directory, then its end record. */
export function makeZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const data = Buffer.from(entry.text ?? '')
    const method = entry.method ?? 8
    const packed = method === 8 ? deflateRawSync(data) : data
    const name = Buffer.from(entry.path)
    const fields = {
      flags: entry.flags ?? 0x800,
      method,
      crc: entry.crc ?? crc32(data),
      packed: packed.length,
      size: entry.size ?? data.length,
    }
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(fields.flags, 6)
    local.writeUInt16LE(fields.method, 8)
    local.writeUInt32LE(fields.crc, 14)
    local.writeUInt32LE(fields.packed, 18)
    local.writeUInt32LE(fields.size, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(fields.flags, 8)
    central.writeUInt16LE(fields.method, 10)
    central.writeUInt32LE(fields.crc, 16)
    central.writeUInt32LE(fields.packed, 20)
    central.writeUInt32LE(fields.size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, packed)
    centrals.push(central, name)
    offset += local.length + name.length + packed.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}
