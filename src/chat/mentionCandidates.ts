import type { Bot } from '../../shared/bot'
import type { SidebarState } from '../../shared/sidebar'
import { inSidebarOrder } from '../sidebarView'
import { isItem, type MenuEntry } from '../ui/ContextMenu'
import type { IconName } from '../ui/Icon'

interface BotCandidate {
  kind: 'bot'
  bot: Bot
  group?: string // its sidebar section; none in 其他
}

interface ActionCandidate {
  kind: 'action'
  label: string
  icon?: IconName
  detail?: string // which of its submenu's items it is
  onSelect?: () => void
}

export type MentionCandidate = BotCandidate | ActionCandidate

/** The bots an @ in the message box offers: the sidebar's order; once the user types, hidden ones too, names starting with the query first. */
export function mentionCandidates(sidebar: SidebarState, selfId: string, query: string): BotCandidate[] {
  const needle = query.toLowerCase()
  const startsWithQuery = (bot: Bot) => bot.name.toLowerCase().startsWith(needle)
  return inSidebarOrder(sidebar)
    .filter((bot) => needle !== '' || !sidebar.hidden.includes(bot.id))
    .filter((bot) => bot.id !== selfId && bot.name.toLowerCase().includes(needle))
    .sort((a, b) => Number(startsWithQuery(b)) - Number(startsWithQuery(a)))
    .map((bot) => ({
      kind: 'bot',
      bot,
      group: sidebar.sections.find((section) => section.id === sidebar.placement[bot.id])?.name,
    }))
}

/** What an @ offers after the bots: the plus menu's items whose names contain the query; each item of a submenu goes under its parent's name. */
export function mentionActions(menu: MenuEntry[], query: string): ActionCandidate[] {
  const needle = query.toLowerCase()
  const enabled = (entries: MenuEntry[]) => entries.filter(isItem).filter((item) => !item.disabled)
  return enabled(menu)
    .flatMap((item): ActionCandidate[] =>
      item.submenu
        ? enabled(item.submenu).map((child) => ({
            kind: 'action',
            label: item.label,
            icon: child.icon,
            detail: child.label,
            onSelect: child.onSelect,
          }))
        : [{ kind: 'action', label: item.label, icon: item.icon, onSelect: item.onSelect }],
    )
    .filter((action) => action.label.toLowerCase().includes(needle))
}

/** The @ being typed right before the caret: at the start or after whitespace, with no whitespace after it. */
export function mentionQuery(text: string, caret: number): { start: number; end: number; query: string } | null {
  const match = /(?:^|\s)@(\S*)$/.exec(text.slice(0, caret))
  if (!match) return null
  const query = match[1] ?? ''
  return { start: caret - query.length - 1, end: caret, query }
}
