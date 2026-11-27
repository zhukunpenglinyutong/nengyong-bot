import type { Activity, Entry, HarnessEvent, PanelData, TasksAndRoutines } from '../shared/bridge'
import type { ContextView, Trace } from '../shared/debug'

const MAX_TASK_TRACES = 5 // the chat's own run is always kept

/** What the renderer knows about each bot, keyed by bot id. */
export type Threads = Record<string, Thread>

export interface Thread {
  entries: Entry[]
  streaming: string // the reply being streamed right now
  queued: string[] // sent while a turn runs; the next turn reads them
  error?: string
  progress?: Progress // set while a turn is running
  preview: string // the last reply, for the sidebar
  panel: PanelData
  context: ContextView | null // what its chat sends the model, for debug mode
  traces: Trace[] // its last chat turn and its latest tasks, newest first, for debug mode
  miniAppData: Record<string, MiniAppData> // by mini app id: the latest data a task put in, for its open window
}

/** New data a task put in a mini app, stamped with when: a window posts each one to its page once. */
export interface MiniAppData {
  data: unknown
  dataAt: number
}

interface Progress {
  runId: string // the turn, which a stop names
  activity: Activity | null
  since: number // for "· N 分钟"
  draw: number // 0..1, picks this turn's phrase so the label does not flicker
}

export type ThreadEvent =
  // the rest change the sidebar, the settings, the update or the open bot, not a thread; useHarness, useSettings or useUpdate takes them
  | Exclude<
      HarnessEvent,
      {
        kind:
          | 'busy'
          | 'bot-created'
          | 'bot-renamed'
          | 'bot-moved'
          | 'bot-dismissed'
          | 'open-settings'
          | 'open-bot'
          | 'devices'
          | 'pairing'
          | 'update-progress'
          | 'update-error'
      }
    >
  // stamped by the listener, so the reducer needs neither the clock nor a random number
  | { kind: 'busy'; botId: string; busy: boolean; runId: string; since: number; draw: number }
  | { kind: 'loaded'; botId: string; entries: Entry[]; panel: PanelData }
  | { kind: 'previews'; previews: Record<string, string> }
  | { kind: 'tasks-and-routines'; byBot: Record<string, TasksAndRoutines> }
  | { kind: 'sent'; botId: string }
  | { kind: 'deleted'; botId: string; seqs: number[] } // the harness has deleted these messages of its chat

export const EMPTY_THREAD: Thread = {
  entries: [],
  streaming: '',
  queued: [],
  preview: '',
  panel: {
    routines: [],
    flows: [],
    skills: [],
    miniApps: [],
    library: [],
    tasks: [],
    models: { main: null, chat: null, tasks: null },
  },
  context: null,
  traces: [],
  miniAppData: {},
}

