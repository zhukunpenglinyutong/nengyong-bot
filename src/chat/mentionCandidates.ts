import type { Bot } from '../../shared/bot'
import type { SidebarState } from '../../shared/sidebar'
import { inSidebarOrder } from '../sidebarView'

export interface MentionCandidate {
  bot: Bot
  group?: string // its sidebar section; none in 其他
}

/** The bots an @ in the message box offers: the sidebar's order; once the user types, hidden ones too, names starting with the query first. */
export function mentionCandidates(sidebar: SidebarState, selfId: string, query: string): MentionCandidate[] {
  const needle = query.toLowerCase()
  const startsWithQuery = (bot: Bot) => bot.name.toLowerCase().startsWith(needle)
  return inSidebarOrder(sidebar)
    .filter((bot) => needle !== '' || !sidebar.hidden.includes(bot.id))
    .filter((bot) => bot.id !== selfId && bot.name.toLowerCase().includes(needle))
    .sort((a, b) => Number(startsWithQuery(b)) - Number(startsWithQuery(a)))
    .map((bot) => ({ bot, group: sidebar.sections.find((section) => section.id === sidebar.placement[bot.id])?.name }))
}

/** The @ being typed right before the caret: at the start or after whitespace, with no whitespace after it. */
export function mentionQuery(text: string, caret: number): { start: number; end: number; query: string } | null {
  const match = /(?:^|\s)@(\S*)$/.exec(text.slice(0, caret))
  if (!match) return null
  const query = match[1] ?? ''
  return { start: caret - query.length - 1, end: caret, query }
}
