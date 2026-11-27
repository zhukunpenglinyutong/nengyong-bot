import { z } from 'zod'
import { type Bot, MAIN_BOT, MAIN_BOT_ID, StoredBot } from './bot'
import { listOf } from './listOf'

/** User-editable sidebar organisation: which bots exist and how they are arranged. Saved by the main process. */
export interface SidebarState {
  bots: Bot[] // every bot, the main one first
  sections: Section[] // ordered, excludes the fixed 其他 bucket
  placement: Record<string, string> // botId -> section id; absent = 其他
  pinned: string[] // ordered
  hidden: string[]
  unread: Record<string, number> // botId -> replies the user has not seen yet; absent = nothing new
  seenAt: Record<string, number> // botId -> when the user last opened or left its chat; a task that failed before then is not flagged
  ungroupedCollapsed: boolean
  hiddenCollapsed: boolean
}

export interface Section {
  id: string
  name: string
  collapsed: boolean
}

export const SECTION_NAME_MAX = 80
const MAX_CREATED_BOTS = 200

const StoredSection = z.object({
  id: z.string(),
  name: z.string().transform((name) => name.slice(0, SECTION_NAME_MAX)),
  collapsed: z.boolean().catch(false),
})

// every field falls back on its own: one broken field does not reset the whole sidebar
const Stored = z.object({
  bots: listOf(StoredBot).catch([]),
  sections: listOf(StoredSection).catch([]),
  placement: z.record(z.string(), z.string().catch('')).catch({}),
  pinned: listOf(z.string()).catch([MAIN_BOT_ID]),
  hidden: listOf(z.string()).catch([]),
  unread: z
    .union([
      z.record(z.string(), z.number().int().min(1).catch(1)),
      // older saves kept only which bots had something new: each of them counts as one
      listOf(z.string()).transform((ids) => Object.fromEntries(ids.map((id) => [id, 1]))),
    ])
    .catch({}),
  seenAt: z.record(z.string(), z.number().catch(0)).catch({}),
  ungroupedCollapsed: z.boolean().catch(false),
  hiddenCollapsed: z.boolean().catch(true),
})

/** Parses a sidebar from the renderer or the database. Only a value that is not an object at all fails. */
export const SidebarState = Stored.transform(withoutDanglingReferences)

/** Drops references to bots and sections that no longer exist, and puts the main bot first even if it was missing. */
function withoutDanglingReferences(stored: z.infer<typeof Stored>): SidebarState {
  const main = stored.bots.find((bot) => bot.id === MAIN_BOT_ID) ?? MAIN_BOT
  const others = stored.bots.filter(
    (bot, index) => bot.id !== MAIN_BOT_ID && stored.bots.findIndex((other) => other.id === bot.id) === index,
  )
  const bots = [main, ...others.slice(0, MAX_CREATED_BOTS)]
  const botIds = new Set(bots.map((bot) => bot.id))
  const sectionIds = new Set(stored.sections.map((section) => section.id))
  const known = (ids: string[]) => [...new Set(ids)].filter((id) => botIds.has(id))
  return {
    ...stored,
    bots,
    placement: Object.fromEntries(
      Object.entries(stored.placement).filter(([botId, sectionId]) => botIds.has(botId) && sectionIds.has(sectionId)),
    ),
    pinned: known(stored.pinned),
    hidden: known(stored.hidden),
    unread: Object.fromEntries(Object.entries(stored.unread).filter(([botId]) => botIds.has(botId))),
    seenAt: Object.fromEntries(Object.entries(stored.seenAt).filter(([botId]) => botIds.has(botId))),
  }
}

/** Every reply waiting unread, all bots together: the sidebar's unread filter and the number on the app icon. */
export const unreadTotal = (sidebar: SidebarState): number =>
  Object.values(sidebar.unread).reduce((sum, count) => sum + count, 0)
