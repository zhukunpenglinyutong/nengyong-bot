// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import type { HarnessEvent } from '../shared/bridge'
import { createNotifier } from './notifications'

interface ShownNotification {
  title: string
  body: string
  isClosed: boolean
  click: () => void
}

const shown = vi.hoisted((): ShownNotification[] => [])

vi.mock('electron', () => ({
  Notification: Object.assign(
    vi.fn(function (options: { title: string; body: string }) {
      const notification: ShownNotification & Record<string, unknown> = {
        ...options,
        isClosed: false,
        click: () => {},
        on: (_event: 'click', listener: () => void) => {
          notification.click = listener
        },
        show: () => shown.push(notification),
        close: () => {
          notification.isClosed = true
        },
      }
      return notification
    }),
    { isSupported: () => true },
  ),
}))

let isFocused: boolean
let opened: string[]
const window = { isFocused: () => isFocused, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
const stamp = { seq: 1, at: 0 }

function turn(notify: (event: HarnessEvent) => void, botId: string, replies: string[]) {
  notify({ kind: 'busy', botId, busy: true, runId: 'r1' })
  for (const text of replies) notify({ kind: 'entry', botId, entry: { ...stamp, kind: 'bot', text } })
  notify({ kind: 'busy', botId, busy: false, runId: 'r1' })
}

function notifier() {
  return createNotifier({
    window: () => window,
    botName: (botId) => (botId === 'chief' ? 'CEO' : botId),
    onOpen: (botId) => opened.push(botId),
  })
}

beforeEach(() => {
  shown.length = 0
  isFocused = false
  opened = []
  vi.clearAllMocks()
})

it('shows the last reply of a turn that ends while the window is in the background, as plain text', () => {
  turn(notifier(), 'chief', ['先看一下', '明天 **10 点** 开会，见 [秘书](bot:secretary)'])
  expect(shown.map(({ title, body }) => ({ title, body }))).toEqual([
    { title: 'CEO', body: '明天 10 点 开会，见 秘书' },
  ])
})

it('stays quiet while the window is focused', () => {
  isFocused = true
  turn(notifier(), 'chief', ['好的'])
  expect(shown).toEqual([])
})

it('stays quiet when a turn ends without a reply', () => {
  turn(notifier(), 'chief', [])
  expect(shown).toEqual([])
})

it('cuts a long reply down to 140 characters', () => {
  turn(notifier(), 'chief', ['好'.repeat(300)])
  expect(shown[0]?.body).toBe(`${'好'.repeat(139)}…`)
})

it('replaces the earlier notification of the same bot', () => {
  const notify = notifier()
  turn(notify, 'chief', ['第一条'])
  turn(notify, 'chief', ['第二条'])
  expect(shown.map(({ body, isClosed }) => ({ body, isClosed }))).toEqual([
    { body: '第一条', isClosed: true },
    { body: '第二条', isClosed: false },
  ])
})

it('brings the window forward and opens the bot when its notification is clicked', () => {
  turn(notifier(), 'chief', ['好的'])
  shown[0]?.click()
  expect(window.restore).toHaveBeenCalled()
  expect(window.focus).toHaveBeenCalled()
  expect(opened).toEqual(['chief'])
})
