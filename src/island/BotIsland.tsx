import { type ReactNode, useMemo, useRef, useState } from 'react'
import type { Bot } from '../../shared/bot'
import { type Entry, isUnfinished, type TaskView } from '../../shared/bridge'
import type { ContextView, Trace } from '../../shared/debug'
import type { Flow } from '../../shared/flow'
import { useAutoDismiss } from '../ui/useAutoDismiss'
import { useFlash } from '../ui/useFlash'
import { useLightDismiss } from '../ui/useLightDismiss'
import { type Navigation, useNavigation } from '../NavigationContext'
import { contextTokens, liveTokens } from './contextTokens'
import { DebugCard, type DebugTab } from './DebugCard'
import { DetailCard } from './DetailCard'
import { Island } from './Island'
import type { Notice } from './islandNotices'
import { BusyRow, FlowSavedRow, IdleRow, NoticeRow, SkillLearnedRow, TaskEndedRow, TasksRow } from './IslandRows'
import { LevelUpCard } from './LevelUpCard'
import { ReplyCard } from './ReplyCard'
import { trustOf } from '../../shared/trust'
import { strings } from '../../shared/strings'

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
  onDebugChange: (isDebug: boolean) => void
}

interface View {
  key: string
  content: ReactNode
}

/** The island of one bot's chat: its level at rest, its background tasks, news as it comes, the details on a click. */
export function BotIsland(props: Props) {
  const { bot, bots, entries, tasks, flows, isBusy, isDebug, context, traces, notice, onDismissNotice, onDebugChange } =
    props
  const navigation = useNavigation()
  const [isExpanded, setIsExpanded] = useState(false)
  const [tab, setTab] = useState<DebugTab>('context')
  const [toggledDebug, flashToggledDebug] = useFlash<boolean>() // what debug mode was just turned to
  const ref = useRef<HTMLDivElement>(null)
  const trust = useMemo(() => trustOf(entries), [entries])
  const running = tasks.filter(isUnfinished)
  const shownNotice = isExpanded || toggledDebug !== undefined ? undefined : notice
  useAutoDismiss(shownNotice?.id, shownNotice ? NOTICE_MS[shownNotice.kind] : 0, onDismissNotice)
  useLightDismiss(ref, isExpanded, () => setIsExpanded(false))

  const toggleDebug = (isOn: boolean) => {
    onDebugChange(isOn)
    setIsExpanded(false)
    flashToggledDebug(isOn)
  }
  const openOn = (next: DebugTab) => {
    setTab(next)
    setIsExpanded(true)
  }
  const expand = () => openOn('context')
  const openTrace = () => openOn('trace')
  const chatTrace = traces.find((trace) => trace.id === bot.id)

  const view = (): View => {
    if (toggledDebug !== undefined) {
      const words = strings().island.notices
      const row = toggledDebug
        ? { icon: 'check' as const, title: words.debugOn, detail: words.debugOnDetail }
        : { icon: 'close' as const, title: words.debugOff, detail: words.debugOffDetail }
      return { key: `debug-toggled-${toggledDebug}`, content: <NoticeRow {...row} tone="quiet" /> }
    }
    if (isExpanded && isDebug) {
      const card = { bot, trust, entries, context, traces, tab, onTab: setTab, onDebugChange: toggleDebug }
      return { key: 'detail', content: <DebugCard {...card} /> }
    }
    if (isExpanded) {
      const openFlows = () => {
        setIsExpanded(false)
        navigation.openFlow(null)
      }
      const card = { bot, trust, flowCount: flows.length, onOpenFlows: openFlows, onDebugChange: toggleDebug }
      return { key: 'detail', content: <DetailCard {...card} /> }
    }
    const actions = { ...navigation, bot, bots, onDismissNotice, onOpenTrace: openTrace }
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

type NoticeActions = Pick<Props, 'bot' | 'bots' | 'onDismissNotice'> &
  Pick<Navigation, 'openBot' | 'openFlow' | 'openSkill'> & { onOpenTrace: () => void }

function noticeView(
  notice: Notice,
  { bot, bots, onDismissNotice, openBot, openFlow, openSkill, onOpenTrace }: NoticeActions,
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
              onOpen={() => openBot(sender.id)}
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
          <LevelUpCard
            bot={bots.find((candidate) => candidate.id === notice.botId) ?? bot}
            from={notice.from}
            level={notice.level}
          />
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
              openBot(notice.botId)
              openFlow(notice.flowId)
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
              if (first) openSkill(notice.botId, first)
            }}
          />
        ),
      }
    }
    case 'remembered':
      return {
        key,
        content: <NoticeRow icon="pin" tone="quiet" title={strings().island.notices.remembered} detail={notice.text} />,
      }
    case 'compacted':
      return {
        key,
        content: (
          <NoticeRow
            icon="down"
            tone="quiet"
            title={strings().island.notices.compacted}
            detail={strings().island.notices.compactedDetail(notice.folded)}
          />
        ),
      }
    case 'out-of-steps':
      return {
        key,
        content: (
          <NoticeRow
            icon="stop"
            tone="warning"
            title={strings().island.notices.outOfSteps}
            detail={strings().island.notices.outOfStepsDetail(notice.maxSteps)}
          >
            <button
              type="button"
              onClick={() => {
                onDismissNotice(notice.id)
                onOpenTrace()
              }}
              className="rounded-full bg-white/20 px-2.5 text-xs leading-[22px] font-semibold"
            >
              {strings().island.notices.seeTurn}
            </button>
          </NoticeRow>
        ),
      }
    default:
      return notice satisfies never
  }
}
