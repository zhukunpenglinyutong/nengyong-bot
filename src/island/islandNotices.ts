import { z } from 'zod'
import type { Entry } from '../../shared/bridge'
import { FlowSaved } from '../../shared/flow'
import type { Trace } from '../../shared/debug'
import { fieldOf } from './changes'
import { pointsOf, trustOf } from '../../shared/trust'

/** Something the island shows for a moment and then drops: news the open chat does not show by itself. */
export type Notice =
  // a task the open bot started has ended; points: what it earned; fallbackFrom: its model, which the main one stood in for
  | { kind: 'task'; id: number; title: string; isDone: boolean; points: number; fallbackFrom?: string }
  | { kind: 'reply'; id: number; botId: string; text: string } // another bot replied
  | { kind: 'level-up'; id: number; botId: string; level: number }
  | { kind: 'learned'; id: number; botId: string; flowId: string; name: string; isNew: boolean; points: number } // the open bot saved a flow; botId: the chat may change before it shows
  | { kind: 'skill-learned'; id: number; botId: string; names: string[] } // the user installed skills from the open chat's card; botId: whose they are
  // debug mode only, about the open bot's chat
  | { kind: 'remembered'; id: number; text: string }
  | { kind: 'compacted'; id: number; folded: number }
  | { kind: 'out-of-steps'; id: number; maxSteps: number }

export interface Notices {
  queue: Notice[] // the first one is on the island
  nextId: number
}

export type NoticeEvent =
  | { kind: 'entry'; botId: string; activeId: string; entry: Entry; before: Entry[]; isDebug: boolean } // before: that bot's entries until now
  | { kind: 'trace'; botId: string; activeId: string; trace: Trace; before: Trace | undefined } // sent in debug mode only
  | { kind: 'seen'; botId: string } // that bot's chat is open now
  | { kind: 'dismiss'; id: number }

export const NO_NOTICES: Notices = { queue: [], nextId: 1 }

export function islandNotices(state: Notices, event: NoticeEvent): Notices {
  switch (event.kind) {
    case 'entry':
      return noticesFor(event).reduce(enqueue, state)
    case 'trace':
      return traceNotices(event).reduce(enqueue, state)
    case 'seen':
      return {
        ...state,
        queue: state.queue.filter((notice) => notice.kind !== 'reply' || notice.botId !== event.botId),
      }
    case 'dismiss':
      return { ...state, queue: state.queue.filter((notice) => notice.id !== event.id) }
    default:
      return event satisfies never
  }
}

// a save_flow record: its output is FlowSaved, unless the save failed
const SavedFlow = z.object({ input: z.object({ name: z.string() }), output: FlowSaved })

type Draft = Notice extends infer Each ? (Each extends Notice ? Omit<Each, 'id'> : never) : never

function noticesFor({ botId, activeId, entry, before, isDebug }: Extract<NoticeEvent, { kind: 'entry' }>): Draft[] {
  if (before.some((known) => known.seq === entry.seq)) return []
  if (botId !== activeId) return entry.kind === 'bot' ? [{ kind: 'reply', botId, text: entry.text }] : []
  const points = pointsOf(entry, before)
  const news = newsOf(entry, botId, isDebug, points)
  if (!points) return news
  const level = trustOf([...before, entry]).level
  return level > trustOf(before).level ? [...news, { kind: 'level-up', botId, level }] : news
}

function newsOf(entry: Entry, botId: string, isDebug: boolean, points: number): Draft[] {
  if (entry.kind === 'task-result')
    return [
      { kind: 'task', title: entry.title, isDone: entry.status === 'done', points, fallbackFrom: entry.fallbackFrom },
    ]
  if (entry.kind === 'skill-answer')
    return entry.names.length ? [{ kind: 'skill-learned', botId: entry.botId, names: entry.names }] : []
  if (entry.kind !== 'tool') return []
  if (entry.name === 'save_flow') {
    const saved = SavedFlow.safeParse(entry)
    if (!saved.success) return [] // the save failed: its output is the error
    const { input, output } = saved.data
    return [{ kind: 'learned', botId, flowId: output.saved, name: input.name, isNew: output.isNew, points }]
  }
  const isSaved = entry.name === 'remember' && fieldOf(entry.output, 'saved') !== undefined
  const text = isSaved && isDebug ? fieldOf(entry.input, 'text') : undefined
  return text ? [{ kind: 'remembered', text }] : []
}

function traceNotices({ botId, activeId, trace, before }: Extract<NoticeEvent, { kind: 'trace' }>): Draft[] {
  if (botId !== activeId || trace.id !== botId) return [] // tasks already announce how they end
  const isNew = before?.startedAt !== trace.startedAt
  const hasJustEnded = trace.endedAt !== null && (isNew || before?.endedAt === null)
  const folded = isNew ? (trace.compaction?.folded ?? 0) : 0
  return [
    ...(folded ? [{ kind: 'compacted' as const, folded }] : []),
    ...(hasJustEnded && trace.finishReason === 'tool-calls'
      ? [{ kind: 'out-of-steps' as const, maxSteps: trace.maxSteps }]
      : []),
  ]
}

function enqueue(state: Notices, draft: Draft): Notices {
  const queue = state.queue.filter((notice) => !isSameNews(notice, draft))
  return { queue: [...queue, { ...draft, id: state.nextId }], nextId: state.nextId + 1 }
}

function isSameNews(notice: Notice, draft: Draft): boolean {
  if (notice.kind === 'reply' && draft.kind === 'reply') return notice.botId === draft.botId
  if (notice.kind === 'compacted' && draft.kind === 'compacted') return true // one run can be reported twice before the first report is seen
  if (notice.kind === 'level-up' && draft.kind === 'level-up')
    return notice.botId === draft.botId && notice.level === draft.level
  return false
}
