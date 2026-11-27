import { describe, expect, it } from 'vitest'
import type { Entry } from '../../shared/bridge'
import type { Trace } from '../../shared/debug'
import { islandNotices, NO_NOTICES, type NoticeEvent, type Notices } from './islandNotices'

const AT = Date.now()
const user = (seq: number): Entry => ({ seq, at: AT, kind: 'user', text: '在吗' })
const reply = (seq: number, text = '好的'): Entry => ({ seq, at: AT, kind: 'bot', text })
const taskResult = (
  seq: number,
  status: 'done' | 'failed',
  flowId?: string,
): Extract<Entry, { kind: 'task-result' }> => ({
  seq,
  at: AT,
  kind: 'task-result',
  taskId: 't1',
  title: '调研',
  status,
  text: '结论',
  flowId,
})
const savedFlow = (seq: number, output: object): Entry => ({
  seq,
  at: AT,
  kind: 'tool',
  name: 'save_flow',
  input: { name: '发版说明' },
  output,
})
const arrive = (botId: string, entry: Entry, before: Entry[] = [], isDebug = false): NoticeEvent => ({
  kind: 'entry',
  botId,
  activeId: 'chief',
  entry,
  before,
  isDebug,
})
const run = (...events: NoticeEvent[]): Notices => events.reduce(islandNotices, NO_NOTICES)
const kinds = (state: Notices) => state.queue.map((notice) => notice.kind)

describe('islandNotices', () => {
  it('announces a reply from a bot whose chat is not open', () => {
    expect(run(arrive('secretary', reply(1, '提醒已设好'))).queue).toEqual([
      { kind: 'reply', id: 1, botId: 'secretary', text: '提醒已设好' },
    ])
  })

  it('stays quiet about replies in the open chat', () => {
    expect(run(arrive('chief', reply(1))).queue).toEqual([])
  })

  it('keeps only the newest reply of each bot', () => {
    const state = run(arrive('secretary', reply(1, '第一条')), arrive('secretary', reply(2, '第二条')))
    expect(state.queue).toEqual([{ kind: 'reply', id: 2, botId: 'secretary', text: '第二条' }])
  })

  it('drops the replies of a bot once its chat is opened', () => {
    const state = run(arrive('secretary', reply(1)), arrive('github', reply(1)), { kind: 'seen', botId: 'secretary' })
    expect(state.queue.map((notice) => notice.kind === 'reply' && notice.botId)).toEqual(['github'])
  })

  it('announces a task of the open bot ending, done or failed', () => {
    const state = run(arrive('chief', taskResult(1, 'failed')))
    expect(state.queue).toEqual([{ kind: 'task', id: 1, title: '调研', isDone: false, points: 0 }])
  })

  it('says when the main model stood in for the model a task was set to', () => {
    const fellBack: Entry = { ...taskResult(1, 'done'), model: 'deepseek-flash', fallbackFrom: 'kimi-k2' }
    expect(run(arrive('chief', fellBack)).queue[0]).toMatchObject({ kind: 'task', fallbackFrom: 'kimi-k2' })
  })

  it('says what a task that followed a flow earned', () => {
    expect(run(arrive('chief', taskResult(1, 'done', 'f1'))).queue[0]).toMatchObject({ kind: 'task', points: 50 })
    const again = arrive('chief', taskResult(2, 'done', 'f1'), [taskResult(1, 'done', 'f1')])
    expect(run(again).queue[0]).toMatchObject({ kind: 'task', points: 10 })
  })

  it('announces a flow the open bot saved, saying whether it is new', () => {
    const state = run(arrive('chief', savedFlow(1, { saved: 'f1', isNew: true, mention: '[发版说明](flow:f1)' })))
    expect(state.queue).toEqual([
      { kind: 'learned', id: 1, botId: 'chief', flowId: 'f1', name: '发版说明', isNew: true, points: 30 },
      { kind: 'level-up', id: 2, botId: 'chief', from: 1, level: 4 },
    ])
    const updated = { saved: 'f1', isNew: false, mention: '[发版说明](flow:f1)' }
    expect(run(arrive('chief', savedFlow(1, updated))).queue).toMatchObject([{ isNew: false, points: 0 }])
  })

  it('stays quiet about a flow that failed to save, or one saved by a bot whose chat is not open', () => {
    expect(run(arrive('chief', savedFlow(1, { error: '最多 30 个流程' }))).queue).toEqual([])
    expect(run(arrive('secretary', savedFlow(1, { saved: 'f1', isNew: true, mention: '' }))).queue).toEqual([])
  })

  it('announces a level-up when an entry pushes the open bot over the next level', () => {
    const before = Array.from({ length: 24 }, (_, index) => user(index + 1))
    expect(run(arrive('chief', user(25), before)).queue).toEqual([
      { kind: 'level-up', id: 1, botId: 'chief', from: 1, level: 2 },
    ])
  })

  it('announces the task before the level-up it earned', () => {
    expect(kinds(run(arrive('chief', taskResult(1, 'done', 'f1'))))).toEqual(['task', 'level-up'])
  })

  it('celebrates no level-up for a task that followed no flow', () => {
    expect(kinds(run(arrive('chief', taskResult(1, 'done'))))).toEqual(['task'])
  })

  it('ignores an entry it has already counted', () => {
    const before = [1, 2, 3, 4, 5].map(user)
    expect(run(arrive('chief', user(5), before)).queue).toEqual([])
  })

  it('dismisses a notice by id', () => {
    const state = run(arrive('secretary', reply(1)), arrive('github', reply(1)), { kind: 'dismiss', id: 1 })
    expect(state.queue.map((notice) => notice.id)).toEqual([2])
  })
})

