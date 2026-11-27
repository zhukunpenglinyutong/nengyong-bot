// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import type { HarnessEvent } from '../shared/bridge'
import type { DutyOffer } from '../shared/duty'
import { answerDutyOffer, dutyText, offerDuty, setReview, welcome } from './duty'
import { createStore, type Store } from './store'

let store: Store
let emit: (event: HarnessEvent) => void

beforeEach(() => {
  store = createStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'duty-')), 'data', 'nengyongbot.db'))
  store.syncRoster([
    { id: 'chief', name: 'CEO' },
    { id: 'writer', name: '公众号运营' },
  ])
  emit = vi.fn()
})

const POSTS = { text: '每周 2 篇成稿交用户审', window: '每周', source: '我自己数' }
const READS = { text: '平均阅读 1000', window: '到 12/31', source: '用户周一发截图' }
const plan = (objectives = [{ name: '公众号每周稳定更新', keyResults: [POSTS] }]) => ({
  purpose: '让公众号每周稳定更新',
  objectives,
  outOfScope: ['花钱投放'],
})

/** Shows a card in the writer's chat, the way propose_duty records it. */
function propose(offer: DutyOffer, chat = 'writer') {
  store.append(chat, { kind: 'tool', name: 'propose_duty', input: {}, output: { ...offer, note: '' } })
  return offer
}

const agree = (offer: DutyOffer, isReviewOn = false, chat = 'writer') =>
  answerDutyOffer(store, emit, chat, offer.offer, true, isReviewOn)

it('makes the agreed card the next version of the duty', () => {
  const offer = propose(offerDuty(store, 'writer', plan(), [], false))
  expect(agree(offer)).toEqual({ kind: 'duty-answer', offer: offer.offer, botId: 'writer', isAccepted: true })
  const { duty } = store.get().bots.writer
  expect(duty).toMatchObject({ version: 1, purpose: '让公众号每周稳定更新', outOfScope: ['花钱投放'] })
  expect(duty.objectives.map((objective) => objective.name)).toEqual(['公众号每周稳定更新'])
  expect(emit).toHaveBeenCalledWith({ kind: 'duty', botId: 'writer', duty })
})

it('leaves the duty as it was when the card is turned down', () => {
  const offer = propose(offerDuty(store, 'writer', plan(), [], true))
  expect(answerDutyOffer(store, emit, 'writer', offer.offer, false, true)).toMatchObject({ isAccepted: false })
  expect(store.get().bots.writer.duty.version).toBe(0)
  expect(store.get().bots.writer.routines).toEqual([])
})

it('keeps the id of an objective a new card names the same, and the progress of key results it words the same', () => {
  agree(propose(offerDuty(store, 'writer', plan(), [], false)))
  const [objective] = store.get().bots.writer.duty.objectives
  const progress = { text: '本周 1/2', ratio: 0.5, verdict: 'onTrack' as const, at: 1 }
  const withProgress = { ...objective, keyResults: [{ ...POSTS, progress }] }
  store.updateBot('writer', { duty: { ...store.get().bots.writer.duty, objectives: [withProgress] } })
  const next = offerDuty(store, 'writer', plan([{ name: '公众号每周稳定更新', keyResults: [POSTS, READS] }]), [], false)
  expect(next.plan.objectives[0]?.id).toBe(objective.id)
  agree(propose(next))
  const [kept] = store.get().bots.writer.duty.objectives
  expect(kept.keyResults).toEqual([{ ...POSTS, progress }, READS])
})

it('refuses a card a newer one for the same bot replaced', () => {
  const older = propose(offerDuty(store, 'writer', plan(), [], false))
  propose(offerDuty(store, 'writer', plan(), [], false))
  expect(() => agree(older)).toThrow('替代')
})

it('refuses a card answered already', () => {
  const offer = propose(offerDuty(store, 'writer', plan(), [], false))
  store.append('writer', agree(offer))
  expect(() => agree(offer)).toThrow('答复过')
})

it('refuses a card made before another version was agreed in another chat', () => {
  const fromWriter = propose(offerDuty(store, 'writer', plan(), [], false))
  agree(propose(offerDuty(store, 'writer', plan(), [], false), 'chief'), false, 'chief')
  expect(() => agree(fromWriter)).toThrow('作废')
})

it('makes the weekly review a Monday 9:00 routine the first time it is turned on, and pauses it after', () => {
  agree(propose(offerDuty(store, 'writer', plan(), [], true)), true)
  const [routine] = store.get().bots.writer.routines
  expect(routine).toMatchObject({ cron: '0 9 * * 1', isEnabled: true })
  expect(store.get().bots.writer.duty.reviewRoutineId).toBe(routine?.id)
  setReview(store, emit, 'writer', false)
  setReview(store, emit, 'writer', true)
  setReview(store, emit, 'writer', false)
  expect(store.get().bots.writer.routines).toEqual([{ ...routine, isEnabled: false }])
})

it('greets a new bot by asking what result the user wants, quoting the one line it was made with', () => {
  store.updateBot('writer', { duty: { ...store.get().bots.writer.duty, purpose: '运营公众号' } })
  const entry = welcome(store, 'writer')
  expect(entry.kind === 'bot' && entry.text).toContain('「运营公众号」')
  expect(store.history('writer')).toEqual([entry])
})

it('tells a chat with no duty agreed how to settle one, and a task only that none is', () => {
  const bot = store.get().bots.writer
  expect(dutyText(bot, true)).toContain('propose_duty')
  expect(dutyText(bot, false)).toBe('职责还没和用户定下来。')
})

it('lists an agreed duty with each key result, its progress, and whether the review runs', () => {
  agree(propose(offerDuty(store, 'writer', plan(), [], true)), true)
  const text = dutyText(store.get().bots.writer, true)
  expect(text).toContain('第 1 版')
  expect(text).toContain('1. 每周 2 篇成稿交用户审（每周；数来自：我自己数）—— 还没报过进度')
  expect(text).toContain('每周复盘：开着')
})
