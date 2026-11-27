import { isUnfinished, type TaskView } from '../../shared/bridge'
import { elapsedLabel } from '../elapsedLabel'
import type { Thread } from '../harnessState'
import { progressOf } from '../progressOf'
import { whenLabel } from '../timeLabel'
import { strings } from '../../shared/strings'

/** What a bot is up to, as the sidebar shows it: one thing at a time, the first of these that holds. */
export type BotStatus =
  | { kind: 'failed'; task: TaskView } // its last task failed after the user last looked at its chat
  | { kind: 'replying'; label: string; since: number }
  | { kind: 'working'; task: TaskView; count: number } // count: its unfinished tasks, this one included
  | { kind: 'waiting'; task: TaskView }
  | { kind: 'deciding'; count: number } // asks in its chat wait on the user: a card or a question
  | { kind: 'idle' }

/** The open bot's failures are not flagged: the user is looking at its chat. */
export function botStatusOf(thread: Thread, seenAt: number, isOpen: boolean): BotStatus {
  const { tasks } = thread.panel
  const last = tasks.reduce<TaskView | undefined>(
    (latest, task) => ((task.endedAt ?? 0) > (latest?.endedAt ?? 0) ? task : latest),
    undefined,
  )
  if (!isOpen && last?.status === 'failed' && (last.endedAt ?? 0) > seenAt) return { kind: 'failed', task: last }
  const progress = progressOf(thread)
  if (progress) return { kind: 'replying', ...progress }
  const unfinished = tasks.filter(isUnfinished)
  const running = unfinished.find((task) => task.status === 'running')
  if (running) return { kind: 'working', task: running, count: unfinished.length }
  const [waiting] = unfinished
  if (waiting) return { kind: 'waiting', task: waiting }
  return thread.decisions ? { kind: 'deciding', count: thread.decisions } : { kind: 'idle' }
}

/** The disc on the avatar: replying and running a task are both work. Nothing while idle. */
export type DotKind = 'busy' | 'waiting' | 'failed' | 'deciding'

export const DOT_LABELS: Record<DotKind, string> = {
  busy: strings().sidebar.status.busy,
  waiting: strings().common.taskStatus.waiting,
  failed: strings().sidebar.status.failed,
  deciding: strings().sidebar.status.deciding,
}

export function dotKindOf(status: BotStatus): DotKind | null {
  switch (status.kind) {
    case 'replying':
    case 'working':
      return 'busy'
    case 'waiting':
    case 'failed':
    case 'deciding':
      return status.kind
    case 'idle':
      return null
    default:
      return status satisfies never
  }
}

/** The line under the bot's name in place of its last reply; null while idle, when the last reply stays. */
export function statusLineOf(status: BotStatus, now: number): string | null {
  switch (status.kind) {
    case 'failed':
      return strings().sidebar.status.failedTask(status.task.title, whenLabel(status.task.endedAt ?? now, now))
    case 'replying':
      return `${status.label} ${elapsedLabel(now - status.since)}`.trim()
    case 'working': {
      const elapsed = elapsedLabel(now - status.task.createdAt)
      if (status.count === 1) return strings().sidebar.status.running(status.task.title, elapsed).trim()
      return strings().sidebar.status.runningMany(status.task.title, status.count, elapsed).trim()
    }
    case 'waiting':
      return strings().sidebar.status.queued(status.task.title, strings().common.taskStatus.waiting)
    case 'deciding':
      return strings().sidebar.status.decidingCount(status.count)
    case 'idle':
      return null
    default:
      return status satisfies never
  }
}
