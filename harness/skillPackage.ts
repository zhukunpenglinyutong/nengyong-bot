import { BYTES_PER_MB } from '../shared/limits'
import { isScript, SKILL_DESCRIPTION_MAX, SKILL_FILE, SkillName, splitFrontmatter } from '../shared/skill'
import { strings } from '../shared/strings'

const MAX_FILES = 500
const MAX_BYTES = 20 * BYTES_PER_MB

/** A skill's files by path relative to its folder, with forward slashes. */
export type SkillFiles = Map<string, Buffer>

/** What a skill folder holds, read from its SKILL.md and checked: what an install card shows and an install records. */
interface SkillPackage {
  name: string
  description: string
  version?: string
  fileCount: number
  scripts: string[]
  isUserInvoked: boolean
  isInternal: boolean // metadata.internal: left out when a link holds several skills, as `npx skills` does
  bytes: number
}

/** Throws unless a skill of `count` files and `bytes` in all is small enough to install: checked before any is read. */
export function checkSize(count: number, bytes: number) {
  const words = strings().harness.skills
  if (count > MAX_FILES) throw new Error(words.tooManyFiles(count, MAX_FILES))
  if (bytes > MAX_BYTES) throw new Error(words.tooLarge(Math.round(bytes / BYTES_PER_MB), MAX_BYTES / BYTES_PER_MB))
}

/** Throws a reason the user (or the model, to pass on) can read unless `files` is a skill folder this app installs. */
export function checkPackage(files: SkillFiles, folderName: string): SkillPackage {
  const words = strings().harness.skills
  const skillFile = files.get(SKILL_FILE)
  if (!skillFile) throw new Error(words.noSkillFile)
  checkDistinct([...files.keys()])
  const fields = frontmatter(skillFile.toString('utf8'))
  const name = fields.name ?? folderName
  if (!SkillName.safeParse(name).success) throw new Error(words.badName(name))
  const description = fields.description?.trim()
  if (!description) throw new Error(words.noDescription)
  const version = fields.version ?? fields['metadata.version']
  return {
    name,
    description: description.slice(0, SKILL_DESCRIPTION_MAX),
    ...(version ? { version } : {}),
    fileCount: files.size,
    scripts: [...files.keys()].filter(isScript).sort(),
    isUserInvoked: fields['disable-model-invocation'] === 'true',
    isInternal: ['true', '1'].includes(fields['metadata.internal'] ?? ''),
    bytes: [...files.values()].reduce((sum, data) => sum + data.length, 0),
  }
}

/**
 * Throws when two paths are one file on a disk that ignores case or Unicode form (macOS's, Windows'): the one written
 * last would replace the other, and what is installed would not be what the user looked at.
 */
function checkDistinct(paths: string[]) {
  const seen = new Map<string, string>()
  for (const file of paths) {
    const key = file.normalize('NFC').toLowerCase()
    const other = seen.get(key)
    if (other) throw new Error(strings().harness.skills.sameFile(other, file))
    seen.set(key, file)
  }
}

/** Throws unless a path from an archive or a folder stays inside the skill's folder once joined to it. */
export function checkRelativePath(file: string) {
  const parts = file.split('/')
  const isSafe =
    !file.includes('\\') && !file.includes(':') && parts.every((part) => part !== '' && part !== '.' && part !== '..')
  if (!isSafe) throw new Error(strings().harness.skills.unsafePath(file))
}

/** Files that are never part of a skill: version control, caches, and the litter macOS leaves in folders and archives. */
export const isJunk = (part: string) =>
  ['.git', '.DS_Store', '__MACOSX', 'node_modules', '__pycache__'].includes(part) || part.startsWith('._')

/**
 * The keys of SKILL.md's YAML front matter, as far as skills use it: `key: value` (plain or quoted, a plain one without
 * its # comment), block scalars (`|`, `>` and their `-` forms), and one level of nesting, read as `parent.key`.
 */
export function frontmatter(text: string): Record<string, string> {
  const { head } = splitFrontmatter(text)
  const fields: Record<string, string> = {}
  const lines = head.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const pair = /^([\w-]+):\s*(.*)$/.exec(lines[index])
    if (!pair) continue
    const [, key, value] = pair
    const indented: string[] = []
    while (index + 1 < lines.length && /^(\s+\S|\s*$)/.test(lines[index + 1])) indented.push(lines[++index])
    if (/^[|>][-+]?$/.test(value)) {
      const body = indented.map((line) => line.trim())
      fields[key] = (value.startsWith('|') ? body.join('\n') : body.filter(Boolean).join(' ')).trim()
      continue
    }
    if (value === '') {
      for (const line of indented) {
        const nested = /^\s+([\w-]+):\s*(.*)$/.exec(line)
        if (nested) fields[`${key}.${nested[1]}`] = scalar(nested[2])
      }
      continue
    }
    fields[key] = scalar([value, ...indented.map((line) => line.trim())].join(' ').trim())
  }
  return fields
}

/** SKILL.md without its front matter: the instructions a task reads. */
export const skillBody = (text: string) => splitFrontmatter(text).body.trim()

function scalar(value: string): string {
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1)
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1')
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) return value.slice(1, -1).replace(/''/g, "'")
  return value.replace(/\s+#.*$/, '')
}
