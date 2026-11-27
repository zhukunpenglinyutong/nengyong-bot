import { AnimatePresence, motion } from 'motion/react'
import { type MouseEvent, type ReactNode, useState } from 'react'
import { BOT_NAME_MAX, type Bot } from '../../shared/bot'
import { plainText } from '../../shared/plainText'
import { SECTION_NAME_MAX, type SidebarState, unreadTotal } from '../../shared/sidebar'
import { ELAPSED_REFRESH_MS } from '../elapsedLabel'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Collapsible } from '../ui/Collapsible'
import { EASE_SHARP } from '../ui/motion'
import { useNow } from '../ui/useNow'
import { DOT_LABELS, dotKindOf, nextRoutineOf, statusLineOf, whenLabel } from './botStatus'
import { InlineRename } from './InlineRename'
import { useBotEntry, useSidebar } from './SidebarContext'
import { sidebarView } from '../sidebarView'
import { StatusAvatar } from './StatusAvatar'
import { StatusDot } from './StatusDot'
import { HIDDEN_NAME, moveToSection, renameSection, toggleSection } from './sidebarState'
import { MAX_SHOWN_UNREAD, UnreadBadge } from './UnreadBadge'
import { strings } from '../../shared/strings'

const PIN_PITCH = 102
const PIN_GAP = 6
const BOT_DRAG_TYPE = 'application/x-nengyongbot-bot'
const STATUS_FILTERS = ['busy', 'failed'] as const
const FILTERS = ['unread', ...STATUS_FILTERS] as const
type Filter = (typeof FILTERS)[number]
const FILTER_LABELS: Record<Filter, string> = {
  unread: strings().sidebar.status.unread,
  busy: DOT_LABELS.busy,
  failed: DOT_LABELS.failed,
}

/** The bot list beside the rail: a search field over the matching bots, the unread, at work or failed bots, or every section. */
export function SidebarList({ onCreate }: { onCreate: () => void }) {
  const { sidebar, statusOf } = useSidebar()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<{ kind: Filter; matchedWhenPressed: string[] } | null>(null)
  const needle = query.trim()
  const isMatch = (kind: Filter, bot: Bot) =>
    kind === 'unread' ? (sidebar.unread[bot.id] ?? 0) > 0 : dotKindOf(statusOf(bot.id)) === kind
  const matching = (kind: Filter) => inSidebarOrder(sidebar).filter((bot) => isMatch(kind, bot))
  const counts: Record<Filter, number> = {
    unread: unreadTotal(sidebar),
    busy: matching('busy').length,
    failed: matching('failed').length,
  }
  const toggleFilter = (kind: Filter) =>
    setFilter((current) =>
      current?.kind === kind ? null : { kind, matchedWhenPressed: matching(kind).map((bot) => bot.id) },
    )
  return (
    <div className="flex h-full flex-col">
      {/* the macOS window buttons reach 16px past the rail (trafficLightPosition in electron/main.ts) */}
      <div className="drag flex h-[60px] shrink-0 items-center gap-1 pr-2 pl-8">
        <div className="no-drag flex h-7 min-w-0 flex-1 items-center gap-1 rounded-full bg-surface pr-0.5 pl-2.5 text-muted shadow-card">
          <label className="flex min-w-0 flex-1 items-center gap-1.5">
            <Icon name="search" size={14} />
            <input
              type="search"
              aria-label={strings().sidebar.list.search}
              placeholder={strings().sidebar.list.searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && !event.nativeEvent.isComposing) setQuery('')
              }}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
          </label>
          <AnimatePresence initial={false}>
            {!needle &&
              FILTERS.filter((kind) => counts[kind] > 0).map((kind) => (
                <FilterChip
                  key={kind}
                  kind={kind}
                  count={counts[kind]}
                  isOn={filter?.kind === kind}
                  onToggle={() => toggleFilter(kind)}
                />
              ))}
          </AnimatePresence>
        </div>
        <IconButton icon="plus" label={strings().sidebar.list.newBot} onClick={onCreate} className="no-drag" />
      </div>
      {needle && <SearchResults query={needle} />}
      {!needle && filter && (
        <FilteredBots
          label={FILTER_LABELS[filter.kind]}
          count={matching(filter.kind).length}
          bots={inSidebarOrder(sidebar).filter(
            (bot) => isMatch(filter.kind, bot) || filter.matchedWhenPressed.includes(bot.id),
          )}
          onClear={() => setFilter(null)}
        />
      )}
      {!needle && !filter && <Sections />}
    </div>
  )
}

