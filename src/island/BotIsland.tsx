import { type ReactNode, useMemo, useRef, useState } from 'react'
import type { Bot } from '../../shared/bot'
import { type Entry, isUnfinished, type TaskView } from '../../shared/bridge'
import type { ContextView, Trace } from '../../shared/debug'
import type { Flow } from '../../shared/flow'
import { BotAvatar } from '../bot/BotAvatar'
import { Icon, type IconName } from '../ui/Icon'
import { useAutoDismiss } from '../ui/useAutoDismiss'
import { useLightDismiss } from '../ui/useLightDismiss'
import { ContextGauge } from './ContextGauge'
import { type ContextFill, contextTokens, liveTokens } from './contextTokens'
import { DebugCard, type DebugTab } from './DebugCard'
import { DetailCard } from './DetailCard'
import { Island } from './Island'
import type { Notice } from './islandNotices'
import { LevelBadge } from './LevelBadge'
import { LevelUpCard } from './LevelUpCard'
import { ReplyCard } from './ReplyCard'
import { type Trust, trustOf } from '../../shared/trust'
import { strings } from '../../shared/strings'
import { TrustRing } from './TrustRing'

const NOTICE_MS: Record<Notice['kind'], number> = {
  task: 2600,
  reply: 5000,
  'level-up': 4400,
  learned: 5000,
  'skill-learned': 5000,
  remembered: 3200,
  compacted: 3200,
  'out-of-steps': 5000,
}
const DEBUG_TOGGLED_MS = 2000

interface Props {
  bot: Bot
  bots: Bot[]
  entries: Entry[]
  tasks: TaskView[]
  flows: Flow[]
  isBusy: boolean // a turn of its chat is running
  isDebug: boolean // shows the context, the runs and the changes; see DebugCard
  context: ContextView | null
  traces: Trace[]
  notice: Notice | undefined // the first of the queue; it waits while the island is open
  onDismissNotice: (id: number) => void
  onOpenBot: (botId: string) => void
  onOpenFlow: (flowId: string | null) => void // null: the list of its flows
  onOpenSkill: (botId: string, name: string) => void
  onDebugChange: (isDebug: boolean) => void
}

interface View {
  key: string
  content: ReactNode
}

/** The island of one bot's chat: its level at rest, its background tasks, news as it comes, the details on a click. */
export function BotIsland(props: Props) {
  const {
    bot,
    bots,
    entries,
    tasks,
    flows,
    isBusy,
    isDebug,
    context,
    traces,
    notice,
    onDismissNotice,
    onOpenBot,
    onOpenFlow,
    onOpenSkill,
    onDebugChange,
  } = props
  const [isExpanded, setIsExpanded] = useState(false)
  const [tab, setTab] = useState<DebugTab>('context')
  const [debugToggledId, setDebugToggledId] = useState<number>()
  const ref = useRef<HTMLDivElement>(null)
  const trust = useMemo(() => trustOf(entries), [entries])
  const running = tasks.filter(isUnfinished)
  const shownNotice = isExpanded || debugToggledId !== undefined ? undefined : notice
  useAutoDismiss(shownNotice?.id, shownNotice ? NOTICE_MS[shownNotice.kind] : 0, onDismissNotice)
  useAutoDismiss(debugToggledId, DEBUG_TOGGLED_MS, () => setDebugToggledId(undefined))
  useLightDismiss(ref, isExpanded, () => setIsExpanded(false))

  const toggleDebug = (isOn: boolean) => {
    onDebugChange(isOn)
    setIsExpanded(false)
    setDebugToggledId(Date.now())
  }
  const expand = () => setIsExpanded(true)
  const openTrace = () => {
    setTab('trace')
    setIsExpanded(true)
  }
  const chatTrace = traces.find((trace) => trace.id === bot.id)

  const view = (): View => {
    if (debugToggledId !== undefined) {
      const row = isDebug
        ? {
            icon: 'check' as const,
            title: strings().island.notices.debugOn,
            detail: strings().island.notices.debugOnDetail,
          }
        : {
            icon: 'close' as const,
            title: strings().island.notices.debugOff,
            detail: strings().island.notices.debugOffDetail,
          }
      return { key: `debug-toggled-${debugToggledId}`, content: <DebugNoticeRow {...row} /> }
    }
    if (isExpanded && isDebug) {
      const card = { bot, trust, entries, context, traces, tab, onTab: setTab, onDebugChange: toggleDebug }
      return { key: 'detail', content: <DebugCard {...card} /> }
    }
    if (isExpanded) {
      const openFlows = () => {
        setIsExpanded(false)
        onOpenFlow(null)
      }
      const card = { bot, trust, flowCount: flows.length, onOpenFlows: openFlows, onDebugChange: toggleDebug }
      return { key: 'detail', content: <DetailCard {...card} /> }
    }
    const actions = { bot, bots, onDismissNotice, onOpenBot, onOpenFlow, onOpenSkill, onOpenTrace: openTrace }
    const news = shownNotice && noticeView(shownNotice, actions)
    if (news) return news
    if (isDebug && isBusy) {
      const live = chatTrace?.endedAt === null ? chatTrace : undefined
      const step = live?.steps.length ?? 0
      const tokens = liveTokens(live, context)
      const fill = context && tokens !== undefined ? { tokens, windowTokens: context.windowTokens } : undefined
      const busy = { bot, trust, step, maxSteps: live?.maxSteps, fill }
      return { key: 'busy', content: <BusyRow {...busy} onClick={openTrace} /> }
    }
    const fill =
      isDebug && context ? { tokens: contextTokens(context).total, windowTokens: context.windowTokens } : undefined
    if (running.length)
      return {
        key: 'tasks',
        content: <TasksRow bot={bot} trust={trust} tasks={running} fill={fill} onClick={expand} />,
      }
    return { key: 'idle', content: <IdleRow bot={bot} trust={trust} fill={fill} onClick={expand} /> }
  }
  const { key, content } = view()

  return (
    <div ref={ref}>
      <Island view={key}>{content}</Island>
    </div>
  )
}

