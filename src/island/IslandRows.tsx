import type { ReactNode } from 'react'
import type { Bot } from '../../shared/bot'
import type { TaskView } from '../../shared/bridge'
import { strings } from '../../shared/strings'
import type { Trust } from '../../shared/trust'
import { BotAvatar } from '../bot/BotAvatar'
import { Icon, type IconName } from '../ui/Icon'
import { ContextGauge } from './ContextGauge'
import type { ContextFill } from './contextTokens'
import { LevelBadge } from './LevelBadge'
import { TrustRing } from './TrustRing'

interface RowProps {
  bot: Bot
  trust: Trust
  onClick: () => void
}

export function IdleRow({ bot, trust, fill, onClick }: RowProps & { fill?: ContextFill }) {
  return (
    <CompactButton onClick={onClick}>
      <BotHeader bot={bot} trust={trust} />
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
export function BusyRow({ bot, trust, step, maxSteps, fill, onClick }: BusyRowProps) {
  return (
    <CompactButton onClick={onClick}>
      <BotHeader bot={bot} trust={trust} />
      <span className="h-3.5 w-px bg-white/20" />
      <span className="shimmer-text font-mono text-xs tabular-nums">
        {step && maxSteps ? strings().island.notices.step(step, maxSteps) : strings().island.notices.starting}
      </span>
      {fill && <ContextGauge {...fill} />}
    </CompactButton>
  )
}

export function TasksRow({ bot, trust, tasks, fill, onClick }: RowProps & { tasks: TaskView[]; fill?: ContextFill }) {
  return (
    <CompactButton onClick={onClick}>
      <BotHeader bot={bot} trust={trust} />
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
  const words = strings().island.notices
  return (
    <NoticeRow
      icon={isDone ? 'check' : 'close'}
      tone={isDone ? undefined : 'danger'}
      title={isDone ? words.taskDone : words.taskFailed}
      detail={title}
      pill={points > 0 ? words.xp(points) : undefined}
      onClick={onClick}
    >
      {fallbackFrom && <span className="text-sm text-warning">{words.fellBack(fallbackFrom)}</span>}
    </NoticeRow>
  )
}

interface FlowSavedProps {
  name: string
  isNew: boolean
  points: number // what saving it earned the bot
  onClick: () => void
}

export function FlowSavedRow({ name, isNew, points, onClick }: FlowSavedProps) {
  const words = strings().island.notices
  return (
    <NoticeRow
      icon="flow"
      title={isNew ? words.flowLearned : words.flowUpdated}
      detail={name}
      pill={words.view}
      onClick={onClick}
    >
      {points > 0 && <span className="text-sm font-semibold tabular-nums">{words.xp(points)}</span>}
    </NoticeRow>
  )
}

export function SkillLearnedRow({ title, name, onClick }: { title: string; name: string; onClick: () => void }) {
  return <NoticeRow icon="skill" title={title} detail={name} pill={strings().island.notices.view} onClick={onClick} />
}

interface NoticeRowProps {
  icon: IconName
  tone?: 'danger' | 'warning' | 'quiet' // the dot behind the icon; accent without one
  title: string
  detail: string
  pill?: string // last on the row
  onClick?: () => void // the whole row; without it the row is no button, and children may hold one
  children?: ReactNode // between the detail and the pill
}

/** A piece of news: an icon in a dot, what happened, a grey detail and maybe a pill. */
export function NoticeRow({ icon, tone, title, detail, pill, onClick, children }: NoticeRowProps) {
  const content = (
    <>
      <span className="grid size-[26px] place-items-center">
        <span
          data-tone={tone}
          className="grid size-[18px] place-items-center rounded-full bg-accent data-[tone=danger]:bg-danger data-[tone=quiet]:bg-white/20 data-[tone=warning]:bg-warning"
        >
          <Icon name={icon} size={11} />
        </span>
      </span>
      <span>{title}</span>
      <span className="max-w-[220px] truncate text-sm text-white/60">{detail}</span>
      {children}
      {pill && <span className="rounded-full bg-white/12 px-2 text-xs leading-5 font-semibold">{pill}</span>}
    </>
  )
  if (onClick) return <CompactButton onClick={onClick}>{content}</CompactButton>
  return (
    <div className="flex h-[30px] items-center gap-2 pr-3.5 pl-[2px] text-md whitespace-nowrap has-[button]:pr-1">
      {content}
    </div>
  )
}

function BotHeader({ bot, trust }: { bot: Bot; trust: Trust }) {
  return (
    <>
      <TrustRing trust={trust} size={26}>
        <BotAvatar bot={bot} size={16} />
      </TrustRing>
      <span className="max-w-[200px] truncate">{bot.name}</span>
    </>
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
