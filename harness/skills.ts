import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { MAIN_BOT_ID } from '../shared/bot'
import type { HarnessEvent } from '../shared/bridge'
import { newId } from '../shared/newId'
import {
  isScript,
  type OfferedSkill,
  SKILL_FILE,
  Skill,
  type SkillFileView,
  type SkillOffer,
  type SkillRef,
  type SkillView,
} from '../shared/skill'
import { strings } from '../shared/strings'
import { checkPackage, isJunk, type SkillFiles, skillBody } from './skillPackage'
import { type FoundSkill, fetchSkills, pickedSkills } from './skillSource'
import type { Store } from './store'

const OFFER_TTL_MS = 30 * 60_000
const MAX_SKILLS = 150 // per bot, and on one card: each one is listed in every system prompt of its chat and tasks
const MAX_INSTRUCTIONS_CHARS = 40_000
const MAX_LISTED_FILES = 300
const MAX_TEXT_BYTES = 400_000 // a bigger file is not shown in the files dialog
const STAGING_PREFIX = '.installing-'

/** What use_skill records: the skill it opened, as <bot id>/<name>; what the panel counts as one use. */
const Used = z.object({ used: z.string() })

interface Offer {
  view: SkillOffer
  chatBotId: string | null // the chat whose card it is; null: uploaded in the bot's panel, answered there
  packages: { skill: OfferedSkill; files: SkillFiles }[] // the skills of the view, with their files
  at: number
}

interface SkillsOptions {
  dir: string // the data dir's skills/: one folder per bot, one per skill in it
  store: Store
  emit: (event: HarnessEvent) => void
}

/**
 * The skills of every bot: installed only once the user says yes to a card, one a bot's install_skill put in its chat
 * or one an upload in its panel showed. What a bot has is in its brain; the files are in the skills folder.
 */
