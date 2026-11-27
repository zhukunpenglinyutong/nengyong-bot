import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeZip } from './makeZip'
import { fetchSkills, pickedSkills } from './skillSource'

const COMMIT = 'e4bb5d960d87126ff3b3a8af1a104b7db67560ba'
const SKILL = '---\nname: pdf\ndescription: For PDFs.\n---\n# PDF'
let dir = ''

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-source-'))
})
afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(dir, { recursive: true, force: true })
})

function writeTree(root: string, files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
}

const pathsOf = (files: Map<string, Buffer>) => [...files.keys()].sort()

/** The skill at `input`, read, when it holds just that one. */
async function fetchOne(input: string) {
  const [skill, ...others] = await fetchSkills(input)
  if (!skill || others.length) throw new Error(`expected one skill at ${input}`)
  return skill.read()
}

describe('a folder on this computer', () => {
  it('reads a skill folder', async () => {
    writeTree(dir, { 'SKILL.md': SKILL, 'scripts/fill.py': 'print(1)' })
    const skill = await fetchOne(dir)
    expect(pathsOf(skill.files)).toEqual(['SKILL.md', 'scripts/fill.py'])
    expect(skill.source).toEqual({ kind: 'local', root: dir, path: dir })
  })

  it('finds the one skill in a folder around it', async () => {
    writeTree(dir, { 'README.md': 'x', 'skills/pdf/SKILL.md': SKILL })
    const skill = await fetchOne(dir)
    expect(pathsOf(skill.files)).toEqual(['SKILL.md'])
    expect(skill.folderName).toBe('pdf')
    expect(skill.source).toEqual({ kind: 'local', root: dir, path: path.join(dir, 'skills/pdf') })
  })

  it('finds every skill in a folder that holds several', async () => {
    writeTree(dir, { 'pdf/SKILL.md': SKILL, 'xlsx/SKILL.md': SKILL })
    expect((await fetchSkills(dir)).map((skill) => skill.folderName)).toEqual(['pdf', 'xlsx'])
  })

  it('takes a SKILL.md inside a skill folder as part of that skill, as `npx skills` does', async () => {
    writeTree(dir, { 'a/SKILL.md': SKILL, 'a/examples/b/SKILL.md': SKILL, 'c/SKILL.md': SKILL })
    const [a, c, ...others] = await fetchSkills(dir)
    expect([a?.folderName, c?.folderName, others]).toEqual(['a', 'c', []])
    expect(pathsOf(a?.read().files ?? new Map())).toEqual(['SKILL.md', 'examples/b/SKILL.md'])
  })

  it('leaves out version control and macOS litter', async () => {
    writeTree(dir, { 'SKILL.md': SKILL, '.git/config': 'x', '.DS_Store': 'x', '._SKILL.md': 'x' })
    expect(pathsOf((await fetchOne(dir)).files)).toEqual(['SKILL.md'])
  })

  it('does not follow a symbolic link out of the folder', async () => {
    writeTree(dir, { 'SKILL.md': SKILL })
    fs.symlinkSync('/etc', path.join(dir, 'etc'))
    expect(pathsOf((await fetchOne(dir)).files)).toEqual(['SKILL.md'])
  })

  it('names a skill whose SKILL.md names none after the folder pointed at', async () => {
    const folder = path.join(dir, 'pdf-tools')
    writeTree(folder, { 'SKILL.md': '---\ndescription: For PDFs.\n---\n' })
    expect((await fetchOne(folder)).folderName).toBe('pdf-tools')
  })

  it('refuses a folder with more files than a skill may have, before reading them', async () => {
    writeTree(dir, Object.fromEntries([...Array(501).keys()].map((n) => [`f${n}.md`, 'x'])))
    writeTree(dir, { 'SKILL.md': SKILL })
    await expect(fetchOne(dir)).rejects.toThrow('文件太多')
  })

  it('refuses a relative path', async () => {
    await expect(fetchOne('skills/pdf')).rejects.toThrow('完整路径')
  })

  it('says when there is no skill', async () => {
    writeTree(dir, { 'README.md': 'x' })
    await expect(fetchOne(dir)).rejects.toThrow('找不到 SKILL.md')
  })
})

