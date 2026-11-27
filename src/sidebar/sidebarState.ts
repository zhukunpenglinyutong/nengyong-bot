import { BOT_NAME_MAX, type Bot, MAIN_BOT, MAIN_BOT_ID, type NewBot, type SectionByName } from '../../shared/bot'
import { DISMISSED_KEEP_DAYS, SECTION_NAME_MAX, type SidebarState } from '../../shared/sidebar'
import type { OutfitId } from '../../shared/outfit'
import { strings } from '../../shared/strings'

export const HIDDEN_NAME = strings().sidebar.sections.hidden
const NEW_SECTION_NAME = strings().sidebar.sections.untitled

export const INITIAL_SIDEBAR: SidebarState = {
  bots: [MAIN_BOT],
  sections: [],
  placement: {},
  pinned: [MAIN_BOT_ID],
  hidden: [],
  unread: {},
  seenAt: {},
  ungroupedCollapsed: false,
  hiddenCollapsed: true,
  dismissed: [],
}

const toggleIn = (list: string[], id: string, on: boolean) =>
  on ? [...list.filter((x) => x !== id), id] : list.filter((x) => x !== id)
const cleanName = (name: string, max: number) => name.trim().slice(0, max)

export const togglePin = (state: SidebarState, id: string): SidebarState => ({
  ...state,
  pinned: toggleIn(state.pinned, id, !state.pinned.includes(id)),
})

/** `null` moves the bot back to 其他. */
export function moveToSection(state: SidebarState, id: string, sectionId: string | null): SidebarState {
  const { [id]: _previous, ...placement } = state.placement
  return { ...state, placement: sectionId === null ? placement : { ...placement, [id]: sectionId } }
}

/** New section appended after the others, with the bot moved into it. */
export function createSectionWith(state: SidebarState, botId: string, id: string): SidebarState {
  const sections = [...state.sections, { id, name: NEW_SECTION_NAME, collapsed: false }]
  return moveToSection({ ...state, sections }, botId, id)
}

export function renameSection(state: SidebarState, sectionId: string, name: string): SidebarState {
  const clean = cleanName(name, SECTION_NAME_MAX)
  return clean
    ? { ...state, sections: state.sections.map((s) => (s.id === sectionId ? { ...s, name: clean } : s)) }
    : state
}

export function moveSection(state: SidebarState, sectionId: string, dir: -1 | 1): SidebarState {
  const from = state.sections.findIndex((s) => s.id === sectionId)
  const to = from + dir
  if (from < 0 || to < 0 || to >= state.sections.length) return state
  const sections = [...state.sections]
  ;[sections[from], sections[to]] = [sections[to], sections[from]]
  return { ...state, sections }
}

/** Deleting a section never deletes bots, they fall back to 其他. */
export const deleteSection = (state: SidebarState, sectionId: string): SidebarState => ({
  ...state,
  sections: state.sections.filter((s) => s.id !== sectionId),
  placement: Object.fromEntries(Object.entries(state.placement).filter(([, placed]) => placed !== sectionId)),
})

export const toggleSection = (state: SidebarState, sectionId: string): SidebarState => ({
  ...state,
  sections: state.sections.map((s) => (s.id === sectionId ? { ...s, collapsed: !s.collapsed } : s)),
})

/** One more reply the user has not seen yet. */
export const addUnread = (state: SidebarState, id: string): SidebarState => ({
  ...state,
  unread: { ...state.unread, [id]: (state.unread[id] ?? 0) + 1 },
})

/** The user is looking at these bots' chats at `at`: what failed until then is not news to them. */
export const markSeen = (state: SidebarState, ids: string[], at: number): SidebarState => ({
  ...state,
  seenAt: { ...state.seenAt, ...Object.fromEntries(ids.map((id) => [id, at])) },
})

/** Bots never looked at count as seen at `at`: the failures from before the sidebar showed them are old news. */
export const markUnseenAsSeen = (state: SidebarState, at: number): SidebarState =>
  markSeen(
    state,
    state.bots.flatMap((bot) => (bot.id in state.seenAt ? [] : [bot.id])),
    at,
  )

/** Off clears the count; on (标为未读) gives a bot with nothing new one unseen reply. */
export function setUnread(state: SidebarState, id: string, on: boolean): SidebarState {
  if (id in state.unread === on) return state
  const { [id]: _cleared, ...rest } = state.unread
  return { ...state, unread: on ? { ...rest, [id]: 1 } : rest }
}

/** Hiding also unpins, otherwise the bot would linger in the pinned grid. */
export const setHidden = (state: SidebarState, id: string, on: boolean): SidebarState => ({
  ...state,
  hidden: toggleIn(state.hidden, id, on),
  pinned: on ? state.pinned.filter((x) => x !== id) : state.pinned,
})

