import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Bot } from '../../shared/bot'
import { isUnfinished } from '../../shared/bridge'
import { plainText } from '../../shared/plainText'
import { activityLabel } from '../activityLabel'
import { BotAvatar } from '../bot/BotAvatar'
import { ELAPSED_REFRESH_MS } from '../elapsedLabel'
import type { Thread } from '../harnessState'
import { taskProgressLabel } from '../taskProgressLabel'
import { Icon } from '../ui/Icon'
import { POP } from '../ui/motion'
import { useNow } from '../ui/useNow'
import { whenLabel } from '../timeLabel'
import { type BotStatus, DOT_LABELS, dotKindOf, statusLineOf } from './botStatus'
import { StatusDot } from './StatusDot'
import { strings } from '../../shared/strings'

const SHOW_DELAY_S = 0.45 // a pointer passing over the list does not flash a card for every bot

/** Where the card sits, in viewport pixels: beside the sidebar, level with the top or the bottom of the bot it is about. */
export type CardAnchor = { left: number } & ({ top: number } | { bottom: number })

interface Props {
  bot: Bot
  thread: Thread
  status: BotStatus
  anchor: CardAnchor
}

/** More of what a bot is up to, while the pointer rests on it in the sidebar: what failed and why, its work, its routines. */
export function BotStatusCard({ bot, thread, status, anchor }: Props) {
  const words = strings().sidebar.card
  const now = useNow(ELAPSED_REFRESH_MS)
  const { progress } = thread
  const unfinished = thread.panel.tasks.filter(isUnfinished)
  const scheduled = thread.panel.routines.flatMap(({ name, id, nextRunAt }) =>
    nextRunAt === null ? [] : [{ id, name, nextRunAt }],
  )
  const dotKind = dotKindOf(status)
  return createPortal(
    <motion.div
      role="tooltip"
      initial={POP.initial}
      animate={{ ...POP.animate, transition: { ...POP.transition, delay: SHOW_DELAY_S } }}
      exit={POP.exit}
      transition={POP.transition}
      style={anchor}
      className="pointer-events-none fixed z-20 max-h-[calc(100vh-16px)] w-[300px] overflow-hidden rounded-lg bg-surface p-3.5 text-sm shadow-pop"
    >
      <header className="flex items-center gap-2.5">
        <BotAvatar bot={bot} size={36} />
        <span className="flex min-w-0 flex-col leading-[1.4]">
          <strong className="truncate text-md font-semibold">{bot.name}</strong>
          <span data-kind={status.kind} className="text-muted data-[kind=failed]:text-danger">
            {dotKind ? DOT_LABELS[dotKind] : strings().sidebar.status.idle}
          </span>
        </span>
      </header>
      {status.kind === 'failed' && (
        <Part title={strings().sidebar.status.failed}>
          <Item
            mark={<StatusDot kind="failed" size={14} />}
            title={status.task.title}
            meta={whenLabel(status.task.endedAt ?? now, now)}
            detail={status.task.failureReason}
            isDanger
          />
        </Part>
      )}
      {(progress || unfinished.length > 0) && (
        <Part title={words.workingOn}>
          {progress && (
            <Item
              mark={<StatusDot kind="busy" size={14} />}
              title={words.replying}
              detail={statusLineOf(
                { kind: 'replying', label: activityLabel(progress.activity, progress.draw), since: progress.since },
                now,
              )}
            />
          )}
          {unfinished.map((task) => (
            <Item
              key={task.id}
              mark={<StatusDot kind={task.status === 'running' ? 'busy' : 'waiting'} size={14} />}
              title={task.title}
              meta={task.model}
              detail={taskProgressLabel(task, now)}
            />
          ))}
        </Part>
      )}
      {scheduled.length > 0 && (
        <Part title={words.routines}>
          {scheduled.map((routine) => (
            <Item
              key={routine.id}
              mark={<Icon name="clock" size={14} />}
              title={routine.name}
              meta={words.next(whenLabel(routine.nextRunAt, now))}
            />
          ))}
        </Part>
      )}
      {status.kind === 'idle' && thread.preview && (
        <Part title={words.lastReply}>
          <p className="line-clamp-3 text-soft">{plainText(thread.preview)}</p>
        </Part>
      )}
    </motion.div>,
    document.body,
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="mb-1 text-xs text-muted">{title}</h3>
      {children}
    </section>
  )
}

interface ItemProps {
  mark: ReactNode
  title: string
  meta?: string
  detail?: string | null
  isDanger?: boolean
}

function Item({ mark, title, meta, detail, isDanger = false }: ItemProps) {
  return (
    <div className="grid grid-cols-[14px_1fr_auto] items-center gap-x-2 gap-y-0.5 py-0.5 text-muted">
      {mark}
      <span className="truncate text-ink">{title}</span>
      <span className="text-xs whitespace-nowrap">{meta}</span>
      {detail && (
        <span
          data-danger={isDanger || undefined}
          className="col-start-2 col-end-4 line-clamp-3 text-xs data-danger:text-danger"
        >
          {detail}
        </span>
      )}
    </div>
  )
}
