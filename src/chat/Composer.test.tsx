import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { DEMO_SIDEBAR } from '../demo/demoData'
import { Composer } from './Composer'

afterEach(cleanup)

// jsdom has no scrollIntoView; it lays nothing out, so there is nothing to scroll
Element.prototype.scrollIntoView = () => {}

function renderComposer(isReplying = false) {
  const onSend = vi.fn(() => true)
  const onAddFiles = vi.fn()
  const onStop = vi.fn()
  render(
    <Composer
      placeholder="说点什么"
      inputRef={createRef()}
      sidebar={DEMO_SIDEBAR}
      botId="chief"
      files={[]}
      sendKey="enter"
      isReplying={isReplying}
      onStop={onStop}
      onAddFiles={onAddFiles}
      onRemoveFile={() => {}}
      onCancelQuote={() => {}}
      onDraftChange={() => {}}
      onSend={onSend}
    />,
  )
  return {
    user: userEvent.setup(),
    input: screen.getByRole('textbox', { name: '说点什么' }),
    onSend,
    onAddFiles,
    onStop,
  }
}

it('offers to stop the reply while the bot replies and the box is empty', async () => {
  const { user, onStop } = renderComposer(true)
  await user.click(screen.getByRole('button', { name: '停止回复' }))
  expect(onStop).toHaveBeenCalled()
})

it('does not stop the reply with the second click of a double-click on send', async () => {
  const { user, input, onSend, onStop } = renderComposer(true)
  await user.type(input, '再加一句')
  await user.dblClick(screen.getByRole('button', { name: '发送' }))
  expect(onSend).toHaveBeenCalledTimes(1)
  expect(onStop).not.toHaveBeenCalled()
})

it('sends what is written while the bot replies, instead of offering to stop', async () => {
  const { user, input, onSend } = renderComposer(true)
  await user.type(input, '再加一句')
  expect(screen.queryByRole('button', { name: '停止回复' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '发送' }))
  expect(onSend).toHaveBeenCalledWith('再加一句')
})

it('lists the other bots with their sidebar group after an @, and no group for 其他', async () => {
  const { user, input } = renderComposer()
  await user.type(input, '@')
  const menu = screen.getByRole('listbox', { name: '提到 Bot' })
  expect(within(menu).queryByRole('option', { name: /小满/ })).not.toBeInTheDocument()
  expect(within(menu).getByRole('option', { name: /^GitHub 数据日报/ })).toHaveTextContent('我的 App')
  expect(within(menu).getByRole('option', { name: '点子收集箱' })).toBeInTheDocument()
})

it('narrows the list as the user types and puts the highlighted bot in as a chip on Enter, without sending', async () => {
  const { user, input, onSend } = renderComposer()
  await user.type(input, '问问 @g{arrowdown}{enter}')
  expect(within(input).getByText('Bug 反馈整理')).toBeInTheDocument()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(onSend).not.toHaveBeenCalled()
})

it('sends a picked bot as @name followed by what was typed after it', async () => {
  const { user, input, onSend } = renderComposer()
  await user.type(input, '@')
  await user.click(screen.getByRole('option', { name: /健身教练/ }))
  await user.keyboard('你好{enter}')
  expect(onSend).toHaveBeenCalledWith('@健身教练 你好')
  expect(input).toBeEmptyDOMElement()
})

it('closes the list on Escape, after which Enter sends again', async () => {
  const { user, input, onSend } = renderComposer()
  await user.type(input, '@gi{escape}')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  await user.keyboard('{enter}')
  expect(onSend).toHaveBeenCalledWith('@gi')
})

it('pastes rich text as plain text', async () => {
  const { input } = renderComposer()
  const insertText = vi.fn(() => true)
  document.execCommand = insertText
  const pasted = new Event('paste', { bubbles: true, cancelable: true })
  Object.assign(pasted, { clipboardData: { types: ['text/html', 'text/plain'], getData: () => '纯文本', files: [] } })
  input.dispatchEvent(pasted)
  expect(pasted.defaultPrevented).toBe(true)
  expect(insertText).toHaveBeenCalledWith('insertText', false, '纯文本')
})

it('attaches a pasted screenshot without also putting the picture in the input', () => {
  const { input, onAddFiles } = renderComposer()
  const screenshot = new File([''], 'image.png', { type: 'image/png' })
  const pasted = new Event('paste', { bubbles: true, cancelable: true })
  Object.assign(pasted, { clipboardData: { types: ['Files'], getData: () => '', files: [screenshot] } })
  input.dispatchEvent(pasted)
  expect(pasted.defaultPrevented).toBe(true)
  expect(onAddFiles).toHaveBeenCalledWith([screenshot])
})
