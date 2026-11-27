import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BYTES_PER_MB } from '../shared/limits'
import { SKILL_ARCHIVE_EXTENSIONS, SKILL_FILE, type SkillSource } from '../shared/skill'
import { strings } from '../shared/strings'
import { checkRelativePath, checkSize, isJunk, type SkillFiles } from './skillPackage'
import { readTarball } from './tarball'
import { readZipArchive } from './zipArchive'

const MAX_ARCHIVE_BYTES = 60 * BYTES_PER_MB
const MAX_UNPACKED_BYTES = 200_000_000
const MAX_FOLDER_ENTRIES = 3000 // walking a local folder stops here: a path like ~ must not read the whole disk
const MAX_REF_PARTS = 3 // in tree/release/v2/skills/pdf the branch may be release or release/v2: up to this many parts are tried
const DOWNLOAD_TIMEOUT_MS = 60_000
const GITHUB_URL =
  /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^?#]+?))?\/?(?:[?#].*)?$/

/** A skill folder read from where the user pointed: its files, where they came from, and the folder's own name. */
interface FetchedSkill {
  files: SkillFiles
  source: SkillSource
  folderName: string
}

interface Candidates {
  sizes: Map<string, number> // every file under the place the user pointed at, by path, with its size
  read: (files: string[]) => SkillFiles // the contents of some of them: read only once the skill among them is chosen
  sourceAt: (folder: string) => SkillSource // where a skill folder among them came from
  rootName: string // the name of the folder pointed at, for a skill there whose SKILL.md names none
}

/** A skill found where the user pointed: the name of its folder, and its files, read when asked for. */
export interface FoundSkill {
  folderName: string
  read: () => FetchedSkill
}

/** The skills at `input`, a GitHub link (a repository, or a folder in one) or a folder on this computer. */
export async function fetchSkills(input: string): Promise<FoundSkill[]> {
  return skillsIn(GITHUB_URL.test(input) ? await fromGitHub(input) : fromFolder(input))
}

/** The skills in a folder or a .zip / .skill archive the user picked on this computer. */
export function pickedSkills(picked: string): FoundSkill[] {
  const extension = path.extname(picked).slice(1).toLowerCase()
  return skillsIn(SKILL_ARCHIVE_EXTENSIONS.includes(extension) ? fromArchiveFile(picked) : fromFolder(picked))
}

/**
 * Every folder among the candidates with a SKILL.md, as `npx skills` finds them: one inside another skill's folder is
 * part of that skill. Throws when there is none, or when together they are too big to hold until the user answers.
 */
function skillsIn(candidates: Candidates): FoundSkill[] {
  const words = strings().harness.skills
  const folders = skillFolders(candidates)
  if (!folders.length) throw new Error(words.noSkill)
  const isInSkill = (file: string) => folders.some((folder) => !folder || file.startsWith(`${folder}/`))
  const bytes = [...candidates.sizes].reduce((sum, [file, size]) => (isInSkill(file) ? sum + size : sum), 0)
  if (bytes > MAX_UNPACKED_BYTES) throw new Error(words.tooLargeTogether(MAX_UNPACKED_BYTES / BYTES_PER_MB))
  return folders.map((folder) => ({
    folderName: path.posix.basename(folder) || candidates.rootName,
    read: () => readSkillAt(candidates, folder),
  }))
}

/** The files of the skill in `folder` ('' for the top) among the candidates, checked for size before they are read. */
function readSkillAt(candidates: Candidates, folder: string): FetchedSkill {
  const prefix = folder ? `${folder}/` : ''
  const chosen = [...candidates.sizes].filter(([file]) => file.startsWith(prefix))
  checkSize(
    chosen.length,
    chosen.reduce((sum, [, size]) => sum + size, 0),
  )
  const read = candidates.read(chosen.map(([file]) => file))
  return {
    files: new Map([...read].map(([file, data]) => [file.slice(prefix.length), data])),
    source: candidates.sourceAt(folder),
    folderName: path.posix.basename(folder) || candidates.rootName,
  }
}

async function fromGitHub(url: string): Promise<Candidates> {
  const [, owner = '', repo = '', after = ''] = GITHUB_URL.exec(url) ?? []
  const parts = decodeURIComponent(after).split('/').filter(Boolean)
  const refLengths = parts.length ? [...Array(Math.min(MAX_REF_PARTS, parts.length)).keys()].map((n) => n + 1) : [0]
  for (const length of refLengths) {
    const ref = length ? parts.slice(0, length).join('/') : 'HEAD'
    const archive = await download(`https://github.com/${owner}/${repo}/archive/${ref}.tar.gz`)
    if (archive) return fromArchive(archive, { owner, repo, ref, pointed: parts.slice(length).join('/') })
  }
  throw new Error('GitHub 上找不到这个仓库或分支：链接写错了，或者仓库是私有的（私有仓库装不了）')
}

interface ArchiveOf {
  owner: string
  repo: string
  ref: string
  pointed: string // the path inside the repository the link names, '' for its top
}

