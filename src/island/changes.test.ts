import { expect, it } from 'vitest'
import type { Entry } from '../../shared/bridge'
import { changesOf, fieldOf } from './changes'

const tool = (seq: number, name: string, input: object, output: unknown): Entry => ({
  seq,
  at: seq,
  kind: 'tool',
  name,
  input,
  output,
})

it('lists what the chat remembered, newest first, with the id it was saved under', () => {
  const changes = changesOf([
    tool(1, 'remember', { text: '称呼：老朱', scope: 'user' }, { saved: 'u1' }),
    tool(2, 'remember', { text: '周报周五交', scope: 'bot' }, { saved: 'm1' }),
  ])
  expect(changes.map((change) => [change.label, change.text])).toEqual([
    ['记忆 +1', '[m1] 周报周五交'],
    ['用户 +1', '[u1] 称呼：老朱'],
  ])
})

it('shows what a forgotten memory said', () => {
  const changes = changesOf([
    tool(1, 'remember', { text: '周报周四交', scope: 'bot' }, { saved: 'm3' }),
    tool(2, 'forget', { id: 'm3' }, { forgotten: 'm3' }),
  ])
  expect(changes[0]).toMatchObject({ label: '遗忘', text: '[m3] 周报周四交', seq: 2 })
})

it('keeps the duty a rewrite replaced, once an earlier rewrite is in the transcript', () => {
  const changes = changesOf([
    tool(1, 'update_my_instructions', { instructions: '汇总结论' }, { ok: true }),
    tool(2, 'update_my_instructions', { instructions: '汇总结论，周五写周报' }, { ok: true }),
  ])
  expect(changes.map((change) => change.before)).toEqual(['汇总结论', undefined])
})

it('shows the name a bot gave itself', () => {
  const changes = changesOf([tool(1, 'update_my_name', { name: '灵感记录' }, { ok: true })])
  expect(changes[0]).toMatchObject({ label: '名字', text: '灵感记录' })
})

it('names the routine a later call paused', () => {
  const changes = changesOf([
    tool(
      1,
      'create_routine',
      { name: '日报', cron: '0 9 * * *', prompt: '写', timezone: 'Asia/Shanghai' },
      { id: 'r1' },
    ),
    tool(2, 'set_routine_enabled', { id: 'r1', isEnabled: false }, { ok: true }),
  ])
  expect(changes.map((change) => change.text)).toEqual(['[r1] 日报', '[r1] 日报 · 0 9 * * *'])
  expect(changes[0]?.label).toBe('例行 暂停')
})

it('leaves out failed calls and tools that change nothing lasting', () => {
  const changes = changesOf([
    tool(1, 'forget', { id: 'm9' }, { error: '没有 id 为 m9 的记忆' }),
    tool(2, 'search_history', { query: '周报' }, []),
  ])
  expect(changes).toEqual([])
})

it('reads a string field of unknown JSON, and nothing else', () => {
  expect(fieldOf({ text: '好' }, 'text')).toBe('好')
  expect(fieldOf({ text: 1 }, 'text')).toBeUndefined()
  expect(fieldOf(null, 'text')).toBeUndefined()
})

it('shows a duty once the user agreed to its card, with the one it replaced', () => {
  const card = (seq: number, offer: string, purpose: string) =>
    tool(
      seq,
      'propose_duty',
      {},
      {
        offer,
        botId: 'writer',
        baseVersion: 0,
        plan: { purpose, objectives: [{ id: 'o1', name: '每周稳定更新', keyResults: [] }], outOfScope: [] },
        changes: [],
        isReviewOn: false,
      },
    )
  const answer = (seq: number, offer: string, isAccepted: boolean): Entry => ({
    seq,
    at: seq,
    kind: 'duty-answer',
    offer,
    botId: 'writer',
    isAccepted,
  })
  const changes = changesOf([
    card(1, 'd1', '运营公众号'),
    answer(2, 'd1', true),
    card(3, 'd2', '别断更'),
    answer(4, 'd2', false),
    card(5, 'd3', '让公众号每周稳定更新'),
    answer(6, 'd3', true),
  ])
  expect(changes.map((change) => [change.label, change.text, change.before])).toEqual([
    ['职责', '让公众号每周稳定更新 · 每周稳定更新', '运营公众号 · 每周稳定更新'],
    ['职责', '运营公众号 · 每周稳定更新', undefined],
  ])
})
