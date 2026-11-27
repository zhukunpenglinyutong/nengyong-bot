import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { renderDemoApp } from '../demo/renderDemoApp'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const openReleaseBot = async () => {
  const demo = renderDemoApp()
  await demo.user.click(screen.getByRole('button', { name: /发版助理/ }))
  return demo
}
const panel = () => screen.getByRole('complementary', { name: 'Bot 详情' })
const messageBox = () => screen.getByRole('textbox', { name: '跟 发版助理 说点什么' })

it('lists the flows of a bot, opens one with its steps, notes and runs, and goes back', async () => {
  const { user } = await openReleaseBot()
  await user.click(screen.getByRole('button', { name: '展开面板' }))
  await user.click(within(panel()).getByRole('button', { name: /^Bot 核心/ }))
  await user.click(within(panel()).getByRole('button', { name: /^流程/ }))
  const list = within(panel()).getByRole('list', { name: '流程' })
  expect(within(list).getByRole('button', { name: /发版说明整理.*deepseek-pro/ })).toBeInTheDocument()
  expect(within(list).getByRole('button', { name: /PR 合并前检查.*正在用/ })).toBeInTheDocument()

  await user.click(within(list).getByRole('button', { name: /PR 合并前检查/ }))
  expect(within(panel()).getByRole('heading', { name: 'PR 合并前检查' })).toBeInTheDocument()
  expect(within(within(panel()).getByRole('list', { name: '步骤' })).getAllByRole('listitem')).toHaveLength(4)
  expect(within(panel()).getByText('只给结论和理由，不替你点合并')).toBeInTheDocument()
  const runs = within(panel()).getByRole('list', { name: '最近用过' })
  expect(within(runs).getByText('PR #491 能不能合')).toBeInTheDocument()
  expect(within(runs).getByText(/第 2\/4 步：读 diff/)).toBeInTheDocument()

  await user.click(within(panel()).getByRole('button', { name: '返回流程列表' }))
  expect(within(panel()).getByRole('list', { name: '流程' })).toBeInTheDocument()
})

it('fills the message box to change a flow in the chat, or to teach a new one', async () => {
  const { user } = await openReleaseBot()
  await user.click(screen.getByRole('button', { name: '展开面板' }))
  await user.click(within(panel()).getByRole('button', { name: /^Bot 核心/ }))
  await user.click(within(panel()).getByRole('button', { name: /^流程/ }))
  await user.click(within(panel()).getByRole('button', { name: /发版说明整理/ }))
  await user.click(within(panel()).getByRole('button', { name: '在聊天里改' }))
  expect(messageBox().textContent).toBe('把「发版说明整理」改一下：')

  await user.click(within(panel()).getByRole('button', { name: '返回流程列表' }))
  await user.click(within(panel()).getByRole('button', { name: /教它一个新流程/ }))
  expect(messageBox().textContent).toBe('我带你做一遍，做完存成流程：')
})

it('opens a flow mentioned in a reply in the panel', async () => {
  const { user } = await openReleaseBot()
  await user.click(within(screen.getByTestId('messages')).getByRole('button', { name: '发版说明整理' }))
  expect(within(panel()).getByRole('heading', { name: '发版说明整理' })).toBeInTheDocument()
})

it('opens the flow a running task or a routine follows from the feed', async () => {
  const { user } = await openReleaseBot()
  await user.click(screen.getByRole('button', { name: '展开面板' }))
  const running = within(panel()).getByRole('list', { name: '进行中' })
  await user.click(within(running).getByRole('button', { name: '按 PR 合并前检查' }))
  expect(within(panel()).getByRole('heading', { name: 'PR 合并前检查' })).toBeInTheDocument()

  await user.click(within(panel()).getByRole('button', { name: '返回流程列表' }))
  await user.click(within(panel()).getByRole('button', { name: '近况' }))
  await user.click(within(panel()).getByRole('button', { name: '按 发版说明整理' }))
  expect(within(panel()).getByRole('heading', { name: '发版说明整理' })).toBeInTheDocument()
})

it('says on the island when the bot learns a flow, and opens it in the panel from there', async () => {
  const { user } = await openReleaseBot()
  await user.type(messageBox(), '存成流程{Enter}')
  await user.click(await screen.findByRole('button', { name: /学会了新流程\s*周报汇总/ }))
  expect(within(panel()).getByRole('heading', { name: '周报汇总' })).toBeInTheDocument()
})

it('points from the opened island to the flows the bot knows, outside debug mode', async () => {
  localStorage.setItem('nengyongbot:preferences', JSON.stringify({ isDebug: false }))
  const { user } = await openReleaseBot()
  await user.click(await screen.findByRole('button', { name: /发版助理\s*后台/ }))
  await user.click(screen.getByRole('button', { name: /会 2 个流程/ }))
  expect(within(panel()).getByRole('list', { name: '流程' })).toBeInTheDocument()
})
