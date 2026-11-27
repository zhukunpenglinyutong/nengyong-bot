import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { MAIN_BOT } from '../../shared/bot'
import type { Entry } from '../../shared/bridge'
import type { ContextView, Trace } from '../../shared/debug'
import { type Navigation, NavigationContext } from '../NavigationContext'
import { BotIsland } from './BotIsland'

afterEach(cleanup)

const context: ContextView = {
  model: 'deepseek-chat',
  windowTokens: 1_000_000,
  sections: [
    { heading: null, text: '你是「CEO」。' },
    { heading: '你的记忆', text: '- [m1] 周报周五交' },
  ],
  transcript: {
    from: 1,
    to: 2,
    messages: [
      { role: 'user', text: '上周的结论呢' },
      { role: 'assistant', text: '在周报里。' },
    ],
    counts: { user: 1, bot: 1, 'from-bot': 0, routine: 0, 'task-result': 0, 'skill-answer': 0, tool: 0 },
  },
  tools: {
    definitions: [
      { name: 'remember', description: '记住一条长期有用的信息。' },
      { name: 'start_task', description: '开一个后台任务。' },
    ],
    chars: 3000,
  },
  keepRecent: 40,
  compactAbove: 80,
  tokensPerChar: 0.5,
  measured: null,
}

const turn: Trace = {
  id: MAIN_BOT.id,
  title: '聊天',
  startedAt: 1000,
  endedAt: null,
  maxSteps: 12,
  inputs: ['用户：上周的结论呢'],
  compaction: { pending: 2, threshold: 80, folded: 0 },
  steps: [
    {
      startedAt: 1000,
      endedAt: 2800,
      calls: [
        { id: 'c1', name: 'search_history', input: '{"query":"结论"}', output: '[]', outputChars: 2, isError: false },
      ],
      text: '',
      usage: { input: 2100, cached: 1800, output: 30 },
    },
    { startedAt: 2900, endedAt: null, calls: [], text: '', usage: null },
  ],
  finishReason: null,
  error: null,
  usage: null,
}

const remembered: Entry = {
  seq: 2,
  at: Date.now(),
  kind: 'tool',
  name: 'remember',
  input: { text: '周报周五交', scope: 'bot' },
  output: { saved: 'm1' },
}

function island(props: Partial<ComponentProps<typeof BotIsland>> = {}, navigation: Partial<Navigation> = {}) {
  const value = {
    openBot: vi.fn(),
    openFlow: vi.fn(),
    openSkill: vi.fn(),
    openSkillFiles: vi.fn(),
    openMiniApp: vi.fn(),
    ...navigation,
  }
  return render(
    <BotIsland
      bot={MAIN_BOT}
      bots={[MAIN_BOT]}
      entries={[remembered]}
      tasks={[]}
      flows={[]}
      isBusy={false}
      isDebug
      context={context}
      traces={[]}
      notice={undefined}
      onDismissNotice={vi.fn()}
      onDebugChange={vi.fn()}
      {...props}
    />,
    { wrapper: ({ children }) => <NavigationContext value={value}>{children}</NavigationContext> },
  )
}

it('shows how much context the chat sends, in debug mode only', () => {
  const { rerender } = island()
  expect(screen.getByRole('button', { name: /上下文\s*1\.5k/ })).toBeInTheDocument()
  rerender(
    <BotIsland
      bot={MAIN_BOT}
      bots={[MAIN_BOT]}
      entries={[]}
      tasks={[]}
      flows={[]}
      isBusy={false}
      isDebug={false}
      context={context}
      traces={[]}
      notice={undefined}
      onDismissNotice={vi.fn()}
      onDebugChange={vi.fn()}
    />,
  )
  expect(screen.queryByText('上下文')).not.toBeInTheDocument()
})

