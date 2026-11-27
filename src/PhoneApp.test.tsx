import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import type { HarnessEvent } from '../shared/bridge'
import { createDemoBridge } from './demo/demoBridge'
import { DEMO_SIDEBAR } from './demo/demoData'
import { PhoneApp } from './PhoneApp'
import type { Connection } from './remote/remoteBridge'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

/** The demo's bridge with events the test sends, and a connection the test switches. */
function renderPhone() {
  let listener: (event: HarnessEvent) => void = () => {}
  let connection: Connection = 'online'
  const watchers = new Set<() => void>()
  const bridge = {
    ...createDemoBridge(),
    onEvent: (onEvent: (event: HarnessEvent) => void) => {
      listener = onEvent
      return () => {}
    },
  }
  render(
    <PhoneApp
      bridge={bridge}
      initialSidebar={DEMO_SIDEBAR}
      connection={{
        get: () => connection,
        subscribe(onChange) {
          watchers.add(onChange)
          return () => watchers.delete(onChange)
        },
      }}
    />,
  )
  return {
    emit: (event: HarnessEvent) => act(() => listener(event)),
    setConnection: (next: Connection) =>
      act(() => {
        connection = next
        for (const watcher of watchers) watcher()
      }),
  }
}

const reply = (botId: string, text: string): HarnessEvent => ({
  kind: 'entry',
  botId,
  entry: { kind: 'bot', seq: 10_000, at: Date.now(), text },
})

it('lists the bots in the sections the computer arranged', () => {
  renderPhone()
  expect(screen.getByRole('heading', { name: 'Nengyong Bot' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /GitHub 数据日报/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '我的 App' })).toHaveAttribute('aria-expanded', 'true')
})

it('opens a chat on a tap and goes back to the list', async () => {
  renderPhone()
  await userEvent.click(screen.getByRole('button', { name: /GitHub 数据日报/ }))
  expect(screen.getByRole('textbox')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '返回' }))
  expect(screen.getByRole('heading', { name: 'Nengyong Bot' })).toBeInTheDocument()
})

it('keeps what was typed to a bot after going back to the list and opening it again', async () => {
  renderPhone()
  await userEvent.click(screen.getByRole('button', { name: /GitHub 数据日报/ }))
  await userEvent.type(screen.getByRole('textbox'), '明天再发')
  await userEvent.click(screen.getByRole('button', { name: '返回' }))
  await userEvent.click(screen.getByRole('button', { name: /GitHub 数据日报/ }))
  expect(screen.getByRole('textbox')).toHaveTextContent('明天再发')
})

it('puts the edit of a docked mini app into the message box of its bot when asked from the list', async () => {
  renderPhone()
  await userEvent.click(screen.getByRole('button', { name: /内容运营/ }))
  const [card] = await screen.findAllByRole('button', { name: '打开小程序 收入汇总' })
  if (!card) throw new Error('no card for 收入汇总')
  await userEvent.click(card)
  await userEvent.click(
    within(screen.getByRole('region', { name: '收入汇总' })).getByRole('button', { name: '收起到浮窗' }),
  )
  await userEvent.click(screen.getByRole('button', { name: '返回' }))
  await userEvent.click(
    within(screen.getByRole('toolbar', { name: '浮窗' })).getByRole('button', { name: /收入汇总 v2，收起了/ }),
  )
  await userEvent.click(within(screen.getByRole('region', { name: '收入汇总' })).getByRole('button', { name: '更多' }))
  await userEvent.click(screen.getByRole('button', { name: '在聊天里改' }))
  expect(screen.getByRole('textbox')).toHaveTextContent('把「收入汇总」改一下：')
})

it('shows the panel as a sheet, with the name and the look not to be changed', async () => {
  renderPhone()
  await userEvent.click(screen.getByRole('button', { name: /GitHub 数据日报/ }))
  await userEvent.click(screen.getByRole('button', { name: '展开面板' }))
  const sheet = screen.getByRole('dialog', { name: 'GitHub 数据日报 的面板' })
  expect(within(sheet).queryByRole('textbox', { name: 'Bot 名称' })).not.toBeInTheDocument()
  expect(within(sheet).queryByRole('button', { name: '换头像' })).not.toBeInTheDocument()
})

it('counts a reply that came while the list was shown, and drops a card about it', () => {
  const phone = renderPhone()
  phone.emit(reply('repo', '新的日报好了'))
  expect(screen.getByLabelText('未读').closest('button')).toHaveTextContent('GitHub 数据日报')
  expect(screen.getByRole('button', { name: 'GitHub 数据日报 发来新消息：新的日报好了' })).toBeInTheDocument()
})

it('opens the bot from the card about its reply', async () => {
  const phone = renderPhone()
  phone.emit(reply('repo', '新的日报好了'))
  await userEvent.click(screen.getByRole('button', { name: 'GitHub 数据日报 发来新消息：新的日报好了' }))
  expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument()
})

it('says when the computer cannot be reached', () => {
  const phone = renderPhone()
  phone.setConnection('offline')
  expect(screen.getByRole('status')).toHaveTextContent('连不上电脑')
})

it('stops at a page that says so once the computer removed this device', () => {
  const phone = renderPhone()
  phone.setConnection('removed')
  expect(screen.getByRole('heading', { name: '这台设备已被移除' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Nengyong Bot' })).not.toBeInTheDocument()
})