describe('what the user picked to upload', () => {
  const namesOf = (picked: string) => pickedSkills(picked).map((skill) => skill.folderName)

  it('finds every skill in a folder that holds several, each read with its own files', () => {
    writeTree(dir, { 'README.md': 'x', 'pdf/SKILL.md': SKILL, 'pdf/fill.py': 'x', 'xlsx/SKILL.md': SKILL })
    const [pdf, xlsx] = pickedSkills(dir)
    expect([pdf?.folderName, xlsx?.folderName]).toEqual(['pdf', 'xlsx'])
    expect(pathsOf(pdf?.read().files ?? new Map())).toEqual(['SKILL.md', 'fill.py'])
    expect(xlsx?.read().source).toEqual({ kind: 'local', root: dir, path: path.join(dir, 'xlsx') })
  })

  it('takes a skill folder as the one skill, whatever is nested in it', () => {
    writeTree(dir, { 'SKILL.md': SKILL, 'examples/other/SKILL.md': SKILL })
    expect(pickedSkills(dir)).toHaveLength(1)
  })

  it('reads the skills in a .zip, leaving out the litter macOS puts in one', () => {
    const archive = path.join(dir, 'skills.zip')
    fs.writeFileSync(
      archive,
      makeZip([
        { path: 'skills-main/pdf/SKILL.md', text: SKILL },
        { path: 'skills-main/pdf/._SKILL.md', text: 'x' },
        { path: '__MACOSX/skills-main/pdf/._SKILL.md', text: 'x' },
        { path: 'skills-main/xlsx/SKILL.md', text: SKILL },
      ]),
    )
    expect(namesOf(archive)).toEqual(['pdf', 'xlsx'])
    expect(pathsOf(pickedSkills(archive)[0]?.read().files ?? new Map())).toEqual(['SKILL.md'])
  })

  it('names a skill at the top of a .skill file after the file', () => {
    const archive = path.join(dir, 'pdf-tools.skill')
    fs.writeFileSync(archive, makeZip([{ path: 'SKILL.md', text: SKILL }]))
    expect(namesOf(archive)).toEqual(['pdf-tools'])
  })

  it('refuses an archive with a path out of its folder', () => {
    const archive = path.join(dir, 'evil.zip')
    fs.writeFileSync(archive, makeZip([{ path: '../SKILL.md', text: SKILL }]))
    expect(() => pickedSkills(archive)).toThrow('不安全')
  })

  it('says when there is no skill', () => {
    writeTree(dir, { 'README.md': 'x' })
    expect(() => pickedSkills(dir)).toThrow('找不到 SKILL.md')
  })
})

describe('a GitHub link', () => {
  /** Serves what GitHub's archive download would: the repository under <repo>-<commit>/, gzipped. */
  function serveRepo(files: Record<string, string>) {
    const top = `skills-${COMMIT}`
    writeTree(path.join(dir, top), files)
    const archive = path.join(dir, 'repo.tar.gz')
    execFileSync('tar', ['-czf', archive, '-C', dir, top], { env: { ...process.env, COPYFILE_DISABLE: '1' } })
    const fetchMock = vi.fn(async () => new Response(fs.readFileSync(archive)))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('reads the folder the link points at, pinned to the commit HEAD was', async () => {
    const fetchMock = serveRepo({ 'skills/pdf/SKILL.md': SKILL, 'skills/xlsx/SKILL.md': SKILL, 'README.md': 'x' })
    const skill = await fetchOne('https://github.com/anthropics/skills/tree/HEAD/skills/pdf')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://github.com/anthropics/skills/archive/HEAD.tar.gz',
      expect.anything(),
    )
    expect(pathsOf(skill.files)).toEqual(['SKILL.md'])
    expect(skill.source).toEqual({ kind: 'github', repo: 'anthropics/skills', path: 'skills/pdf', ref: COMMIT })
  })

  it('downloads the branch a link names', async () => {
    const fetchMock = serveRepo({ 'SKILL.md': SKILL })
    const skill = await fetchOne('https://github.com/me/tools/tree/main')
    expect(fetchMock).toHaveBeenCalledWith('https://github.com/me/tools/archive/main.tar.gz', expect.anything())
    expect(skill.source).toEqual({ kind: 'github', repo: 'me/tools', path: '', ref: 'main' })
  })

  it('takes a link to SKILL.md itself as its folder', async () => {
    serveRepo({ 'skills/pdf/SKILL.md': SKILL, 'skills/pdf/reference.md': 'x' })
    const skill = await fetchOne('https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md')
    expect(pathsOf(skill.files)).toEqual(['SKILL.md', 'reference.md'])
  })

  it('finds every skill of a repository, each from its own folder', async () => {
    serveRepo({ 'skills/pdf/SKILL.md': SKILL, 'skills/xlsx/SKILL.md': SKILL })
    const [, xlsx] = await fetchSkills('https://github.com/anthropics/skills')
    expect(xlsx?.read().source).toEqual({ kind: 'github', repo: 'anthropics/skills', path: 'skills/xlsx', ref: COMMIT })
  })

  it('tries a branch whose name has a slash in it', async () => {
    const fetchMock = serveRepo({ 'skills/pdf/SKILL.md': SKILL })
    fetchMock.mockImplementationOnce(async () => new Response('Not Found', { status: 404 }))
    const skill = await fetchOne('https://github.com/me/tools/tree/release/v2/skills/pdf')
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://github.com/me/tools/archive/release/v2.tar.gz',
      expect.anything(),
    )
    expect(skill.source).toMatchObject({ ref: 'release/v2', path: 'skills/pdf' })
  })

  it('explains a repository or branch GitHub does not have', async () => {
    vi.stubGlobal('fetch', async () => new Response('Not Found', { status: 404 }))
    await expect(fetchOne('https://github.com/me/private')).rejects.toThrow('私有')
  })
})