it('opens on the context, and down to the text of each section of the system prompt', async () => {
  const user = userEvent.setup()
  island()
  await user.click(screen.getByRole('button', { name: /CEO/ }))
  expect(screen.getByRole('tab', { name: '上下文' })).toHaveAttribute('aria-selected', 'true')
  await user.click(screen.getByRole('button', { name: /^系统提示词/ }))
  await user.click(screen.getByRole('button', { name: /你的记忆/ }))
  expect(screen.getByText('- [m1] 周报周五交')).toBeInTheDocument()
})

it('shows the transcript as the model reads it when asked', async () => {
  const user = userEvent.setup()
  island()
  await user.click(screen.getByRole('button', { name: /CEO/ }))
  await user.click(screen.getByRole('button', { name: /^对话记录/ }))
  expect(screen.queryByText('在周报里。')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '展开原文（2 条）' }))
  expect(screen.getByText('上周的结论呢')).toBeInTheDocument()
  expect(screen.getByText('在周报里。')).toBeInTheDocument()
})

it('explains what a tool does when its name is clicked', async () => {
  const user = userEvent.setup()
  island()
  await user.click(screen.getByRole('button', { name: /CEO/ }))
  await user.click(screen.getByRole('button', { name: /^工具定义/ }))
  await user.click(screen.getByRole('button', { name: 'remember' }))
  expect(screen.getByText('记住一条长期有用的信息。')).toBeInTheDocument()
})

it('counts the steps of a running turn and opens on them', async () => {
  const user = userEvent.setup()
  island({ isBusy: true, traces: [turn] })
  await user.click(screen.getByRole('button', { name: /步 2\/12/ }))
  expect(screen.getByRole('tab', { name: '本轮' })).toHaveAttribute('aria-selected', 'true')
  await user.click(screen.getByRole('button', { name: /步 1 · 调用 search_history/ }))
  expect(screen.getByText('{"query":"结论"}', { selector: 'pre' })).toBeInTheDocument()
  expect(screen.getByText('进行中')).toBeInTheDocument()
})

it('lists what the chat changed, with the record it came from', async () => {
  const user = userEvent.setup()
  island()
  await user.click(screen.getByRole('button', { name: /CEO/ }))
  await user.click(screen.getByRole('tab', { name: '变更' }))
  expect(screen.getByText('[m1] 周报周五交')).toBeInTheDocument()
  expect(screen.getByText('remember · chief#2')).toBeInTheDocument()
})

it('jumps from a turn cut off by its step limit to that turn', async () => {
  const user = userEvent.setup()
  const onDismissNotice = vi.fn()
  island({
    traces: [{ ...turn, endedAt: 9000, finishReason: 'tool-calls' }],
    notice: { kind: 'out-of-steps', id: 7, maxSteps: 12 },
    onDismissNotice,
  })
  await user.click(screen.getByRole('button', { name: '看本轮' }))
  expect(onDismissNotice).toHaveBeenCalledWith(7)
  expect(screen.getByRole('tab', { name: '本轮' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText(/步数用完/)).toBeInTheDocument()
})

it('keeps the context in sight while background tasks run', () => {
  const task = {
    id: 't1',
    title: '整理竞品',
    status: 'running' as const,
    statusText: '',
    createdAt: 0,
    endedAt: null,
    requestedBy: null,
    isRoutine: false,
  }
  island({ tasks: [task] })
  expect(screen.getByRole('button', { name: /后台：整理竞品\s*上下文\s*1\.5k/ })).toBeInTheDocument()
})

it('opens a learned flow in the chat of the bot that learned it, whichever chat is open', async () => {
  const openBot = vi.fn()
  const openFlow = vi.fn()
  const notice = {
    kind: 'learned' as const,
    id: 1,
    botId: 'secretary',
    flowId: 'f1',
    name: '周报汇总',
    isNew: true,
    points: 5,
  }
  island({ isDebug: false, notice }, { openBot, openFlow })
  await userEvent.click(screen.getByRole('button', { name: /学会了新流程\s*周报汇总\s*\+5 经验/ }))
  expect(openBot).toHaveBeenCalledWith('secretary')
  expect(openFlow).toHaveBeenCalledWith('f1')
})