type NoticeActions = Pick<Props, 'bot' | 'bots' | 'onDismissNotice' | 'onOpenBot' | 'onOpenFlow' | 'onOpenSkill'> & {
  onOpenTrace: () => void
}

function noticeView(
  notice: Notice,
  { bot, bots, onDismissNotice, onOpenBot, onOpenFlow, onOpenSkill, onOpenTrace }: NoticeActions,
): View | undefined {
  const key = `notice-${notice.id}`
  switch (notice.kind) {
    case 'task':
      return {
        key,
        content: (
          <TaskEndedRow
            title={notice.title}
            isDone={notice.isDone}
            points={notice.points}
            fallbackFrom={notice.fallbackFrom}
            onClick={() => onDismissNotice(notice.id)}
          />
        ),
      }
    case 'reply': {
      const sender = bots.find((candidate) => candidate.id === notice.botId)
      return (
        sender && {
          key,
          content: (
            <ReplyCard
              sender={sender}
              text={notice.text}
              onOpen={() => onOpenBot(sender.id)}
              onLater={() => onDismissNotice(notice.id)}
            />
          ),
        }
      )
    }
    case 'level-up':
      return {
        key,
        content: (
          <LevelUpCard bot={bots.find((candidate) => candidate.id === notice.botId) ?? bot} level={notice.level} />
        ),
      }
    case 'learned':
      return {
        key,
        content: (
          <FlowSavedRow
            name={notice.name}
            isNew={notice.isNew}
            points={notice.points}
            onClick={() => {
              onDismissNotice(notice.id)
              onOpenBot(notice.botId)
              onOpenFlow(notice.flowId)
            }}
          />
        ),
      }
    case 'skill-learned': {
      const owner = bots.find((candidate) => candidate.id === notice.botId)
      const title =
        notice.botId === bot.id
          ? strings().island.notices.skillLearned
          : strings().island.notices.skillLearnedBy(owner?.name ?? notice.botId)
      return {
        key,
        content: (
          <SkillLearnedRow
            title={title}
            name={strings().skills.names(notice.names)}
            onClick={() => {
              onDismissNotice(notice.id)
              const [first] = notice.names
              if (first) onOpenSkill(notice.botId, first)
            }}
          />
        ),
      }
    }
    case 'remembered':
      return {
        key,
        content: <DebugNoticeRow icon="pin" title={strings().island.notices.remembered} detail={notice.text} />,
      }
    case 'compacted':
      return {
        key,
        content: (
          <DebugNoticeRow
            icon="down"
            title={strings().island.notices.compacted}
            detail={strings().island.notices.compactedDetail(notice.folded)}
          />
        ),
      }
    case 'out-of-steps':
      return {
        key,
        content: (
          <DebugNoticeRow
            icon="stop"
            title={strings().island.notices.outOfSteps}
            detail={strings().island.notices.outOfStepsDetail(notice.maxSteps)}
            isWarning
            action={{
              label: strings().island.notices.seeTurn,
              onClick: () => {
                onDismissNotice(notice.id)
                onOpenTrace()
              },
            }}
          />
        ),
      }
    default:
      return notice satisfies never
  }
}

interface RowProps {
  bot: Bot
  trust: Trust
  onClick: () => void
}

export function IdleRow({ bot, trust, fill, onClick }: RowProps & { fill?: ContextFill }) {
  return (
    <CompactButton onClick={onClick}>
      <TrustRing trust={trust} size={26}>
        <BotAvatar bot={bot} size={16} />
      </TrustRing>
      <span className="max-w-[200px] truncate">{bot.name}</span>
      <LevelBadge level={trust.level} />
      {fill && (
        <>
          <span className="h-3.5 w-px bg-white/20" />
          <ContextGauge {...fill} />
        </>
      )}
    </CompactButton>
  )
}

interface BusyRowProps extends RowProps {
  step: number // the step it is on; 0 while it gets ready
  maxSteps: number | undefined
  fill: ContextFill | undefined
}

