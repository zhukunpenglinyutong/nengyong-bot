import type { Bot } from '../shared/bot'
import type { Section, SidebarState } from '../shared/sidebar'

/** The sidebar as it is shown: pinned bots, each section's bots, 其他, then the hidden ones. */
export function sidebarView(state: SidebarState): SidebarView {
  const visible = state.bots.filter((bot) => !state.hidden.includes(bot.id))
  const rest = visible.filter((bot) => !state.pinned.includes(bot.id))
  return {
    pinned: state.pinned.flatMap((id) => visible.find((bot) => bot.id === id) ?? []),
    sections: state.sections.map((section) => ({
      ...section,
      bots: rest.filter((bot) => state.placement[bot.id] === section.id),
    })),
    ungrouped: rest.filter((bot) => !(bot.id in state.placement)),
    hidden: state.bots.filter((bot) => state.hidden.includes(bot.id)),
  }
}

/** Every bot in the order the sidebar shows them, the hidden ones last. */
export function inSidebarOrder(state: SidebarState): Bot[] {
  const view = sidebarView(state)
  return [...view.pinned, ...view.sections.flatMap((section) => section.bots), ...view.ungrouped, ...view.hidden]
}

interface SidebarView {
  pinned: Bot[]
  sections: (Section & { bots: Bot[] })[]
  ungrouped: Bot[]
  hidden: Bot[]
}
