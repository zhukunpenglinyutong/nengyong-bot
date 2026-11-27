import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Bot } from '../../shared/bot'
import type { Entry, PanelData, TaskView } from '../../shared/bridge'
import type { Flow } from '../../shared/flow'
import { BotBadge } from './BotBadge'

const JOINED_AT = new Date('2026-11-02T09:24:00+08:00').getTime()
const NOW = new Date('2026-11-21T08:30:00+08:00').getTime()
const createdBot: Bot = { id: `b${JOINED_AT.toString(36)}9f2a`, name: '跟进专员', shape: 'drop', color: '#4A8CFF' }
const flow = (id: string, name: string): Flow => ({ id, name, when: '', steps: [], notes: [], updatedAt: JOINED_AT })
const PANEL: PanelData = {
  routines: [],
  flows: [flow('f1', '巡检汇报'), flow('f2', '周报'), flow('f3', '会议纪要')],
  skills: [],
  miniApps: [],
  library: [],
  tasks: [],
  models: { main: null, chat: null, tasks: null },
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const renderBadge = (bot: Bot, { entries = [], panel = PANEL }: { entries?: Entry[]; panel?: PanelData } = {}) => {
  const onOpenFlow = vi.fn()
  render(
    <BotBadge
      bot={bot}
      entries={entries}
      panel={panel}
      onRename={() => {}}
      onPickLook={() => {}}
      onOpenTab={() => {}}
      onOpenFlow={onOpenFlow}
    />,
  )
  return { onOpenFlow }
}

// turning over follows the press itself, never the end of an animation: a hot reload can leave those unfinished
const swipe = async () => {
  await userEvent.click(screen.getByRole('button', { name: '刷卡，翻到背面看工位' }))
  return screen.getByRole('button', { name: '翻回工牌' })
}

it('counts the days on the team from the creation time in the bot id, with the last of the id as its number', () => {
  renderBadge(createdBot)
  expect(screen.getByText('第 20 天')).toBeInTheDocument()
  expect(screen.getByText('工号 9F2A')).toBeInTheDocument()
})

it('counts a built-in bot from its first entry and numbers it by its whole id', () => {
  const entries: Entry[] = [{ kind: 'user', seq: 0, at: new Date('2026-11-20T23:50:00+08:00').getTime(), text: '你好' }]
  renderBadge({ ...createdBot, id: 'secretary' }, { entries })
  expect(screen.getByText('第 2 天')).toBeInTheDocument()
  expect(screen.getByText('工号 SECRETARY')).toBeInTheDocument()
})

it('shows the tier, level, conversations and flows read from the chat', () => {
  const entries: Entry[] = Array.from({ length: 25 }, (_, seq) => ({ kind: 'user', seq, at: JOINED_AT, text: '在吗' }))
  renderBadge(createdBot, { entries })
  expect(screen.getByText('Lv.2')).toBeInTheDocument()
  expect(screen.getByText('初识')).toBeInTheDocument()
  expect(screen.getByText('0/10')).toBeInTheDocument()
  expect(screen.getByText('25 次')).toBeInTheDocument()
  expect(screen.getByText('3 个')).toBeInTheDocument()
})

it('starts on its front, with no desk drawn on the back', () => {
  renderBadge(createdBot)
  expect(screen.queryByRole('button', { name: '翻回工牌' })).not.toBeInTheDocument()
})

it('turns over to the desk when its barcode is swiped, and back again', async () => {
  renderBadge(createdBot)
  const leave = await swipe()
  expect(leave.closest('[inert]')).toBeNull()
  expect(screen.getByRole('button', { name: '刷卡，翻到背面看工位' }).closest('[inert]')).not.toBeNull()
  await userEvent.click(leave)
  expect(screen.getByRole('button', { name: '刷卡，翻到背面看工位' }).closest('[inert]')).toBeNull()
  expect(leave.closest('[inert]')).not.toBeNull()
})

it('says on the desk which task the bot is running', async () => {
  const task: TaskView = {
    id: 't1',
    title: '整理周报',
    status: 'running',
    statusText: '',
    createdAt: NOW,
    endedAt: null,
    requestedBy: null,
    isRoutine: false,
  }
  renderBadge(createdBot, { panel: { ...PANEL, tasks: [task] } })
  await swipe()
  expect(screen.getByText('在跑「整理周报」')).toBeInTheDocument()
})

it('opens a flow from its binder on the shelf', async () => {
  const { onOpenFlow } = renderBadge(createdBot)
  await swipe()
  await userEvent.click(screen.getByRole('button', { name: '流程「周报」' }))
  expect(onOpenFlow).toHaveBeenCalledWith('f2')
})

it('pretends to work when poked while slacking off', async () => {
  renderBadge(createdBot)
  await swipe()
  await userEvent.click(screen.getByRole('button', { name: '戳一下跟进专员' }))
  expect(screen.getByRole('status')).toHaveTextContent(/.+/)
  expect(screen.getByText('被你抓到了，假装在看资料')).toBeInTheDocument()
})
