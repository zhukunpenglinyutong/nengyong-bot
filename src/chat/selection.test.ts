import { expect, it } from 'vitest'
import type { Message } from './chatMessages'
import { type SelectionEvent, selectableMessages, selectionOf } from './selection'

const seqsAfter = (events: SelectionEvent[]) => events.reduce(selectionOf, null)?.seqs

it('starts with the long-pressed message and picks the rows dragged over while the press is held', () => {
  expect(seqsAfter([{ kind: 'start', seq: 3 }])).toEqual([3])
  expect(
    seqsAfter([
      { kind: 'start', seq: 3 },
      { kind: 'drag', seq: 5 },
    ]),
  ).toEqual([3, 4, 5])
  expect(
    seqsAfter([
      { kind: 'start', seq: 3 },
      { kind: 'drag', seq: 1 },
    ]),
  ).toEqual([1, 2, 3])
})

it('toggles a pressed row, and the rows dragged over from it take the same side', () => {
  const picked: SelectionEvent[] = [
    { kind: 'start', seq: 2 },
    { kind: 'press', seq: 5, isRange: false },
  ]
  expect(seqsAfter(picked)).toEqual([2, 5])
  expect(seqsAfter([...picked, { kind: 'drag', seq: 7 }])).toEqual([2, 5, 6, 7])
  expect(seqsAfter([...picked, { kind: 'drag', seq: 7 }, { kind: 'press', seq: 6, isRange: false }])).toEqual([2, 5, 7])
  expect(
    seqsAfter([
      ...picked,
      { kind: 'drag', seq: 7 },
      { kind: 'press', seq: 6, isRange: false },
      { kind: 'drag', seq: 2 },
    ]),
  ).toEqual([7])
})

it('picks everything from the last row pressed without Shift to the one pressed with it', () => {
  const ranged: SelectionEvent[] = [
    { kind: 'start', seq: 2 },
    { kind: 'press', seq: 5, isRange: true },
  ]
  expect(seqsAfter(ranged)).toEqual([2, 3, 4, 5])
  expect(seqsAfter([...ranged, { kind: 'press', seq: 8, isRange: true }])).toEqual([2, 3, 4, 5, 6, 7, 8])
})

it('picks all the messages it is given, or none once all of them are picked', () => {
  const all: SelectionEvent = { kind: 'all', seqs: [1, 4, 9] }
  expect(seqsAfter([{ kind: 'start', seq: 4 }, all])).toEqual([1, 4, 9])
  expect(seqsAfter([{ kind: 'start', seq: 4 }, all, all])).toEqual([])
})

it('ignores presses and drags outside selection mode, and leaves it on end', () => {
  expect(seqsAfter([{ kind: 'press', seq: 1, isRange: false }])).toBeUndefined()
  expect(seqsAfter([{ kind: 'drag', seq: 1 }])).toBeUndefined()
  expect(seqsAfter([{ kind: 'start', seq: 1 }, { kind: 'end' }])).toBeUndefined()
})

it('offers the user and bot messages of the transcript, not the greeting, the streamed draft or notes', () => {
  const messages: Message[] = [
    { kind: 'note', text: '今天 9:00' },
    { kind: 'user', text: '你好', seq: 1, at: 10, attachments: ['uploads/a.png'] },
    { kind: 'bot', text: '好的', seq: 2, at: 20, requestId: 'chatcmpl-1' },
    { kind: 'from-bot', from: 'CEO', text: '帮我查' },
    { kind: 'bot', text: '正在' },
    { kind: 'queued', text: '还有' },
  ]
  expect(selectableMessages(messages)).toEqual([
    { kind: 'user', text: '你好', seq: 1, at: 10, attachments: ['uploads/a.png'] },
    { kind: 'bot', text: '好的', seq: 2, at: 20 },
  ])
})