/** Debug mode, while a turn runs: which step of how many, and what that step sends the model. */
function BusyRow({ bot, trust, step, maxSteps, fill, onClick }: BusyRowProps) {
  return (
    <CompactButton onClick={onClick}>
      <TrustRing trust={trust} size={26}>
        <BotAvatar bot={bot} size={16} />
      </TrustRing>
      <span className="max-w-[200px] truncate">{bot.name}</span>
      <span className="h-3.5 w-px bg-white/20" />
      <span className="shimmer-text font-mono text-xs tabular-nums">
        {step && maxSteps ? strings().island.notices.step(step, maxSteps) : strings().island.notices.starting}
      </span>
      {fill && <ContextGauge {...fill} />}
    </CompactButton>
  )
}

interface DebugNoticeProps {
  icon: IconName
  title: string
  detail: string
  isWarning?: boolean
  action?: { label: string; onClick: () => void }
}

function DebugNoticeRow({ icon, title, detail, isWarning = false, action }: DebugNoticeProps) {
  return (
    <div className="flex h-[30px] items-center gap-2 pr-3.5 pl-[2px] text-md whitespace-nowrap has-[button]:pr-1">
      <span className="grid size-[26px] place-items-center">
        <span
          data-warning={isWarning || undefined}
          className="grid size-[18px] place-items-center rounded-full bg-white/20 data-warning:bg-warning"
        >
          <Icon name={icon} size={11} />
        </span>
      </span>
      <span>{title}</span>
      <span className="max-w-[240px] truncate text-sm text-white/60">{detail}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-full bg-white/20 px-2.5 text-xs leading-[22px] font-semibold"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export function TasksRow({ bot, trust, tasks, fill, onClick }: RowProps & { tasks: TaskView[]; fill?: ContextFill }) {
  return (
    <CompactButton onClick={onClick}>
      <TrustRing trust={trust} size={26}>
        <BotAvatar bot={bot} size={16} />
      </TrustRing>
      <span className="max-w-[200px] truncate">{bot.name}</span>
      <span className="h-3.5 w-px bg-white/20" />
      <span className="max-w-[220px] truncate text-sm text-white/60">
        {tasks.length === 1
          ? strings().island.notices.backgroundTask(tasks[0]?.title ?? '')
          : strings().island.notices.backgroundTasks(tasks.length)}
      </span>
      {fill && <ContextGauge {...fill} />}
    </CompactButton>
  )
}

interface TaskEndedProps {
  title: string
  isDone: boolean
  points: number // what it earned the bot
  fallbackFrom?: string // the model it was set to, which the main one stood in for
  onClick: () => void
}

export function TaskEndedRow({ title, isDone, points, fallbackFrom, onClick }: TaskEndedProps) {
  return (
    <CompactButton onClick={onClick}>
      <span className="grid size-[26px] place-items-center">
        <span
          data-failed={!isDone || undefined}
          className="grid size-[18px] place-items-center rounded-full bg-accent data-failed:bg-danger"
        >
          <Icon name={isDone ? 'check' : 'close'} size={11} />
        </span>
      </span>
      <span>{isDone ? strings().island.notices.taskDone : strings().island.notices.taskFailed}</span>
      <span className="max-w-[220px] truncate text-sm text-white/60">{title}</span>
      {fallbackFrom && <span className="text-sm text-warning">{strings().island.notices.fellBack(fallbackFrom)}</span>}
      {points > 0 && (
        <span className="rounded-full bg-white/12 px-2 text-xs leading-5 font-semibold">
          {strings().island.notices.xp(points)}
        </span>
      )}
    </CompactButton>
  )
}

interface FlowSavedProps {
  name: string
  isNew: boolean
  points: number // what saving it earned the bot
  onClick: () => void
}

function FlowSavedRow({ name, isNew, points, onClick }: FlowSavedProps) {
  return (
    <CompactButton onClick={onClick}>
      <span className="grid size-[26px] place-items-center">
        <span className="grid size-[18px] place-items-center rounded-full bg-accent">
          <Icon name="flow" size={11} />
        </span>
      </span>
      <span>{isNew ? strings().island.notices.flowLearned : strings().island.notices.flowUpdated}</span>
      <span className="max-w-[220px] truncate text-sm text-white/60">{name}</span>
      {points > 0 && <span className="text-sm font-semibold tabular-nums">{strings().island.notices.xp(points)}</span>}
      <span className="rounded-full bg-white/12 px-2 text-xs leading-5 font-semibold">
        {strings().island.notices.view}
      </span>
    </CompactButton>
  )
}

function SkillLearnedRow({ title, name, onClick }: { title: string; name: string; onClick: () => void }) {
  return (
    <CompactButton onClick={onClick}>
      <span className="grid size-[26px] place-items-center">
        <span className="grid size-[18px] place-items-center rounded-full bg-accent">
          <Icon name="skill" size={11} />
        </span>
      </span>
      <span>{title}</span>
      <span className="max-w-[220px] truncate text-sm text-white/60">{name}</span>
      <span className="rounded-full bg-white/12 px-2 text-xs leading-5 font-semibold">
        {strings().island.notices.view}
      </span>
    </CompactButton>
  )
}

function CompactButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[30px] items-center gap-2 pr-3.5 pl-[2px] text-md whitespace-nowrap"
    >
      {children}
    </button>
  )
}
