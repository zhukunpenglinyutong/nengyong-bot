import { expect, it } from 'vitest'
import { MAIN_BOT } from '../../shared/bot'
import { chatMessages } from './chatMessages'

const stamp = (seq: number, at = Date.now()) => ({ seq, at })
const now = Date.parse('2026-11-18T12:00:00+08:00')
const minutesAgo = (minutes: number) => now - minutes * 60_000

it('inserts time dividers after 20 minutes of silence and labels delegated requests and routine runs', () => {
  const messages = chatMessages(
    {
      entries: [
        { ...stamp(1, minutesAgo(60)), kind: 'user', text: 'a' },
        { ...stamp(2, minutesAgo(59)), kind: 'bot', text: 'b' },
        { ...stamp(3, minutesAgo(59)), kind: 'tool', name: 'remember', input: {}, output: {} },
        { ...stamp(4, minutesAgo(10)), kind: 'from-bot', from: 'chief', text: 'c' },
        { ...stamp(5, minutesAgo(9)), kind: 'routine', name: '日报', text: '写日报' },
      ],
      streaming: '',
      queued: [],
    },
    MAIN_BOT,
    [MAIN_BOT],
    now,
  )
  expect(messages).toEqual([
    { kind: 'note', text: '今天 11:00' },
    { kind: 'user', text: 'a', seq: 1, at: minutesAgo(60) },
    { kind: 'bot', text: 'b', seq: 2, at: minutesAgo(59) },
    { kind: 'note', text: '今天 11:50' },
    { kind: 'from-bot', from: 'CEO', text: 'c' },
    { kind: 'note', text: '例行任务「日报」开始运行' },
  ])
})

it('shows a task result as a one-line note, before the reply that reports it', () => {
  const entries = [
    {
      ...stamp(1, now),
      kind: 'task-result' as const,
      taskId: 't1',
      title: '日报',
      status: 'done' as const,
      text: '三件事',
    },
    {
      ...stamp(2, now),
      kind: 'task-result' as const,
      taskId: 't2',
      title: '周报',
      status: 'failed' as const,
      text: '断网',
    },
    { ...stamp(3, now), kind: 'bot' as const, text: '日报写好了' },
  ]
  expect(chatMessages({ entries, streaming: '', queued: [] }, MAIN_BOT, [MAIN_BOT], now)).toEqual([
    { kind: 'note', text: '今天 12:00' },
    { kind: 'note', text: '任务「日报」完成' },
    { kind: 'note', text: '任务「周报」失败' },
    { kind: 'bot', text: '日报写好了', seq: 3, at: now },
  ])
})

it('names on a task result the model it ran on, and the one the main model stood in for', () => {
  const result = { ...stamp(1, now), kind: 'task-result' as const, taskId: 't1', status: 'done' as const, text: '' }
  const entries = [
    { ...result, title: '日报', model: 'kimi-k2' },
    { ...result, seq: 2, title: '巡检', model: 'deepseek-flash', fallbackFrom: 'kimi-k2' },
  ]
  expect(chatMessages({ entries, streaming: '', queued: [] }, MAIN_BOT, [MAIN_BOT], now).slice(1)).toEqual([
    { kind: 'note', text: '任务「日报」完成 · kimi-k2' },
    { kind: 'note', text: '任务「巡检」完成 · kimi-k2 连不上，用了主模型' },
  ])
})

it('keeps on a reply the model the main model stood in for', () => {
  const entries = [
    { ...stamp(1, now), kind: 'bot' as const, text: '在', model: 'deepseek-flash', fallbackFrom: 'qwen3' },
  ]
  expect(chatMessages({ entries, streaming: '', queued: [] }, MAIN_BOT, [MAIN_BOT], now).at(-1)).toMatchObject({
    model: 'deepseek-flash',
    fallbackFrom: 'qwen3',
  })
})