export function renameBot(state: SidebarState, id: string, name: string): SidebarState {
  const clean = cleanName(name, BOT_NAME_MAX)
  return clean ? { ...state, bots: state.bots.map((bot) => (bot.id === id ? { ...bot, name: clean } : bot)) } : state
}

export const setBotLook = (
  state: SidebarState,
  id: string,
  { shape, color }: Pick<Bot, 'shape' | 'color'>,
): SidebarState => ({
  ...state,
  bots: state.bots.map((bot) => (bot.id === id ? { ...bot, shape, color, avatar: undefined } : bot)),
})

export const setBotOutfit = (state: SidebarState, id: string, outfit: OutfitId[]): SidebarState => ({
  ...state,
  bots: state.bots.map((bot) => (bot.id === id ? { ...bot, outfit } : bot)),
})

/** An uploaded picture takes the place of the look; undefined puts the shape back. */
export const setBotAvatar = (state: SidebarState, id: string, avatar: string | undefined): SidebarState => ({
  ...state,
  bots: state.bots.map((bot) => (bot.id === id ? { ...bot, avatar } : bot)),
})

/** A new bot lands where `placeBot` puts it. Adding a bot that is already there changes nothing. */
export function createBot(state: SidebarState, { section, ...bot }: NewBot): SidebarState {
  if (state.bots.some((known) => known.id === bot.id)) return state
  const added = { ...state, bots: [...state.bots, { ...bot, name: cleanName(bot.name, BOT_NAME_MAX) }] }
  return placeBot(added, bot.id, section)
}

/**
 * Moves a bot into the section of that name, appended as a new one when there is none, or into 其他 when absent;
 * expanded so it is visible. By name: two moves into a section that does not exist yet make it once.
 */
export function placeBot(state: SidebarState, botId: string, section: SectionByName | undefined): SidebarState {
  if (!section) return { ...moveToSection(state, botId, null), ungroupedCollapsed: false }
  const target = state.sections.find((candidate) => candidate.name === section.name) ?? { ...section, collapsed: false }
  const sections = state.sections.includes(target) ? state.sections : [...state.sections, target]
  return {
    ...moveToSection(state, botId, target.id),
    sections: sections.map((candidate) => (candidate === target ? { ...target, collapsed: false } : candidate)),
  }
}

/** Lets a bot go at `at`: out of the sidebar with every reference to it, kept in `dismissed` until `restoreBot`. */
export function dismissBot(state: SidebarState, id: string, at: number): SidebarState {
  const bot = state.bots.find((candidate) => candidate.id === id)
  if (!bot || id === MAIN_BOT_ID) return state // the main bot is the entry point and cannot leave
  const { [id]: sectionId, ...placement } = state.placement
  const { [id]: _unread, ...unread } = state.unread
  const { [id]: _seenAt, ...seenAt } = state.seenAt
  const drop = (list: string[]) => list.filter((x) => x !== id)
  return {
    ...state,
    bots: state.bots.filter((candidate) => candidate.id !== id),
    placement,
    pinned: drop(state.pinned),
    hidden: drop(state.hidden),
    unread,
    seenAt,
    dismissed: [...state.dismissed, { bot, sectionId, at }],
  }
}

/** Brings a bot let go back into the section it was in, or into 其他 when that section is gone. */
export function restoreBot(state: SidebarState, id: string): SidebarState {
  const dismissed = state.dismissed.find(({ bot }) => bot.id === id)
  if (!dismissed) return state
  const rest = { ...state, dismissed: state.dismissed.filter((candidate) => candidate !== dismissed) }
  const section = state.sections.find((candidate) => candidate.id === dismissed.sectionId)
  return createBot(rest, { ...dismissed.bot, section })
}

/** Drops a bot from the recycle bin after the harness deleted its data. */
export function forgetBot(state: SidebarState, id: string): SidebarState {
  const dismissed = state.dismissed.some(({ bot }) => bot.id === id)
  return dismissed ? { ...state, dismissed: state.dismissed.filter(({ bot }) => bot.id !== id) } : state
}

const DAY_MS = 86_400_000

/** Whole days left to restore a bot let go at `at`; 0 once it is gone for good. */
export const daysLeftOf = (at: number, now: number) =>
  Math.max(0, Math.ceil((at + DISMISSED_KEEP_DAYS * DAY_MS - now) / DAY_MS))

/** Drops the bots let go whose days to be restored have run out. */
export const withoutExpired = (state: SidebarState, now: number): SidebarState => ({
  ...state,
  dismissed: state.dismissed.filter(({ at }) => daysLeftOf(at, now) > 0),
})