export function harnessState(state: Threads, event: ThreadEvent): Threads {
  switch (event.kind) {
    case 'entry': {
      const entries = merge(threadOf(state, event.botId).entries, [event.entry])
      if (event.entry.kind !== 'bot') return patch(state, event.botId, { entries })
      // the committed reply replaces the streamed draft in the same render, so the bubble does not blink
      return patch(state, event.botId, { entries, streaming: '', preview: event.entry.text })
    }
    case 'streaming':
      return patch(state, event.botId, { streaming: event.text })
    case 'queued':
      return patch(state, event.botId, { queued: event.texts })
    case 'busy': {
      if (!event.busy) return patch(state, event.botId, { progress: undefined })
      return patch(state, event.botId, {
        progress: { runId: event.runId, activity: null, since: event.since, draw: event.draw },
        error: undefined,
      })
    }
    case 'activity': {
      const { progress } = threadOf(state, event.botId)
      return progress ? patch(state, event.botId, { progress: { ...progress, activity: event.activity } }) : state
    }
    case 'error':
      return patch(state, event.botId, { error: event.message })
    case 'sent':
      return patch(state, event.botId, { error: undefined })
    case 'deleted': {
      const entries = threadOf(state, event.botId).entries.filter((entry) => !event.seqs.includes(entry.seq))
      const lastReply = entries.findLast((entry) => entry.kind === 'bot')
      return patch(state, event.botId, { entries, preview: lastReply?.kind === 'bot' ? lastReply.text : '' })
    }
    case 'loaded': {
      // events may have arrived while the history was loading: keep both
      const { entries, panel } = threadOf(state, event.botId)
      return patch(state, event.botId, {
        entries: merge(event.entries, entries),
        panel: underEvents(panel, event.panel),
      })
    }
    case 'routines':
      return patch(state, event.botId, { panel: { ...threadOf(state, event.botId).panel, routines: event.routines } })
    case 'flows':
      return patch(state, event.botId, { panel: { ...threadOf(state, event.botId).panel, flows: event.flows } })
    case 'skills':
      return patch(state, event.botId, { panel: { ...threadOf(state, event.botId).panel, skills: event.skills } })
    case 'mini-apps':
      return patch(state, event.botId, { panel: { ...threadOf(state, event.botId).panel, miniApps: event.miniApps } })
    case 'mini-app-data': {
      const { miniAppData } = threadOf(state, event.botId)
      const latest = { data: event.data, dataAt: event.dataAt }
      return patch(state, event.botId, { miniAppData: { ...miniAppData, [event.miniAppId]: latest } })
    }
    case 'library':
      return patch(state, event.botId, { panel: { ...threadOf(state, event.botId).panel, library: event.library } })
    case 'tasks':
      return patch(state, event.botId, { panel: { ...threadOf(state, event.botId).panel, tasks: event.tasks } })
    case 'models':
      return patch(state, event.botId, { panel: { ...threadOf(state, event.botId).panel, models: event.models } })
    case 'context':
      return patch(state, event.botId, { context: event.context })
    case 'trace':
      return patch(state, event.botId, {
        traces: withTrace(threadOf(state, event.botId).traces, event.trace, event.botId),
      })
    case 'previews':
      // a reply that arrived in the meantime is newer than the loaded preview
      return Object.entries(event.previews).reduce(
        (next, [botId, preview]) => patch(next, botId, { preview: threadOf(next, botId).preview || preview }),
        state,
      )
    case 'tasks-and-routines':
      return Object.entries(event.byBot).reduce(
        (next, [botId, snapshot]) => patch(next, botId, { panel: underEvents(threadOf(next, botId).panel, snapshot) }),
        state,
      )
    default:
      return event satisfies never
  }
}

const threadOf = (state: Threads, botId: string) => state[botId] ?? EMPTY_THREAD

/** A snapshot read from the harness, under what events or an earlier snapshot already brought, which is newer. */
function underEvents(panel: PanelData, snapshot: Partial<PanelData>): PanelData {
  const newer = <K extends keyof PanelData>(key: K): PanelData[K] =>
    panel[key] === EMPTY_THREAD.panel[key] ? (snapshot[key] ?? panel[key]) : panel[key]
  return {
    routines: newer('routines'),
    flows: newer('flows'),
    skills: newer('skills'),
    miniApps: newer('miniApps'),
    library: newer('library'),
    tasks: newer('tasks'),
    models: newer('models'),
  }
}

function patch(state: Threads, botId: string, changes: Partial<Thread>): Threads {
  return { ...state, [botId]: { ...threadOf(state, botId), ...changes } }
}

// a run reports itself again at every step: the newer report replaces the older one in place
function withTrace(traces: Trace[], trace: Trace, botId: string): Trace[] {
  const next = [trace, ...traces.filter((known) => known.id !== trace.id)].sort((a, b) => b.startedAt - a.startedAt)
  const tasks = next.filter((known) => known.id !== botId).slice(0, MAX_TASK_TRACES)
  return next.filter((known) => known.id === botId || tasks.includes(known))
}

function merge(known: Entry[], incoming: Entry[]): Entry[] {
  const seen = new Set(known.map((entry) => entry.seq))
  return [...known, ...incoming.filter((entry) => !seen.has(entry.seq))].sort((a, b) => a.seq - b.seq)
}
