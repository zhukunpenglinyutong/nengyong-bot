import { expect, it } from 'vitest'
import type { Entry } from '../shared/bridge'
import type { Trace } from '../shared/debug'
import { harnessState, type ThreadEvent, type Threads } from './harnessState'

const user = (seq: number, text: string): Entry => ({ seq, at: seq, kind: 'user', text })
const reply = (seq: number, text: string): Entry => ({ seq, at: seq, kind: 'bot', text })
const run = (events: ThreadEvent[], state: Threads = {}) => events.reduce(harnessState, state)
const NO_MODELS = { main: null, chat: null, tasks: null }

it('keeps entries in order and without duplicates, whatever order they arrive in', () => {
  const state = run([
    { kind: 'entry', botId: 'chief', entry: user(2, 'b') },
    { kind: 'entry', botId: 'chief', entry: user(1, 'a') },
    { kind: 'entry', botId: 'chief', entry: user(2, 'b') },
  ])
  expect(state.chief.entries.map((entry) => entry.seq)).toEqual([1, 2])
})

it('replaces the streamed draft with the committed reply and remembers it as the preview', () => {
  const state = run([
    { kind: 'draft', botId: 'chief', text: '正在' },
    { kind: 'entry', botId: 'chief', entry: reply(1, '好了') },
  ])
  expect(state.chief).toMatchObject({ draft: '', preview: '好了' })
})

it('keeps the draft while the user entry of the same turn arrives', () => {
  const state = run([
    { kind: 'draft', botId: 'chief', text: '正在' },
    { kind: 'entry', botId: 'chief', entry: user(1, '你好') },
  ])
  expect(state.chief.draft).toBe('正在')
})

it('tracks progress only while a turn is running', () => {
  const busy: ThreadEvent = { kind: 'busy', botId: 'chief', busy: true, runId: 'r1', since: 100, draw: 0.5 }
  const working = run([busy, { kind: 'activity', botId: 'chief', activity: { kind: 'typing' } }])
  expect(working.chief.progress).toEqual({ runId: 'r1', activity: { kind: 'typing' }, since: 100, draw: 0.5 })
  expect(run([{ ...busy, busy: false }], working).chief.progress).toBeUndefined()
  const idle = run([{ kind: 'activity', botId: 'chief', activity: { kind: 'typing' } }])
  expect(idle).toEqual({}) // a late activity after the turn ended changes nothing
})

it('shows an error until the next message is sent', () => {
  const failed = run([{ kind: 'error', botId: 'chief', message: '余额不足' }])
  expect(failed.chief.error).toBe('余额不足')
  expect(run([{ kind: 'sent', botId: 'chief' }], failed).chief.error).toBeUndefined()
})

it('drops the error of the last turn once the next one starts, even one a task result started', () => {
  const failed = run([{ kind: 'error', botId: 'chief', message: '连不上模型服务' }])
  const next = run([{ kind: 'busy', botId: 'chief', busy: true, runId: 'r1', since: 100, draw: 0.5 }], failed)
  expect(next.chief.error).toBeUndefined()
})

it('shows the messages waiting for the next turn, replacing the list each time', () => {
  const waiting = run([
    { kind: 'queued', botId: 'chief', texts: ['B'] },
    { kind: 'queued', botId: 'chief', texts: ['B', 'C'] },
  ])
  expect(waiting.chief.queued).toEqual(['B', 'C'])
  expect(run([{ kind: 'queued', botId: 'chief', texts: [] }], waiting).chief.queued).toEqual([])
})

it('merges loaded history with entries that arrived while it was loading', () => {
  const panel = {
    routines: [routine(false)],
    flows: [],
    skills: [],
    miniApps: [],
    library: [],
    tasks: [],
    models: NO_MODELS,
  }
  const state = run([
    { kind: 'entry', botId: 'chief', entry: reply(3, '新的') },
    { kind: 'loaded', botId: 'chief', entries: [user(1, 'a'), reply(2, 'b')], panel },
  ])
  expect(state.chief.entries.map((entry) => entry.seq)).toEqual([1, 2, 3])
  expect(state.chief.panel).toBe(panel)
})

it('replaces the panel routines when the bot changes them, keeping the library', () => {
  const library = [{ kind: 'doc' as const, path: '周报.md', writtenAt: 1 }]
  const state = run([
    {
      kind: 'loaded',
      botId: 'chief',
      entries: [],
      panel: { routines: [routine(false)], flows: [], skills: [], miniApps: [], library, tasks: [], models: NO_MODELS },
    },
    { kind: 'routines', botId: 'chief', routines: [routine(true)] },
  ])
  expect(state.chief.panel).toEqual({
    routines: [routine(true)],
    flows: [],
    skills: [],
    miniApps: [],
    library,
    tasks: [],
    models: NO_MODELS,
  })
})

it('replaces the panel library when the bot writes a file, keeping the routines', () => {
  const library = [{ kind: 'doc' as const, path: 'github/日报.md', writtenAt: 2 }]
  const state = run([
    {
      kind: 'loaded',
      botId: 'chief',
      entries: [],
      panel: {
        routines: [routine(true)],
        flows: [],
        skills: [],
        miniApps: [],
        library: [],
        tasks: [],
        models: NO_MODELS,
      },
    },
    { kind: 'library', botId: 'chief', library },
  ])
  expect(state.chief.panel).toEqual({
    routines: [routine(true)],
    flows: [],
    skills: [],
    miniApps: [],
    library,
    tasks: [],
    models: NO_MODELS,
  })
})