/** Every bot in the order the sections show them, the hidden ones last. */
function inSidebarOrder(sidebar: SidebarState): Bot[] {
  const view = sidebarView(sidebar)
  return [...view.pinned, ...view.sections.flatMap((section) => section.bots), ...view.ungrouped, ...view.hidden]
}

/** How many replies wait unread, or bots are at work or failed: pressed, the list shows only those bots. */
function FilterChip({
  kind,
  count,
  isOn,
  onToggle,
}: {
  kind: Filter
  count: number
  isOn: boolean
  onToggle: () => void
}) {
  return (
    <motion.button
      initial={{ width: 0, opacity: 0, scale: 0.6 }}
      animate={{ width: 'auto', opacity: 1, scale: 1 }}
      exit={{ width: 0, opacity: 0, scale: 0.6 }}
      transition={{ duration: 0.25, ease: EASE_SHARP }}
      aria-pressed={isOn}
      aria-label={
        kind === 'unread'
          ? strings().sidebar.list.onlyUnread(count)
          : strings().sidebar.list.onlyKind(FILTER_LABELS[kind], count)
      }
      data-kind={kind}
      onClick={onToggle}
      className="flex h-6 shrink-0 overflow-hidden rounded-full text-xs font-medium tabular-nums aria-pressed:ring-1 aria-pressed:ring-current data-[kind=busy]:bg-working/12 data-[kind=busy]:text-working data-[kind=failed]:bg-danger/10 data-[kind=failed]:text-danger data-[kind=unread]:bg-accent/10 data-[kind=unread]:text-accent"
    >
      <span className="flex items-center gap-1 px-1.5">
        {kind === 'unread' ? (
          <span className="m-0.5 size-2 rounded-full bg-current" />
        ) : (
          <StatusDot kind={kind} size={12} />
        )}
        {count > MAX_SHOWN_UNREAD ? `${MAX_SHOWN_UNREAD}+` : count}
      </span>
    </motion.button>
  )
}

function FilteredBots({
  label,
  count,
  bots,
  onClear,
}: {
  label: string
  count: number
  bots: Bot[]
  onClear: () => void
}) {
  const { sidebar } = useSidebar()
  return (
    <div className="flex-1 overflow-y-auto px-2 pb-4">
      <div className="mt-2 flex h-8 items-center gap-2 pr-1 pl-3 text-sm text-soft">
        <span className="flex-1">{strings().sidebar.list.filtered(label, count)}</span>
        <button onClick={onClear} className="h-6.5 rounded-full px-2.5 text-xs shadow-ring">
          {strings().sidebar.list.showAll}
        </button>
      </div>
      {bots.length === 0 && (
        <p className="px-3 py-10 text-center text-sm text-muted">{strings().sidebar.list.noneOfKind(label)}</p>
      )}
      {bots.map((bot) => (
        <BotRow key={bot.id} bot={bot} dimmed={sidebar.hidden.includes(bot.id)} />
      ))}
    </div>
  )
}

/** Every bot whose name holds the query, in the order the sections show them, the hidden ones last and dimmed. */
function SearchResults({ query }: { query: string }) {
  const { sidebar } = useSidebar()
  const needle = query.toLowerCase()
  const found = inSidebarOrder(sidebar).filter((bot) => bot.name.toLowerCase().includes(needle))
  return (
    <div className="flex-1 overflow-y-auto px-2 pb-4">
      {found.length === 0 && (
        <p className="px-3 py-10 text-center text-sm text-muted">{strings().sidebar.list.noMatch(query)}</p>
      )}
      {found.map((bot) => (
        <BotRow key={bot.id} bot={bot} dimmed={sidebar.hidden.includes(bot.id)} />
      ))}
    </div>
  )
}

