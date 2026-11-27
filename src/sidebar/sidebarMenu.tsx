import type { ReactNode } from 'react'
import { type Bot, MAIN_BOT_ID, workNumberOf } from '../../shared/bot'
import { newId } from '../../shared/newId'
import { DISMISSED_KEEP_DAYS, type Section, type SidebarState } from '../../shared/sidebar'
import { BotAvatar } from '../bot/BotAvatar'
import type { MenuEntry, MenuItem } from '../ui/ContextMenu'
import {
  createSectionWith,
  deleteSection,
  dismissBot,
  moveSection,
  moveToSection,
  setHidden,
  setUnread,
  togglePin,
} from './sidebarState'
import type { Confirmation, Editing, MenuTarget } from './useSidebarMenus'
import { strings } from '../../shared/strings'

interface Actions {
  update: (change: (state: SidebarState) => SidebarState) => void
  setEditing: (editing: Editing) => void
  setConfirmation: (confirmation: Confirmation) => void
}

interface Menu {
  label: string
  header?: ReactNode
  tiles?: MenuItem[]
  items: MenuEntry[]
}

/** The context menu for a bot or a section: its accessible label, what heads it, and its items. */
export function sidebarMenu(sidebar: SidebarState, target: MenuTarget, actions: Actions): Menu {
  switch (target.kind) {
    case 'bot':
      return { label: strings().sidebar.menu.botActions, ...botMenu(sidebar, target.bot, target.canRename, actions) }
    case 'section':
      return { label: strings().sidebar.menu.sectionMenu, items: sectionItems(sidebar, target.section, actions) }
    default:
      return target satisfies never
  }
}

function botMenu(
  sidebar: SidebarState,
  bot: Bot,
  canRename: boolean,
  { update, setEditing, setConfirmation }: Actions,
): Omit<Menu, 'label'> {
  const words = strings().sidebar.menu
  const id = bot.id
  const isPinned = sidebar.pinned.includes(id)
  const isHidden = sidebar.hidden.includes(id)
  const isUnread = id in sidebar.unread
  const current = sidebar.placement[id] ?? null
  const currentName = sidebar.sections.find((section) => section.id === current)?.name ?? strings().common.ungrouped
  const moveTo = (sectionId: string | null, name: string): MenuEntry => ({
    label: name,
    icon: sectionId === current ? 'check' : 'folder',
    onSelect: () => update((state) => moveToSection(state, id, sectionId)),
  })
  // the main bot cannot leave; since it always exists, the chat always has a bot to show
  const leaving: MenuEntry[] =
    id === MAIN_BOT_ID
      ? []
      : [
          'separator',
          {
            label: words.letGo,
            icon: 'leave',
            danger: true,
            onSelect: () =>
              setConfirmation({
                title: words.letGoTitle(bot.name),
                body: words.letGoBody(DISMISSED_KEEP_DAYS),
                confirmLabel: words.letGoConfirm,
                onConfirm: () => {
                  const at = Date.now() // outside the updater so StrictMode replays stay pure
                  update((state) => dismissBot(state, id, at))
                },
              }),
          },
        ]
  return {
    header: (
      <div
        className="mb-1.5 flex items-center gap-3 rounded-md px-3 py-2.5"
        style={{ backgroundColor: `color-mix(in srgb, ${bot.color} 10%, var(--color-surface))` }}
      >
        <BotAvatar bot={bot} size={36} />
        <div className="min-w-0 leading-[1.35]">
          <p className="truncate text-md font-semibold">{bot.name}</p>
          <p className="text-xs text-muted">{words.staffNumber(workNumberOf(id))}</p>
        </div>
      </div>
    ),
    tiles: [
      {
        label: words.pin,
        icon: 'pin',
        checked: isPinned,
        disabled: isHidden,
        onSelect: () => update((state) => togglePin(state, id)),
      },
      {
        label: strings().sidebar.status.unread,
        icon: 'bellDot',
        checked: isUnread,
        onSelect: () => update((state) => setUnread(state, id, !isUnread)),
      },
      {
        label: words.rename,
        icon: 'pencil',
        disabled: !canRename,
        onSelect: () => setEditing({ kind: 'bot', id }),
      },
      { label: words.copyId, icon: 'copy', copy: id },
    ],
    items: [
      {
        label: words.moveTo,
        icon: 'folder',
        detail: currentName,
        submenu: [
          ...sidebar.sections.map((section) => moveTo(section.id, section.name)),
          moveTo(null, strings().common.ungrouped),
          'separator',
          {
            label: words.newSection,
            icon: 'folderPlus',
            onSelect: () => {
              const sectionId = newId('s') // generated outside the updater so StrictMode replays stay pure
              update((state) => createSectionWith(state, id, sectionId))
              setEditing({ kind: 'section', id: sectionId })
            },
          },
        ],
      },
      isHidden
        ? {
            label: words.unhide,
            icon: 'eye',
            onSelect: () => update((state) => setHidden(state, id, false)),
          }
        : {
            label: words.hide,
            icon: 'eyeOff',
            onSelect: () => update((state) => setHidden(state, id, true)),
          },
      ...leaving,
    ],
  }
}

function sectionItems(
  sidebar: SidebarState,
  section: Section,
  { update, setEditing, setConfirmation }: Actions,
): MenuEntry[] {
  const words = strings().sidebar.menu
  const index = sidebar.sections.findIndex((candidate) => candidate.id === section.id)
  return [
    {
      label: words.renameSection,
      icon: 'pencil',
      onSelect: () => setEditing({ kind: 'section', id: section.id }),
    },
    {
      label: words.moveUp,
      icon: 'arrowUp',
      disabled: index <= 0,
      onSelect: () => update((state) => moveSection(state, section.id, -1)),
    },
    {
      label: words.moveDown,
      icon: 'arrowDown',
      disabled: index >= sidebar.sections.length - 1,
      onSelect: () => update((state) => moveSection(state, section.id, 1)),
    },
    'separator',
    {
      label: words.delete,
      icon: 'trash',
      danger: true,
      onSelect: () =>
        setConfirmation({
          title: words.deleteTitle(section.name),
          body: words.deleteBody(strings().common.ungrouped),
          confirmLabel: words.delete,
          onConfirm: () => update((state) => deleteSection(state, section.id)),
        }),
    },
  ]
}