it('greets in an empty conversation, then appends the streamed reply and the last error', () => {
  expect(
    chatMessages({ entries: [], streaming: '正在', queued: [], error: '余额不足' }, MAIN_BOT, [MAIN_BOT], now),
  ).toEqual([
    { kind: 'bot', text: '你好，我是CEO。告诉我你希望我负责什么，需要执行时我会先向你确认。' },
    { kind: 'bot', text: '正在' },
    { kind: 'note', text: '出错了：余额不足' },
  ])
})

it('puts queued messages after the streamed reply, with a note that they are read when this turn ends', () => {
  const entries = [{ ...stamp(1, now), kind: 'user' as const, text: 'A' }]
  expect(chatMessages({ entries, streaming: '正在', queued: ['B', 'C'] }, MAIN_BOT, [MAIN_BOT], now)).toEqual([
    { kind: 'note', text: '今天 12:00' },
    { kind: 'user', text: 'A', seq: 1, at: now },
    { kind: 'bot', text: '正在' },
    { kind: 'queued', text: 'B' },
    { kind: 'queued', text: 'C' },
    { kind: 'note', text: 'CEO 正忙，这一轮做完后一起看' },
  ])
})

it('offers the suggestions of the last message until anything follows it', () => {
  const greeting = { ...stamp(1, minutesAgo(1)), kind: 'bot' as const, text: '你好', suggestions: ['试试这个'] }
  const thread = { entries: [greeting], streaming: '', queued: [] }
  expect(chatMessages(thread, MAIN_BOT, [MAIN_BOT], now).at(-1)).toEqual({
    kind: 'bot',
    text: '你好',
    seq: 1,
    at: minutesAgo(1),
    suggestions: ['试试这个'],
  })
  const answered = chatMessages(
    { ...thread, entries: [greeting, { ...stamp(2, minutesAgo(1)), kind: 'user', text: '好' }] },
    MAIN_BOT,
    [MAIN_BOT],
    now,
  )
  expect(answered.find((message) => message.kind === 'bot')).toEqual({
    kind: 'bot',
    text: '你好',
    seq: 1,
    at: minutesAgo(1),
  })
})

it('carries what a user message quotes, and which model and API call wrote a reply', () => {
  const entries = [
    { ...stamp(1, now), kind: 'bot' as const, text: '三件事', model: 'deepseek-flash', requestId: 'chatcmpl-1' },
    { ...stamp(2, now), kind: 'user' as const, text: '第二件呢', quote: { seq: 1, text: '三件事' } },
  ]
  expect(chatMessages({ entries, streaming: '', queued: [] }, MAIN_BOT, [MAIN_BOT], now).slice(1)).toEqual([
    { kind: 'bot', text: '三件事', seq: 1, at: now, model: 'deepseek-flash', requestId: 'chatcmpl-1' },
    { kind: 'user', text: '第二件呢', seq: 2, at: now, quote: { seq: 1, text: '三件事' } },
  ])
})

it('shows each duty card once, with its answer, and an unanswered one a newer card replaced as replaced', () => {
  const offer = (id: string, botId = 'writer') => ({
    offer: id,
    botId,
    baseVersion: 0,
    plan: { purpose: '', objectives: [], outOfScope: [] },
    changes: [],
    isReviewOn: false,
  })
  const card = (seq: number, id: string, botId?: string) => ({
    ...stamp(seq, now),
    kind: 'tool' as const,
    name: 'propose_duty',
    input: {},
    output: { ...offer(id, botId), note: '' },
  })
  const entries = [
    card(1, 'd1'),
    card(2, 'd2'),
    card(3, 'd3', 'chief'),
    { ...stamp(4, now), kind: 'duty-answer' as const, offer: 'd2', botId: 'writer', isAccepted: true },
  ]
  expect(chatMessages({ entries, streaming: '', queued: [] }, MAIN_BOT, [MAIN_BOT], now).slice(1)).toEqual([
    { kind: 'duty-offer', offer: offer('d1'), isAgreed: null, isReplaced: true },
    { kind: 'duty-offer', offer: offer('d2'), isAgreed: true, isReplaced: false },
    { kind: 'duty-offer', offer: offer('d3', 'chief'), isAgreed: null, isReplaced: false },
  ])
})
