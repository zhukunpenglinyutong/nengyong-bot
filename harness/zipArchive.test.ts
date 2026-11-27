import { describe, expect, it } from 'vitest'
import { makeZip } from './makeZip'
import { readZipArchive } from './zipArchive'

const MAX = 1_000_000
const read = (archive: Buffer) => readZipArchive(archive, MAX).map((file) => [file.path, file.data.toString()])

describe('readZipArchive', () => {
  it('reads deflated and stored files by their paths', () => {
    const archive = makeZip([
      { path: 'pdf/SKILL.md', text: '# PDF'.repeat(50) },
      { path: 'pdf/notes.txt', text: 'plain', method: 0 },
    ])
    expect(read(archive)).toEqual([
      ['pdf/SKILL.md', '# PDF'.repeat(50)],
      ['pdf/notes.txt', 'plain'],
    ])
  })

  it('skips directories', () => {
    expect(read(makeZip([{ path: 'pdf/' }, { path: 'pdf/SKILL.md', text: 'x' }]))).toEqual([['pdf/SKILL.md', 'x']])
  })

  it('reads names as UTF-8 even when the archiver did not flag them so, as macOS does', () => {
    expect(read(makeZip([{ path: '技能/SKILL.md', text: 'x', flags: 0 }]))).toEqual([['技能/SKILL.md', 'x']])
  })

  it('refuses an archive that would unpack to more than the limit, before unpacking it', () => {
    const archive = makeZip([{ path: 'big.txt', text: 'a'.repeat(2000) }])
    expect(() => readZipArchive(archive, 1000)).toThrow('解开超过')
  })

  it('refuses a file that unpacks to more than it claims', () => {
    expect(() => read(makeZip([{ path: 'bomb.txt', text: 'a'.repeat(5000), size: 10 }]))).toThrow('压缩包坏了')
  })

  it('refuses a file whose checksum does not match', () => {
    expect(() => read(makeZip([{ path: 'a.txt', text: 'x', crc: 1 }]))).toThrow('压缩包坏了')
  })

  it('refuses an encrypted file', () => {
    expect(() => read(makeZip([{ path: 'a.txt', text: 'x', flags: 0x801 }]))).toThrow('密码')
  })

  it('refuses what is not a zip', () => {
    expect(() => read(Buffer.from('not a zip at all, just some text that goes on'))).toThrow('压缩包坏了')
  })
})