it('replaces the panel tasks when they change, keeping the routines and the library', () => {
  const library = [{ kind: 'doc' as const, path: 'github/日报.md', writtenAt: 2 }]
  const task = {
    id: 't1',
    title: '日报',
    status: 'running' as const,
    statusText: '',
    createdAt: 1,
    endedAt: null,
    requestedBy: null,
    isRoutine: false,
  }
  const state = run([
    {
      kind: 'loaded',
      botId: 'chief',
      entries: [],
      panel: { routines: [routine(true)], flows: [], skills: [], miniApps: [], library, tasks: [], models: NO_MODELS },
    },
    { kind: 'tasks', botId: 'chief', tasks: [task] },
  ])
  expect(state.chief.panel).toEqual({
    routines: [routine(true)],
    flows: [],
    skills: [],
    miniApps: [],
    library,
    tasks: [task],
    models: NO_MODELS,
  })
})

it('replaces the panel flows when the bot saves one, keeping the rest of the panel', () => {
  const library = [{ kind: 'doc' as const, path: 'release/v0.9.md', writtenAt: 2 }]
  const flow = { id: 'f1', name: '发版说明', when: '发版前', steps: ['列 PR'], notes: [], updatedAt: 1 }
  const state = run([
    {
      kind: 'loaded',
      botId: 'chief',
      entries: [],
      panel: { routines: [routine(true)], flows: [], skills: [], miniApps: [], library, tasks: [], models: NO_MODELS },
    },
    { kind: 'flows', botId: 'chief', flows: [flow] },
  ])
  expect(state.chief.panel).toEqual({
    routines: [routine(true)],
    flows: [flow],
    skills: [],
    miniApps: [],
    library,
    tasks: [],
    models: NO_MODELS,
  })
})

it('replaces the models the panel shows when the bot switches its chat model', () => {
  const models = { main: 'deepseek-flash', chat: { model: 'kimi-k2', isGone: false }, tasks: null }
  const state = run([{ kind: 'models', botId: 'chief', models }])
  expect(state.chief.panel.models).toEqual(models)
})

it('lets a reply that already arrived win over the loaded preview', () => {
  const state = run([
    { kind: 'entry', botId: 'chief', entry: reply(1, '新回复') },
    { kind: 'previews', previews: { chief: '旧回复', flow: '已记录' } },
  ])
  expect([state.chief.preview, state.flow.preview]).toEqual(['新回复', '已记录'])
})

it('fills in the tasks and routines of every bot from the startup snapshot', () => {
  const state = run([{ kind: 'tasks-and-routines', byBot: { chief: { tasks: [], routines: [routine(true)] } } }])
  expect(state.chief.panel.routines).toEqual([routine(true)])
})

it('lets tasks that already changed win over the startup snapshot', () => {
  const state = run([
    { kind: 'tasks', botId: 'chief', tasks: [] },
    { kind: 'tasks-and-routines', byBot: { chief: { tasks: [{ ...taskOf('旧'), status: 'running' }], routines: [] } } },
  ])
  expect(state.chief.panel.tasks).toEqual([])
})

function taskOf(title: string) {
  return {
    id: title,
    title,
    status: 'done' as const,
    statusText: '',
    createdAt: 1,
    endedAt: 2,
    requestedBy: null,
    isRoutine: false,
  }
}

function routine(isEnabled: boolean) {
  return { id: 'r1', name: '简报', timezone: 'Asia/Shanghai', isEnabled, nextRunAt: isEnabled ? 1 : null }
}

const trace = (id: string, startedAt: number, endedAt: number | null = null): Trace => ({
  id,
  title: id,
  startedAt,
  endedAt,
  maxSteps: 12,
  inputs: [],
  compaction: null,
  steps: [],
  finishReason: null,
  error: null,
  usage: null,
})
const report = (next: Trace): ThreadEvent => ({ kind: 'trace', botId: 'chief', trace: next })

it('keeps one report per run, the newest in place of the older', () => {
  const state = run([report(trace('chief', 1)), report(trace('t1', 2)), report(trace('chief', 1, 5))])
  expect(state.chief.traces.map((known) => [known.id, known.endedAt])).toEqual([
    ['t1', null],
    ['chief', 5],
  ])
})

it('keeps the chat run while older task runs make way for newer ones', () => {
  const tasks = Array.from({ length: 7 }, (_, index) => report(trace(`t${index}`, index + 2)))
  const state = run([report(trace('chief', 1)), ...tasks])
  expect(state.chief.traces.map((known) => known.id)).toEqual(['t6', 't5', 't4', 't3', 't2', 'chief'])
})

it('drops deleted messages and falls back to the last reply left as the preview', () => {
  const state = run([
    { kind: 'entry', botId: 'chief', entry: user(1, 'a') },
    { kind: 'entry', botId: 'chief', entry: reply(2, 'b') },
    { kind: 'entry', botId: 'chief', entry: reply(3, 'c') },
    { kind: 'deleted', botId: 'chief', seqs: [1, 3] },
  ])
  expect(state.chief.entries.map((entry) => entry.seq)).toEqual([2])
  expect(state.chief.preview).toBe('b')
})