describe('islandNotices in debug mode', () => {
  const remembered: Entry = {
    seq: 3,
    at: AT,
    kind: 'tool',
    name: 'remember',
    input: { text: '周报周五交', scope: 'bot' },
    output: { saved: 'm1' },
  }
  const trace = (patch: Partial<Trace> = {}): Trace => ({
    id: 'chief',
    title: '聊天',
    startedAt: 1,
    endedAt: null,
    maxSteps: 12,
    inputs: [],
    compaction: { pending: 81, threshold: 80, folded: 41 },
    steps: [],
    finishReason: null,
    error: null,
    usage: null,
    ...patch,
  })
  const report = (next: Trace, before?: Trace, botId = 'chief'): NoticeEvent => ({
    kind: 'trace',
    botId,
    activeId: 'chief',
    trace: next,
    before,
  })

  it('says what the open bot just remembered, only in debug mode', () => {
    expect(run(arrive('chief', remembered, [], true)).queue).toEqual([
      { kind: 'remembered', id: 1, text: '周报周五交' },
    ])
    expect(run(arrive('chief', remembered)).queue).toEqual([])
  })

  it('stays quiet when remembering failed', () => {
    const failed = { ...remembered, output: { error: 'text 太长' } }
    expect(run(arrive('chief', failed, [], true)).queue).toEqual([])
  })

  it('announces a compaction once, when the run that did it starts', () => {
    const started = trace()
    expect(kinds(run(report(started), report({ ...started, steps: [] }, started)))).toEqual(['compacted'])
  })

  it('warns once when a chat turn ends on its step limit', () => {
    const running = trace({ compaction: null })
    const ended = { ...running, endedAt: 9, finishReason: 'tool-calls' }
    expect(kinds(run(report(running), report(ended, running), report(ended, ended)))).toEqual(['out-of-steps'])
  })

  it('leaves tasks and other bots to the notices they already have', () => {
    const ended = trace({ compaction: null, endedAt: 9, finishReason: 'tool-calls' })
    expect(run(report({ ...ended, id: 't1' }), report(ended, undefined, 'secretary')).queue).toEqual([])
  })
})