function fromArchive(archive: Buffer, { owner, repo, ref, pointed: linked }: ArchiveOf): Candidates {
  const entries = readTarball(archive, MAX_UNPACKED_BYTES)
  const top = entries[0]?.path.split('/')[0] ?? ''
  // GitHub names the top folder <repo>-<commit> when the link names no branch: record the commit, not the moving HEAD
  const commit = /-([0-9a-f]{40})$/.exec(top)?.[1]
  const pinned = ref === 'HEAD' && commit ? commit : ref
  const pointed = linked.replace(/\/?SKILL\.md$/i, '').replace(/\/$/, '')
  const files: SkillFiles = new Map()
  for (const { path: file, data } of entries) {
    const inRepo = file.slice(top.length + 1)
    if (pointed && !inRepo.startsWith(`${pointed}/`)) continue
    const relative = pointed ? inRepo.slice(pointed.length + 1) : inRepo
    if (!relative || relative.split('/').some(isJunk)) continue
    checkRelativePath(relative)
    files.set(relative, data)
  }
  if (!files.size) throw new Error(`仓库 ${owner}/${repo} 里没有 ${pointed || '任何文件'}`)
  const inRepo = (folder: string) => [pointed, folder].filter(Boolean).join('/')
  return {
    ...inMemory(files),
    sourceAt: (folder) => ({ kind: 'github', repo: `${owner}/${repo}`, path: inRepo(folder), ref: pinned }),
    rootName: path.posix.basename(pointed) || repo,
  }
}

/** The archive at `url`; null when GitHub has no such repository or ref. */
async function download(url: string): Promise<Buffer | null> {
  let response: Response
  try {
    response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  } catch (error) {
    throw new Error(`连不上 GitHub：${error instanceof Error ? error.message : String(error)}`)
  }
  if (response.status === 404) return null
  if (!response.ok || !response.body) throw new Error(`GitHub 下载失败（HTTP ${response.status}）`)
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > MAX_ARCHIVE_BYTES) throw new Error('仓库太大，超过 60 MB：请给技能所在文件夹的链接')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function fromFolder(input: string): Candidates {
  if (!path.isAbsolute(input) && !input.startsWith('~'))
    throw new Error('source 要么是 GitHub 链接，要么是用户电脑上技能文件夹的完整路径（以 / 或 ~ 开头）')
  const root = path.resolve(input.replace(/^~(?=$|[/\\])/, os.homedir()))
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
    throw new Error(strings().harness.skills.folderMissing(root))
  const sizes = new Map<string, number>()
  let visited = 0
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (++visited > MAX_FOLDER_ENTRIES) throw new Error(strings().harness.skills.folderTooBig(root))
      // links are not followed: a skill is what is in its folder
      if (isJunk(entry.name) || entry.isSymbolicLink()) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) sizes.set(path.relative(root, full).split(path.sep).join('/'), fs.statSync(full).size)
    }
  }
  walk(root)
  return {
    sizes,
    read: (chosen) => new Map(chosen.map((file) => [file, fs.readFileSync(path.join(root, file))])),
    sourceAt: (folder) => ({ kind: 'local', root, path: folder ? path.join(root, folder) : root }),
    rootName: path.basename(root),
  }
}

/** A .zip or .skill file on this computer, unpacked in memory. */
function fromArchiveFile(file: string): Candidates {
  if (fs.statSync(file).size > MAX_ARCHIVE_BYTES)
    throw new Error(strings().harness.skills.archiveTooLarge(MAX_ARCHIVE_BYTES / BYTES_PER_MB))
  const files: SkillFiles = new Map()
  for (const { path: inArchive, data } of readZipArchive(fs.readFileSync(file), MAX_UNPACKED_BYTES)) {
    if (inArchive.split('/').some(isJunk)) continue
    checkRelativePath(inArchive)
    files.set(inArchive, data)
  }
  return {
    ...inMemory(files),
    sourceAt: (folder) => ({ kind: 'local', root: file, path: path.join(file, folder) }),
    rootName: path.basename(file, path.extname(file)),
  }
}

/** Candidates whose files an archive already unpacked: each is read from memory. */
function inMemory(files: SkillFiles): Pick<Candidates, 'sizes' | 'read'> {
  return {
    sizes: new Map([...files].map(([file, data]) => [file, data.length])),
    read: (chosen) => {
      const wanted = new Set(chosen)
      return new Map([...files].filter(([file]) => wanted.has(file)))
    },
  }
}

/** The folders among the files that hold a SKILL.md and are not inside another one: the top alone ('') when it has one. */
function skillFolders({ sizes }: Candidates): string[] {
  if (sizes.has(SKILL_FILE)) return ['']
  const folders = [...sizes.keys()]
    .filter((file) => path.posix.basename(file) === SKILL_FILE)
    .map((file) => path.posix.dirname(file))
    .sort()
  return folders.filter((folder) => !folders.some((outer) => folder.startsWith(`${outer}/`)))
}
