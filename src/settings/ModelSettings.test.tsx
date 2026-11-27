import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnimatePresence } from 'motion/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ModelServicesView } from '../../shared/modelServices'
import { ModelSettings } from './ModelSettings'

afterEach(cleanup)

const DEEPSEEK = {
  id: 'deepseek',
  service: 'deepseek' as const,
  name: 'DeepSeek',
  baseURL: 'https://api.deepseek.com',
  keyHint: '••••1234',
}
const OPENAI = {
  id: 'openai',
  service: 'openai' as const,
  name: 'OpenAI',
  baseURL: 'https://api.openai.com/v1',
  keyHint: '••••5678',
}
const CONNECTED: ModelServicesView = {
  accounts: [DEEPSEEK],
  chat: { accountId: 'deepseek', model: 'deepseek-flash' },
  searchAccountId: 'deepseek',
}

function renderPage(services = CONNECTED) {
  const bridge = {
    listModels: vi.fn(async (accountId: string) =>
      accountId === 'openai' ? ['gpt-5'] : ['deepseek-flash', 'deepseek-pro'],
    ),
    setChatModel: vi.fn(async () => services),
    setSearchAccount: vi.fn(async () => services),
    saveAccount: vi.fn(async () => services),
    removeAccount: vi.fn(async () => services),
  }
  const onServicesChange = vi.fn()
  render(
    <AnimatePresence>
      <ModelSettings bridge={bridge} services={services} onServicesChange={onServicesChange} />
    </AnimatePresence>,
  )
  return { bridge, onServicesChange, user: userEvent.setup() }
}

it('switches the main model to another model of the account from its menu and says it is saved', async () => {
  const { bridge, user } = renderPage()
  await user.click(screen.getByRole('button', { name: /deepseek-flash/ }))
  await user.click(await screen.findByRole('menuitemcheckbox', { name: 'deepseek-pro' }))
  expect(bridge.setChatModel).toHaveBeenCalledWith({ accountId: 'deepseek', model: 'deepseek-pro' })
  expect(await screen.findByText('已保存')).toBeInTheDocument()
})

it('puts the models of each account in its own submenu once there are several accounts', async () => {
  const { user } = renderPage({ ...CONNECTED, accounts: [DEEPSEEK, OPENAI] })
  await user.click(screen.getByRole('button', { name: /deepseek-flash/ }))
  await user.hover(await screen.findByRole('menuitem', { name: /OpenAI/ }))
  expect(await screen.findByRole('menuitemcheckbox', { name: 'gpt-5' })).toBeInTheDocument()
})

it('opens the menu at once, while an account that does not answer is still loading its models', async () => {
  const { bridge, user } = renderPage({ ...CONNECTED, accounts: [DEEPSEEK, OPENAI] })
  bridge.listModels.mockImplementation((accountId: string) =>
    accountId === 'openai' ? new Promise<string[]>(() => {}) : Promise.resolve(['deepseek-flash']),
  )
  await user.click(screen.getByRole('button', { name: /deepseek-flash/ }))
  expect(screen.getByRole('menuitem', { name: '添加其他服务商…' })).toBeInTheDocument()
  await user.hover(screen.getByRole('menuitem', { name: /OpenAI/ }))
  expect(await screen.findByRole('menuitem', { name: '正在读取模型…' })).toHaveAttribute('aria-disabled', 'true')
  await user.hover(screen.getByRole('menuitem', { name: /DeepSeek/ }))
  expect(await screen.findByRole('menuitemcheckbox', { name: 'deepseek-flash' })).toBeInTheDocument()
})