/** The pinned grid, then every section, 其他 and the hidden bots as rows. */
function Sections() {
  const { sidebar, update, editing, setEditing, openSectionMenu } = useSidebar()
  const view = sidebarView(sidebar)

  return (
    <>
      {view.pinned.length > 0 && (
        // pinned grid: auto-fit 80px+ columns, 6px gap, row capped at n*102-6px and centered
        <div
          role="group"
          aria-label={strings().sidebar.list.pinned}
          className="mx-auto grid w-full grid-cols-[repeat(auto-fit,minmax(80px,1fr))] justify-center gap-x-1.5 gap-y-3 px-4 pt-2.5 pb-1"
          style={{ maxWidth: view.pinned.length * PIN_PITCH - PIN_GAP + 32 }}
        >
          {view.pinned.map((bot) => (
            <PinnedBot key={bot.id} bot={bot} />
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {view.sections.map((section) => (
          <DropSection key={section.id} label={section.name} sectionId={section.id}>
            <SectionHeader
              name={section.name}
              botIds={section.bots.map((bot) => bot.id)}
              collapsed={section.collapsed}
              editing={editing?.kind === 'section' && editing.id === section.id}
              onToggle={() => update((state) => toggleSection(state, section.id))}
              onMenu={(event) => openSectionMenu(event, section)}
              onRename={(name) => {
                if (name !== null) update((state) => renameSection(state, section.id, name))
                setEditing(null)
              }}
            />
            <Collapsible isOpen={!section.collapsed}>
              {section.bots.map((bot) => (
                <BotRow key={bot.id} bot={bot} />
              ))}
            </Collapsible>
          </DropSection>
        ))}
        {view.ungrouped.length > 0 && (
          <DropSection label={strings().common.ungrouped} sectionId={null}>
            <SectionHeader
              name={strings().common.ungrouped}
              botIds={view.ungrouped.map((bot) => bot.id)}
              collapsed={sidebar.ungroupedCollapsed}
              onToggle={() => update((state) => ({ ...state, ungroupedCollapsed: !state.ungroupedCollapsed }))}
            />
            <Collapsible isOpen={!sidebar.ungroupedCollapsed}>
              {view.ungrouped.map((bot) => (
                <BotRow key={bot.id} bot={bot} />
              ))}
            </Collapsible>
          </DropSection>
        )}
        {view.hidden.length > 0 && (
          <section aria-label={HIDDEN_NAME}>
            <SectionHeader
              name={`${HIDDEN_NAME} ${view.hidden.length}`}
              botIds={view.hidden.map((bot) => bot.id)}
              collapsed={sidebar.hiddenCollapsed}
              onToggle={() => update((state) => ({ ...state, hiddenCollapsed: !state.hiddenCollapsed }))}
            />
            <Collapsible isOpen={!sidebar.hiddenCollapsed}>
              {view.hidden.map((bot) => (
                <BotRow key={bot.id} bot={bot} dimmed />
              ))}
            </Collapsible>
          </section>
        )}
      </div>
    </>
  )
}

function PinnedBot({ bot }: { bot: Bot }) {
  const { openBotMenu } = useSidebar()
  const entry = useBotEntry(bot)
  if (entry.isEditing) {
    return (
      <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg bg-hover px-1 pt-2.5 pb-2">
        <StatusAvatar bot={bot} size={60} dotSize={18} status={entry.status} />
        <InlineRename
          value={bot.name}
          label={strings().sidebar.list.botName}
          maxLength={BOT_NAME_MAX}
          onDone={entry.rename}
          className="w-full text-center text-xs"
        />
      </div>
    )
  }
  return (
    <button
      aria-current={entry.isActive}
      onClick={entry.select}
      onContextMenu={(event) => openBotMenu(event, bot)}
      {...entry.peekHandlers}
      className="group relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg pt-2.5 pb-2 text-xs text-ink transition-colors duration-150 aria-current:bg-hover"
    >
      <StatusAvatar bot={bot} size={60} dotSize={18} status={entry.status} />
      <span data-unread={entry.unread > 0 || undefined} className="max-w-full truncate px-1 data-unread:font-semibold">
        {bot.name}
      </span>
      <UnreadBadge count={entry.unread} className="absolute top-2 right-3" />
    </button>
  )
}

function BotRow({ bot, dimmed = false }: { bot: Bot; dimmed?: boolean }) {
  const { thread, openBotMenu } = useSidebar()
  const entry = useBotEntry(bot)
  const now = useNow(ELAPSED_REFRESH_MS)
  const { preview, panel } = thread(bot.id)
  const line = statusLineOf(entry.status, now)
  const next = entry.status.kind === 'idle' ? nextRoutineOf(panel.routines) : undefined
  const avatar = (
    <span data-dimmed={dimmed || undefined} className="data-dimmed:opacity-50">
      <StatusAvatar bot={bot} size={36} dotSize={14} status={entry.status} />
    </span>
  )
  const status = (
    <span className="flex min-w-0 items-center gap-2">
      <small
        data-live={(line !== null && entry.status.kind !== 'failed') || undefined}
        data-failed={entry.status.kind === 'failed' || undefined}
        className="min-w-0 flex-1 truncate text-sm text-muted data-failed:text-danger data-live:text-soft"
      >
        {line ?? plainText(preview)}
      </small>
      <UnreadBadge count={entry.unread} />
    </span>
  )
  if (entry.isEditing) {
    return (
      <div className="group flex w-full items-center gap-3 rounded-lg bg-hover px-2.5 py-2">
        {avatar}
        <span className="flex min-w-0 flex-1 flex-col leading-[1.4]">
          <InlineRename
            value={bot.name}
            label={strings().sidebar.list.botName}
            maxLength={BOT_NAME_MAX}
            onDone={entry.rename}
            className="text-md"
          />
          {status}
        </span>
      </div>
    )
  }
  return (
    <button
      aria-current={entry.isActive}
      onClick={entry.select}
      onContextMenu={(event) => openBotMenu(event, bot)}
      draggable={!dimmed}
      onDragStart={(event) => {
        event.dataTransfer.setData(BOT_DRAG_TYPE, bot.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      {...entry.peekHandlers}
      className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 aria-current:bg-hover"
    >
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col leading-[1.4]">
        <span className="flex min-w-0 items-center gap-2">
          <span
            data-unread={entry.unread > 0 || undefined}
            className="flex-1 truncate text-md data-unread:font-semibold"
          >
            {bot.name}
          </span>
          {next && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted tabular-nums">
              <Icon name="clock" size={12} />
              <span className="sr-only">{strings().sidebar.list.nextRoutine}</span>
              {whenLabel(next.nextRunAt, now)}
            </span>
          )}
        </span>
        {status}
      </span>
    </button>
  )
}

/** A section a bot row can be dropped on; `sectionId` `null` is 其他. Lit up while a bot hovers it. */
function DropSection({ label, sectionId, children }: { label: string; sectionId: string | null; children: ReactNode }) {
  const { update } = useSidebar()
  const [isOver, setIsOver] = useState(false)
  return (
    <section
      aria-label={label}
      data-over={isOver || undefined}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(BOT_DRAG_TYPE)) return
        event.preventDefault()
        setIsOver(true)
      }}
      onDragLeave={(event) => {
        // dragleave also fires when the pointer moves onto a child of the section
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)))
          setIsOver(false)
      }}
      onDrop={(event) => {
        setIsOver(false)
        const botId = event.dataTransfer.getData(BOT_DRAG_TYPE)
        if (botId) update((state) => moveToSection(state, botId, sectionId))
      }}
      className="rounded-lg transition-colors duration-150 data-over:bg-hover"
    >
      {children}
    </section>
  )
}

interface HeaderProps {
  name: string
  botIds: string[] // collapsed, the header counts those at work and those that failed
  collapsed: boolean
  editing?: boolean
  onToggle: () => void
  onMenu?: (event: MouseEvent) => void
  onRename?: (name: string | null) => void
}

/** Expanded: plain label, chevron on hover. Collapsed: grey pill with a right chevron. */
function SectionHeader({ name, botIds, collapsed, editing, onToggle, onMenu, onRename }: HeaderProps) {
  if (editing && onRename) {
    return (
      <div className="mt-2 flex h-8 items-center px-1.5">
        <InlineRename
          value={name}
          label={strings().sidebar.list.sectionName}
          maxLength={SECTION_NAME_MAX}
          onDone={onRename}
          className="h-7 w-full text-sm"
        />
      </div>
    )
  }
  return (
    <button
      aria-expanded={!collapsed}
      onClick={onToggle}
      onContextMenu={onMenu}
      className="group mt-2 flex h-8 w-full items-center rounded-md px-3 text-left text-sm text-muted transition-colors duration-150 hover:text-soft not-aria-expanded:bg-line"
    >
      <span className="flex-1 truncate">{name}</span>
      {collapsed && <StatusSummary botIds={botIds} />}
      <span className="transition-opacity duration-150 group-aria-expanded:opacity-0 group-aria-expanded:group-hover:opacity-100">
        <Icon name={collapsed ? 'chevron' : 'down'} size={14} />
      </span>
    </button>
  )
}

function StatusSummary({ botIds }: { botIds: string[] }) {
  const { statusOf } = useSidebar()
  const kinds = botIds.map((id) => dotKindOf(statusOf(id)))
  return STATUS_FILTERS.map((kind) => {
    const count = kinds.filter((candidate) => candidate === kind).length
    return (
      count > 0 && (
        <span
          key={kind}
          data-kind={kind}
          className="mr-1.5 flex items-center gap-1 text-xs tabular-nums data-[kind=busy]:text-working data-[kind=failed]:text-danger"
        >
          <StatusDot kind={kind} size={12} />
          {count}
        </span>
      )
    )
  })
}
