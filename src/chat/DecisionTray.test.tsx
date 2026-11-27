import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { renderDemoApp } from '../demo/renderDemoApp'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const QUESTION = /第三天下午要不要订岚山小火车/

it('shows in the sidebar that a bot waits on the user, until the user answers', async () => {
  const { user } = renderDemoApp()
  const travel = await screen.findByRole('button', { name: /旅行计划/ })
  expect(await within(travel).findByText('等你决定 · 1 件')).toBeInTheDocument()
  await user.click(travel)
  await user.click(await screen.findByRole('button', { name: '先不订' }))
  expect(within(travel).queryByText('等你决定 · 1 件')).not.toBeInTheDocument()
})

it('answers a question with one click above the message box, sent as a reply quoting it', async () => {
  const { user } = renderDemoApp()
  await user.click(await screen.findByRole('button', { name: /旅行计划/ }))
  const messages = screen.getByTestId('messages')
  expect(within(messages).getByRole('button', { name: QUESTION })).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: '订下午 2 点那班' }))
  expect(await within(messages).findByText('你选了「订下午 2 点那班」')).toBeInTheDocument()
  expect(within(messages).getByText(QUESTION)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '先不订' })).not.toBeInTheDocument()
})

it('opens the list from a line in the chat, and folds it away with Escape', async () => {
  const { user } = renderDemoApp()
  await user.click(await screen.findByRole('button', { name: /旅行计划/ }))
  await user.click(within(screen.getByTestId('messages')).getByRole('button', { name: QUESTION }))
  expect(screen.getByRole('button', { name: '收起' })).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('button', { name: '收起' })).not.toBeInTheDocument()
})