it('says why an account could not list its models instead of an empty menu', async () => {
  const { bridge, user } = renderPage()
  bridge.listModels.mockRejectedValue(
    new Error("Error invoking remote method 'nengyongbot:listModels': Error: API Key 无效"),
  )
  await user.click(screen.getByRole('button', { name: /deepseek-flash/ }))
  expect(await screen.findByRole('menuitem', { name: '读不到模型：API Key 无效' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

it('says image generation is coming soon when its picker is pressed', async () => {
  const { user } = renderPage()
  const row = screen.getByText('图片生成').closest('div')?.parentElement
  if (!row) throw new Error('no 图片生成 row')
  await user.click(within(row).getByRole('button', { name: /未开启/ }))
  expect(await screen.findByRole('menuitem', { name: '即将开放，敬请期待' })).toBeInTheDocument()
})

it('says a bot switches models by being asked in its chat, as the page has no switch per bot', () => {
  renderPage()
  expect(screen.getByText('Bot 默认都用它；某个 Bot 要换，直接在聊天里跟它说')).toBeInTheDocument()
})

it('says why a pick could not be saved, even when the call fails before it is sent', async () => {
  const { bridge, user } = renderPage()
  bridge.setChatModel.mockImplementation(() => {
    throw new Error('bridge.setChatModel is not a function')
  })
  await user.click(screen.getByRole('button', { name: /deepseek-flash/ }))
  await user.click(await screen.findByRole('menuitemcheckbox', { name: 'deepseek-pro' }))
  expect(await screen.findByText('bridge.setChatModel is not a function')).toBeInTheDocument()
})

it('turns web search off from its menu', async () => {
  const { bridge, user } = renderPage()
  await user.click(screen.getByRole('button', { name: /DeepSeek 内置搜索/ }))
  await user.click(await screen.findByRole('menuitemcheckbox', { name: '关闭网络搜索' }))
  expect(bridge.setSearchAccount).toHaveBeenCalledWith(null)
})

it('connects a new account picked from the list of services, with its key', async () => {
  const { bridge, onServicesChange, user } = renderPage()
  await user.click(screen.getByRole('button', { name: '添加账号' }))
  await user.click(await screen.findByRole('button', { name: /^OpenAI/ }))
  await user.type(screen.getByLabelText('API Key'), 'sk-open5678')
  await user.click(screen.getByRole('button', { name: '连接' }))
  expect(bridge.saveAccount).toHaveBeenCalledWith(
    { id: null, service: 'openai', name: '', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-open5678' },
    null,
  )
  expect(onServicesChange).toHaveBeenCalledWith(CONNECTED)
})

it('connects a service on this machine with the key it was set up with', async () => {
  const { bridge, user } = renderPage()
  await user.click(screen.getByRole('button', { name: '添加账号' }))
  await user.click(await screen.findByRole('button', { name: /^oMLX/ }))
  await user.type(screen.getByLabelText('API Key'), 'omlx-key1')
  await user.click(screen.getByRole('button', { name: '接入' }))
  expect(bridge.saveAccount).toHaveBeenCalledWith(
    { id: null, service: 'omlx', name: '', baseURL: 'http://localhost:8000/v1', apiKey: 'omlx-key1' },
    null,
  )
})

it('asks for a model to be picked when the account connected for chat names none to start on', async () => {
  const { user } = renderPage()
  await user.click(screen.getByRole('button', { name: /deepseek-flash/ }))
  await user.click(await screen.findByRole('menuitem', { name: '添加其他服务商…' }))
  await user.click(await screen.findByRole('button', { name: /^OpenAI/ }))
  await user.type(screen.getByLabelText('API Key'), 'sk-open5678{enter}')
  expect(await screen.findByText('已连接，点右边选一个模型')).toBeInTheDocument()
})

it('keeps the dialog open with the reason when the key does not connect', async () => {
  const { bridge, user } = renderPage()
  bridge.saveAccount.mockRejectedValue(
    new Error("Error invoking remote method 'nengyongbot:saveAccount': Error: API Key 无效"),
  )
  await user.click(screen.getByRole('button', { name: '添加账号' }))
  await user.click(await screen.findByRole('button', { name: /^OpenAI/ }))
  await user.type(screen.getByLabelText('API Key'), 'sk-wrong{enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('API Key 无效')
  expect(screen.getByRole('dialog', { name: '连接 OpenAI' })).toBeInTheDocument()
})

it('says what stops working before an account in use is disconnected', async () => {
  const { bridge, user } = renderPage()
  await user.click(screen.getByRole('button', { name: /DeepSeek.*在用/ }))
  const dialog = await screen.findByRole('dialog', { name: 'DeepSeek' })
  await user.click(within(dialog).getByRole('button', { name: '断开' }))
  expect(within(dialog).getByText('断开后，主模型、网络搜索会停用')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: '断开' }))
  expect(bridge.removeAccount).toHaveBeenCalledWith('deepseek')
})

it('opens on connecting DeepSeek when nothing is connected yet', () => {
  renderPage({ accounts: [], chat: null, searchAccountId: null })
  expect(screen.getByRole('dialog', { name: '连接 DeepSeek' })).toBeInTheDocument()
  expect(screen.getByText('还没选模型，Bot 回不了话')).toBeInTheDocument()
})