export function createSkills({ dir, store, emit }: SkillsOptions) {
  const offers = new Map<string, Offer>()
  const folderOf = (botId: string, name: string) => path.join(dir, botId, name)
  const skillsOf = (botId: string) => store.get().bots[botId]?.skills ?? []
  if (fs.existsSync(dir))
    for (const entry of fs.readdirSync(dir))
      if (entry.startsWith(STAGING_PREFIX)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true })

  /** Reads and checks the skills at `source` for `botId`; nothing is installed until the user answers their card. */
  async function offer(chatBotId: string, botId: string, source: string): Promise<SkillOffer> {
    return offerOf(chatBotId, botId, await fetchSkills(source))
  }

  /** Reads and checks the skills in a folder or archive the user picked in `botId`'s panel: one card, answered there. */
  function upload(botId: string, picked: string): SkillOffer {
    if (!store.get().bots[botId]) throw new Error(strings().harness.unknownBot(botId))
    return offerOf(null, botId, pickedSkills(picked))
  }

  /**
   * One card for the skills found. Among several, the ones that cannot be installed are listed on it with the reason,
   * internal ones are left out, and of two with one name the first is kept; a single one that cannot be installed throws.
   */
  function offerOf(chatBotId: string | null, botId: string, found: FoundSkill[]): SkillOffer {
    const words = strings().harness.skills
    if (found.length > MAX_SKILLS) throw new Error(words.tooManySkills(found.length, MAX_SKILLS))
    const packages: Offer['packages'] = []
    const skipped: SkillOffer['skipped'] = []
    for (const each of found) {
      try {
        const fetched = each.read()
        const { isInternal, ...checked } = checkPackage(fetched.files, fetched.folderName)
        if ((isInternal && found.length > 1) || packages.some(({ skill }) => skill.name === checked.name)) continue
        const known = skillsOf(botId).find((skill) => skill.name === checked.name)
        const skill = { ...checked, source: fetched.source, replaces: known ? (known.version ?? '') : null }
        packages.push({ skill, files: fetched.files })
      } catch (error) {
        if (found.length === 1) throw error
        skipped.push({ folder: each.folderName, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    if (!packages.length) throw new Error(skipped.length ? words.noneInstallable(skipped) : words.noSkill)
    const view: SkillOffer = { offer: newId('k'), botId, skills: packages.map(({ skill }) => skill), skipped }
    const now = Date.now()
    for (const [id, waiting] of offers) if (now - waiting.at > OFFER_TTL_MS) offers.delete(id)
    offers.set(view.offer, { view, chatBotId, packages, at: now })
    return view
  }

  /** The user's answer to a card in `chatBotId`'s chat: installs the skills ticked, none to turn it down. */
  function answer(chatBotId: string, offerId: string, names: string[]) {
    return settle(offerId, (found) => found.chatBotId === chatBotId, names, strings().harness.skills.offerGone)
  }

  /** The user's answer to a card an upload showed in `botId`'s panel: installs the ones ticked, and puts nothing in the chat. */
  function answerUpload(botId: string, offerId: string, names: string[]) {
    const isFromPanel = (found: Offer) => found.chatBotId === null && found.view.botId === botId
    settle(offerId, isFromPanel, names, strings().harness.skills.uploadGone)
  }

  function settle(offerId: string, isAnswerable: (found: Offer) => boolean, names: string[], gone: string) {
    const found = offers.get(offerId)
    if (!found || !isAnswerable(found) || Date.now() - found.at > OFFER_TTL_MS) throw new Error(gone)
    const unknown = names.find((name) => !found.view.skills.some((skill) => skill.name === name))
    if (unknown) throw new Error(strings().harness.skills.notFound(unknown))
    // the card stays answerable until the install went through: a failed one can be tried again
    install(found, names)
    offers.delete(offerId)
    return { botId: found.view.botId, names }
  }

  function install({ view, packages }: Offer, names: string[]) {
    const { botId } = view
    const chosen = packages.filter(({ skill }) => names.includes(skill.name))
    const added = chosen.filter(({ skill }) => !skillsOf(botId).some((each) => each.name === skill.name)).length
    if (skillsOf(botId).length + added > MAX_SKILLS)
      throw new Error(strings().harness.skills.full(MAX_SKILLS, MAX_SKILLS - skillsOf(botId).length))
    try {
      for (const { skill, files } of chosen) {
        placeFiles(path.join(dir, `${STAGING_PREFIX}${view.offer}-${skill.name}`), folderOf(botId, skill.name), files)
        const record = Skill.parse({ ...skill, installedAt: Date.now() }) // drops what only the card needs
        store.updateBot(botId, { skills: [...skillsOf(botId).filter((each) => each.name !== record.name), record] })
      }
    } finally {
      if (chosen.length) publish(botId)
    }
  }

  /** Removes the skills named, a whole collection at once if asked: none of them when one is not there. */
  function remove(botId: string, names: string[]) {
    const unknown = names.find((name) => !skillsOf(botId).some((skill) => skill.name === name))
    if (unknown) throw new Error(strings().harness.skills.notFound(unknown))
    store.updateBot(botId, { skills: skillsOf(botId).filter((skill) => !names.includes(skill.name)) })
    for (const name of names) fs.rmSync(folderOf(botId, name), { recursive: true, force: true })
    publish(botId)
  }

  /** What `botId`'s panel lists: its own skills, or every bot's for the main bot, who can use them all. */
  function views(botId: string): SkillView[] {
    const owners =
      botId === MAIN_BOT_ID ? [MAIN_BOT_ID, ...store.get().roster.filter((id) => id !== MAIN_BOT_ID)] : [botId]
    const usedAt = useTimes([...new Set([...owners, MAIN_BOT_ID])])
    return owners.flatMap((owner) =>
      skillsOf(owner).map((skill) => {
        const times = usedAt.get(`${owner}/${skill.name}`) ?? []
        return { ...skill, botId: owner, uses: times.length, lastUsedAt: times.at(-1) ?? null }
      }),
    )
  }

  /** When each skill was opened by use_skill, by <bot id>/<name>, oldest first. */
  function useTimes(botIds: string[]): Map<string, number[]> {
    const times = new Map<string, number[]>()
    for (const botId of botIds)
      for (const entry of store.toolEntries(botId, 'use_skill')) {
        const used = entry.kind === 'tool' ? Used.safeParse(entry.output).data?.used : undefined
        if (used) times.set(used, [...(times.get(used) ?? []), entry.at])
      }
    for (const [key, list] of times)
      times.set(
        key,
        [...list].sort((a, b) => a - b),
      )
    return times
  }

  function publish(botId: string) {
    emit({ kind: 'skills', botId, skills: views(botId) })
    if (botId !== MAIN_BOT_ID) emit({ kind: 'skills', botId: MAIN_BOT_ID, skills: views(MAIN_BOT_ID) })
  }

  /** The files of an installed skill or of one a card offers, SKILL.md first. */
  function files(ref: SkillRef): SkillFileView[] {
    const rank = (file: string) => (file === SKILL_FILE ? 0 : 1)
    return [...contentsOf(ref)]
      .map(([file, read]) => ({ path: file, bytes: read().length, isScript: isScript(file) }))
      .sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path))
  }

  /** One file's text for the files dialog; null when it is not text or too big to show. */
  function file(ref: SkillRef, filePath: string): string | null {
    const read = contentsOf(ref).get(filePath)
    if (!read) throw new Error(strings().harness.skills.fileGone(filePath))
    const data = read()
    if (data.length > MAX_TEXT_BYTES || data.subarray(0, 8000).includes(0)) return null
    return data.toString('utf8')
  }

  /** The files by path, each read only when asked for: the dialog lists a folder without loading every file. */
  function contentsOf(ref: SkillRef): Map<string, () => Buffer> {
    if (ref.kind === 'offer') {
      const found = offers.get(ref.offer)?.packages.find(({ skill }) => skill.name === ref.name)
      if (!found) throw new Error(strings().harness.skills.offerGone)
      return new Map([...found.files].map(([file, data]) => [file, () => data]))
    }
    if (!skillsOf(ref.botId).some((skill) => skill.name === ref.name))
      throw new Error(strings().harness.skills.notFound(ref.name))
    const root = folderOf(ref.botId, ref.name)
    return new Map(listFolder(root).map((file) => [file, () => fs.readFileSync(path.join(root, file))]))
  }

  /**
   * use_skill: SKILL.md's instructions and where its files are, for a task of `taskBotId`. A bot opens its own skills;
   * the main bot opens anyone's, as <bot id>/<name>.
   */
  function use(taskBotId: string, wanted: string) {
    const { owner, skill } = resolve(taskBotId, wanted)
    const folder = folderOf(owner, skill.name)
    const skillFile = path.join(folder, SKILL_FILE)
    if (!fs.existsSync(skillFile)) throw new Error(`技能 ${skill.name} 的文件不见了：请用户重新装一次`)
    const body = skillBody(fs.readFileSync(skillFile, 'utf8'))
    const isLong = body.length > MAX_INSTRUCTIONS_CHARS
    const listed = listFolder(folder)
    return {
      used: `${owner}/${skill.name}`,
      folder,
      instructions: isLong
        ? `${body.slice(0, MAX_INSTRUCTIONS_CHARS)}\n……（太长，后面的用 read_file 读 ${skillFile}）`
        : body,
      files: listed.slice(0, MAX_LISTED_FILES),
      ...(listed.length > MAX_LISTED_FILES ? { moreFiles: listed.length - MAX_LISTED_FILES } : {}),
    }
  }

  function resolve(taskBotId: string, wanted: string): { owner: string; skill: Skill } {
    const usable = taskBotId === MAIN_BOT_ID ? [...new Set([MAIN_BOT_ID, ...store.get().roster])] : [taskBotId]
    const slash = wanted.indexOf('/')
    const owners = slash === -1 ? usable : usable.filter((id) => id === wanted.slice(0, slash))
    const name = wanted.slice(slash + 1)
    const matches = owners.flatMap((owner) =>
      skillsOf(owner).flatMap((skill) => (skill.name === name ? [{ owner, skill }] : [])),
    )
    const chosen = matches.find((match) => match.owner === taskBotId) ?? (matches.length === 1 ? matches[0] : undefined)
    if (chosen) return chosen
    const list = usable.flatMap((id) =>
      skillsOf(id).map((skill) => (id === taskBotId ? skill.name : `${id}/${skill.name}`)),
    )
    const reason = matches.length > 1 ? `好几个 Bot 都有 ${name}，写成「Bot id/${name}」` : `没有你能用的技能 ${wanted}`
    throw new Error(`${reason}。你能用的：${list.join('、') || '无'}`)
  }

  /** The folder of a skill `botId` has, to show in Finder. */
  function folder(botId: string, name: string): string {
    if (!skillsOf(botId).some((skill) => skill.name === name)) throw new Error(strings().harness.skills.notFound(name))
    return folderOf(botId, name)
  }

  return { offer, upload, answer, answerUpload, remove, views, files, file, folder, use }
}

export type Skills = ReturnType<typeof createSkills>

/** Writes a skill's files to `staging`, then puts that in place of `target`: the version there stays until the new one is in. */
function placeFiles(staging: string, target: string, files: SkillFiles) {
  const replaced = `${staging}-replaced`
  try {
    for (const [file, data] of files) {
      fs.mkdirSync(path.dirname(path.join(staging, file)), { recursive: true })
      fs.writeFileSync(path.join(staging, file), data)
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (fs.existsSync(target)) fs.renameSync(target, replaced)
    fs.renameSync(staging, target)
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true })
    if (fs.existsSync(replaced) && !fs.existsSync(target)) fs.renameSync(replaced, target)
    throw error
  }
  fs.rmSync(replaced, { recursive: true, force: true })
}

/** Every file in a skill's folder, relative to it with forward slashes; links and junk are left out. */
function listFolder(root: string): string[] {
  if (!fs.existsSync(root)) return []
  const found: string[] = []
  const walk = (folder: string) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (isJunk(entry.name) || entry.isSymbolicLink()) continue
      const full = path.join(folder, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) found.push(path.relative(root, full).split(path.sep).join('/'))
    }
  }
  walk(root)
  return found.sort()
}
