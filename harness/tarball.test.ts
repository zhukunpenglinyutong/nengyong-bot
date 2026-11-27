import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, expect, it } from 'vitest'
import { readTarball } from './tarball'

const MAX_BYTES = 10_000_000
let dir = ''

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

/** A .tar.gz made by the system's tar, as a GitHub download would come: everything under one top folder. */
function tarballOf(files: Record<string, string>, links: Record<string, string> = {}): Buffer {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarball-'))
  const root = path.join(dir, 'repo-main')
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  for (const [link, target] of Object.entries(links)) fs.symlinkSync(target, path.join(root, link))
  const archive = path.join(dir, 'out.tar.gz')
  // COPYFILE_DISABLE: macOS's tar would add an AppleDouble ._ file next to every file
  execFileSync('tar', ['-czf', archive, '-C', dir, 'repo-main'], { env: { ...process.env, COPYFILE_DISABLE: '1' } })
  return fs.readFileSync(archive)
}

it('reads the regular files with their paths', () => {
  const files = readTarball(tarballOf({ 'skills/pdf/SKILL.md': '# PDF', 'README.md': 'hi' }), MAX_BYTES)
  const byPath = Object.fromEntries(files.map((file) => [file.path, file.data.toString()]))
  expect(byPath).toEqual({ 'repo-main/skills/pdf/SKILL.md': '# PDF', 'repo-main/README.md': 'hi' })
})

it('keeps a path longer than the header has room for', () => {
  const long = `${'deep/'.repeat(30)}SKILL.md`
  const [file] = readTarball(tarballOf({ [long]: 'x' }), MAX_BYTES)
  expect(file?.path).toBe(`repo-main/${long}`)
})

it('skips symbolic links instead of following them', () => {
  const files = readTarball(tarballOf({ 'SKILL.md': 'x' }, { 'escape.md': '/etc/hosts' }), MAX_BYTES)
  expect(files.map((file) => file.path)).toEqual(['repo-main/SKILL.md'])
})

it('refuses an archive that unpacks past the limit', () => {
  expect(() => readTarball(tarballOf({ 'big.txt': 'a'.repeat(5000) }), 1000)).toThrow('解不开')
})

it('refuses what is not a gzip file', () => {
  expect(() => readTarball(gzipSync('not a tar').subarray(0, 5), MAX_BYTES)).toThrow('解不开')
})
