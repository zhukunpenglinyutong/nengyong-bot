import { z } from 'zod'
import { BotId } from './bot'

/** The file a skill folder is: its name and description up top, then the instructions. */
export const SKILL_FILE = 'SKILL.md'

/**
 * A SKILL.md split at its YAML front matter: `head` is what is between the --- lines ('' without any), `body` the
 * instructions after them. A byte order mark some editors save is not part of either.
 */
export function splitFrontmatter(text: string): { head: string; body: string } {
  const plain = text.replace(/^\uFEFF/, '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(plain)
  return match ? { head: match[1], body: plain.slice(match[0].length) } : { head: '', body: plain }
}

/** How a skill is named in SKILL.md, in prompts and on disk: lowercase letters, digits and dashes. */
export const SkillName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
export const SKILL_DESCRIPTION_MAX = 1024

/**
 * Where a skill came from: a folder of a GitHub repository at a ref, or a folder on this computer inside `root`, the
 * folder or archive the user pointed at.
 */
export const SkillSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('github'), repo: z.string(), path: z.string(), ref: z.string() }),
  z.object({ kind: z.literal('local'), root: z.string(), path: z.string() }),
])
export type SkillSource = z.infer<typeof SkillSource>

/** A skill installed on one bot: its SKILL.md and the files beside it live in the data dir's skills/<bot id>/<name>/. */
export const Skill = z.object({
  name: SkillName,
  description: z.string(),
  version: z.string().optional(),
  source: SkillSource,
  installedAt: z.number(),
  fileCount: z.number(),
  scripts: z.array(z.string()), // paths of the files a task may run, relative to the skill's folder
  // SKILL.md's disable-model-invocation: used only when the user names it, so prompts list its name without the description
  isUserInvoked: z.boolean().default(false),
})
export type Skill = z.infer<typeof Skill>

/** A skill as the panel lists it: whose it is, and how often its bot's tasks (or the main bot's) read it. */
export interface SkillView extends Skill {
  botId: string
  uses: number
  lastUsedAt: number | null
}

/** One skill on an install card, read and checked. `replaces`: the bot already has one by that name (its version, or ''). */
export const OfferedSkill = Skill.omit({ installedAt: true }).extend({
  bytes: z.number(),
  replaces: z.string().nullable(),
})
export type OfferedSkill = z.infer<typeof OfferedSkill>

/**
 * An install card: what install_skill hands back to the chat, or an upload to the panel. It holds every skill found
 * where the user pointed, none installed until the user ticks them and says so; `skipped`: the ones found that cannot be.
 */
export const SkillOffer = z.object({
  offer: z.string(),
  botId: z.string(),
  skills: z.array(OfferedSkill).min(1),
  skipped: z.array(z.object({ folder: z.string(), reason: z.string() })),
})
export type SkillOffer = z.infer<typeof SkillOffer>

/** How long an install card can be answered: its skills are kept in memory that long, and not past a restart. */
export const SKILL_OFFER_TTL_MS = 30 * 60_000

/** What the user picks in a bot's panel to upload: a skill folder, or a .zip or .skill archive of one or several. */
export const SkillUploadKind = z.enum(['folder', 'archive'])
export type SkillUploadKind = z.infer<typeof SkillUploadKind>

/** The archives an upload takes; a .skill file is a .zip under another name. */
export const SKILL_ARCHIVE_EXTENSIONS = ['zip', 'skill']

/** One file of a skill, for its files dialog. */
export interface SkillFileView {
  path: string // relative to the skill's folder, with forward slashes
  bytes: number
  isScript: boolean
}

/** Which skill's files to read: one a bot has, or one of those an install card offers. */
export const SkillRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('installed'), botId: BotId, name: SkillName }),
  z.object({ kind: z.literal('offer'), offer: z.string().min(1).max(100), name: SkillName }),
])
export type SkillRef = z.infer<typeof SkillRef>

const SCRIPT_EXTENSIONS = [
  '.py',
  '.sh',
  '.bash',
  '.zsh',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.rb',
  '.pl',
  '.ps1',
  '.bat',
  '.cmd',
]

/** A file a task may run with run_command: by its extension, wherever it sits. */
export const isScript = (path: string) => SCRIPT_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension))

/** SKILL.md first, then by path: the order a skill's files are listed in. */
export const bySkillFileOrder = (a: { path: string }, b: { path: string }) =>
  Number(b.path === SKILL_FILE) - Number(a.path === SKILL_FILE) || a.path.localeCompare(b.path)
