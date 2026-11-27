import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { dutyOf } from '../../shared/duty'
import { renderDemoApp } from '../demo/renderDemoApp'
import { DutyTab } from './DutyTab'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const panel = () => screen.getByRole('complementary', { name: 'Bot 详情' })

async function openPanelOf(name: RegExp) {
  const demo = renderDemoApp()
  await demo.user.click(screen.getByRole('button', { name }))
  await demo.user.click(screen.getByRole('button', { name: '展开面板' }))
  await demo.user.click(within(panel()).getByRole('button', { name: /^Bot 核心/ }))
  return demo
}

it('opens Bot 核心 on the duty: each objective with its key results and how far each has come', async () => {
  await openPanelOf(/发版助理/)
  expect(within(panel()).getByRole('button', { name: /^职责/ })).toHaveAttribute('aria-pressed', 'true')
  const notes = within(panel()).getByRole('list', { name: '发版说明不拖后腿' })
  expect(
    within(notes)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual([
    '发版前一天交发版说明上个版本提前 1 天每个版本 · 我自己数 · 达成',
    '你改动不超过两成上次改了 30%每个版本 · 对比你改前改后 · 落后',
  ])
})

it('turns the weekly review off with its switch', async () => {
  const { user } = await openPanelOf(/发版助理/)
  const review = within(panel()).getByRole('switch', { name: '每周复盘' })
  expect(review).toHaveAttribute('aria-checked', 'true')
  await user.click(review)
  expect(within(panel()).getByRole('switch', { name: '每周复盘' })).toHaveAttribute('aria-checked', 'false')
  expect(within(panel()).getByText('关着。有要改的，它在聊天里随时提')).toBeInTheDocument()
})

it('offers to plan the duty of a bot without one, from the panel and from the plus in the message box', async () => {
  const { user } = await openPanelOf(/GitHub 数据日报/)
  const messageBox = () => screen.getByRole('textbox', { name: /说点什么/ }) // filling it mounts a new one
  expect(within(panel()).getByText('还没定目标和验收指标')).toBeInTheDocument()
  await user.click(within(panel()).getByRole('button', { name: /规划职责/ }))
  expect(messageBox().textContent).toBe('我们来规划一下你的职责')

  await user.click(screen.getByRole('button', { name: '添加' }))
  const menu = screen.getByRole('menu')
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent),
  ).toEqual(['添加附件', '规划职责', '沉淀流程', '上传技能'])
  await user.click(within(menu).getByRole('menuitem', { name: '沉淀流程' }))
  expect(messageBox().textContent).toBe('把刚才这套做法存成流程：')
})

it('shows the duty the bot proposes on a card in the chat, and lists it in the panel once agreed', async () => {
  const { user } = await openPanelOf(/GitHub 数据日报/)
  await user.click(within(panel()).getByRole('button', { name: /规划职责/ }))
  await user.click(screen.getByRole('button', { name: '发送' }))
  const card = await screen.findByText('GitHub 数据日报 的职责 · 第 1 版', {}, { timeout: 3000 })
  expect(card).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '定下来' }))
  expect(await screen.findByText('职责定下来了 · 第 1 版')).toBeInTheDocument()
  expect(within(panel()).getByRole('list', { name: '每天早上就知道仓库发生了什么' })).toBeInTheDocument()
  expect(within(panel()).getByRole('switch', { name: '每周复盘' })).toHaveAttribute('aria-checked', 'true')
})

it('shows each line of an old one-paragraph instruction as its own paragraph', () => {
  render(<DutyTab duty={dutyOf('第一段\n\n第二段')} routines={[]} onFill={() => {}} />)
  expect(screen.getByText('第一段')).toBeInTheDocument()
  expect(screen.getByText('第二段')).toBeInTheDocument()
})
