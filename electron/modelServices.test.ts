// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import { setLanguage } from '../shared/language'
import { createModelServices } from './modelServices'

const listModels = vi.hoisted(() =>
  vi.fn(async (_endpoint: { service: string; apiKey: string; baseURL: string }) => ['deepseek-flash']),
)
vi.mock('../harness/modelList', () => ({ listModels }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`sealed:${text}`),
    decryptString: (data: Buffer) => data.toString().replace(/^sealed:/, ''),
  },
}))

const DEEPSEEK = { id: null, service: 'deepseek', name: '', baseURL: 'https://api.deepseek.com', apiKey: 'sk-deep1234' }
const OPENAI = { id: null, service: 'openai', name: '', baseURL: 'https://api.openai.com/v1', apiKey: 'sk-open5678' }

let dir = ''
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nengyongbot-models-'))
  listModels.mockReset()
  listModels.mockResolvedValue(['deepseek-flash', 'deepseek-pro'])
})

it('starts with no accounts and no model to chat with', () => {
  const services = createModelServices(dir)
  expect(services.view()).toEqual({ accounts: [], chat: null, searchAccountId: null })
  expect(services.model()).toBeNull()
})

it('starts chat on the default model and turns web search on when the first account is DeepSeek', async () => {
  const services = createModelServices(dir)
  const view = await services.saveAccount(DEEPSEEK, null)
  expect(view.chat).toEqual({ accountId: 'deepseek', model: 'deepseek-flash' })
  expect(view.searchAccountId).toBe('deepseek')
  expect(services.searchKey()).toBe('sk-deep1234')
})

it('keeps chat where it is when another account is added for nothing in particular', async () => {
  const services = createModelServices(dir)
  await services.saveAccount(DEEPSEEK, null)
  listModels.mockResolvedValue(['gpt-5', 'gpt-5-mini'])
  const view = await services.saveAccount(OPENAI, null)
  expect(view.chat).toEqual({ accountId: 'deepseek', model: 'deepseek-flash' })
})

it('leaves chat for the user to pick when the service names no model to start on', async () => {
  const services = createModelServices(dir)
  listModels.mockResolvedValue(['babbage-002', 'gpt-5'])
  const view = await services.saveAccount(OPENAI, 'chat')
  expect(view.chat).toBeNull()
})

it('moves chat to the default model of DeepSeek when it is connected for chat', async () => {
  const services = createModelServices(dir)
  listModels.mockResolvedValue(['gpt-5'])
  await services.saveAccount(OPENAI, null)
  services.setChatModel({ accountId: 'openai', model: 'gpt-5' })
  listModels.mockResolvedValue(['deepseek-flash'])
  const view = await services.saveAccount(DEEPSEEK, 'chat')
  expect(view.chat).toEqual({ accountId: 'deepseek', model: 'deepseek-flash' })
})

it('keeps the saved key when a change leaves the key empty and the address as it was', async () => {
  const services = createModelServices(dir)
  await services.saveAccount(DEEPSEEK, null)
  await services.saveAccount({ ...DEEPSEEK, id: 'deepseek', apiKey: '' }, null)
  expect(listModels).toHaveBeenLastCalledWith({
    service: 'deepseek',
    apiKey: 'sk-deep1234',
    baseURL: 'https://api.deepseek.com',
  })
})

it('never sends a saved key to a new address: it asks for the key again', async () => {
  const services = createModelServices(dir)
  await services.saveAccount(DEEPSEEK, null)
  listModels.mockClear()
  const moved = { ...DEEPSEEK, id: 'deepseek', apiKey: '', baseURL: 'https://elsewhere.example.com' }
  await expect(services.saveAccount(moved, null)).rejects.toThrow('请填写 API Key')
  expect(listModels).not.toHaveBeenCalled()
})

it('refuses a custom account whose id belongs to another service', async () => {
  const services = createModelServices(dir)
  await services.saveAccount(DEEPSEEK, null)
  const posing = { id: 'deepseek', service: 'custom', name: '中转', baseURL: 'https://relay.example.com', apiKey: '' }
  await expect(services.saveAccount(posing, null)).rejects.toThrow('账号和服务商对不上')
})

it('refuses an endpoint that lists no model to chat with', async () => {
  const services = createModelServices(dir)
  listModels.mockResolvedValue([])
  await expect(services.saveAccount(DEEPSEEK, null)).rejects.toThrow('没有列出可以对话的模型')
})

it('saves nothing when the connection check fails', async () => {
  const services = createModelServices(dir)
  listModels.mockRejectedValue(new Error('API Key 无效'))
  await expect(services.saveAccount(DEEPSEEK, null)).rejects.toThrow('API Key 无效')
  expect(services.view().accounts).toEqual([])
  expect(fs.existsSync(path.join(dir, 'model.bin'))).toBe(false)
})

it('asks for a key before checking a service that needs one', async () => {
  const services = createModelServices(dir)
  await expect(services.saveAccount({ ...OPENAI, apiKey: '' }, null)).rejects.toThrow('请填写 API Key')
  expect(listModels).not.toHaveBeenCalled()
})

it('turns off what an account was used for when it is disconnected', async () => {
  const services = createModelServices(dir)
  await services.saveAccount(DEEPSEEK, null)
  const view = services.removeAccount('deepseek')
  expect(view).toEqual({ accounts: [], chat: null, searchAccountId: null })
  expect(services.model()).toBeNull()
})

it('builds the model a bot is set to on its account, and nothing once the account is gone', async () => {
  const services = createModelServices(dir)
  await services.saveAccount(DEEPSEEK, null)
  expect(services.accounts()).toEqual([{ id: 'deepseek', name: 'DeepSeek' }])
  expect(services.modelOf({ accountId: 'deepseek', model: 'deepseek-pro' })).toMatchObject({ modelId: 'deepseek-pro' })
  services.removeAccount('deepseek')
  expect(services.modelOf({ accountId: 'deepseek', model: 'deepseek-pro' })).toBeNull()
})

it('reads accounts saved while there was an assistant model, leaving it out', () => {
  const account = {
    id: 'deepseek',
    service: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    apiKey: 'k',
  }
  const chat = { accountId: 'deepseek', model: 'deepseek-flash' }
  const saved = { accounts: [account], chat, assistant: chat, searchAccountId: null }
  fs.writeFileSync(path.join(dir, 'model.bin'), `sealed:${JSON.stringify(saved)}`)
  expect(createModelServices(dir).view()).toMatchObject({ chat, searchAccountId: null })
  expect(createModelServices(dir).view()).not.toHaveProperty('assistant')
})

it('shows the renderer only the last four characters of a key', async () => {
  const services = createModelServices(dir)
  const view = await services.saveAccount(DEEPSEEK, null)
  expect(view.accounts).toEqual([
    { id: 'deepseek', service: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com', keyHint: '••••1234' },
  ])
  expect(JSON.stringify(view)).not.toContain('sk-deep1234')
})

it('keeps the accounts and choices across restarts', async () => {
  await createModelServices(dir).saveAccount(DEEPSEEK, null)
  expect(createModelServices(dir).view().chat).toEqual({ accountId: 'deepseek', model: 'deepseek-flash' })
})

it('reads the single connection older versions saved as a DeepSeek account', () => {
  const legacy = { apiKey: 'sk-old0000', baseURL: 'https://api.deepseek.com', model: 'deepseek-pro' }
  fs.writeFileSync(path.join(dir, 'model.bin'), `sealed:${JSON.stringify(legacy)}`)
  const view = createModelServices(dir).view()
  expect(view.accounts.map((account) => account.service)).toEqual(['deepseek'])
  expect(view.chat).toEqual({ accountId: 'deepseek', model: 'deepseek-pro' })
  expect(view.searchAccountId).toBe('deepseek')
})

it('reads an older connection to another service as a custom account without web search', () => {
  const legacy = { apiKey: 'sk-old0000', baseURL: 'https://relay.example.com/v1', model: 'qwen-max' }
  fs.writeFileSync(path.join(dir, 'model.bin'), `sealed:${JSON.stringify(legacy)}`)
  const view = createModelServices(dir).view()
  expect(view.accounts.map(({ service, name }) => ({ service, name }))).toEqual([
    { service: 'custom', name: 'relay.example.com' },
  ])
  expect(view.searchAccountId).toBeNull()
})

it('lets web search use only a DeepSeek account', async () => {
  const services = createModelServices(dir)
  listModels.mockResolvedValue(['gpt-5'])
  await services.saveAccount(OPENAI, null)
  expect(() => services.setSearchAccount('openai')).toThrow('网络搜索只能用 DeepSeek 官方地址的账号')
})

it('keeps web search off for a DeepSeek account on another address, whose key DeepSeek would not take', async () => {
  const services = createModelServices(dir)
  const view = await services.saveAccount({ ...DEEPSEEK, baseURL: 'https://relay.example.com' }, null)
  expect(view.searchAccountId).toBeNull()
  expect(() => services.setSearchAccount('deepseek')).toThrow('网络搜索只能用 DeepSeek 官方地址的账号')
})

it('reads the models of a local service afresh each time, as new ones may have been downloaded', async () => {
  const services = createModelServices(dir)
  const ollama = { id: null, service: 'ollama', name: '', baseURL: 'http://localhost:11434/v1', apiKey: '' }
  await services.saveAccount(ollama, null)
  listModels.mockResolvedValue(['qwen3:8b', 'gemma3:4b'])
  await expect(services.listModels('ollama')).resolves.toEqual(['qwen3:8b', 'gemma3:4b'])
})

it('lists the models of an account once and then answers from memory', async () => {
  const services = createModelServices(dir)
  await services.saveAccount(DEEPSEEK, null)
  listModels.mockClear()
  await expect(services.listModels('deepseek')).resolves.toEqual(['deepseek-flash', 'deepseek-pro'])
  expect(listModels).not.toHaveBeenCalled()
})

it("shows a provider's account under the provider's name in the app's language, whatever it was saved under", async () => {
  const services = createModelServices(dir)
  await services.saveAccount(
    { ...DEEPSEEK, service: 'qwen', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    null,
  )
  setLanguage('en')
  try {
    expect(services.view().accounts.map((account) => account.name)).toEqual(['Qwen'])
    expect(services.accounts()).toEqual([{ id: 'qwen', name: 'Qwen' }])
  } finally {
    setLanguage('zh')
  }
})

it('keeps a saved file it cannot read aside instead of writing over it', async () => {
  fs.writeFileSync(path.join(dir, 'model.bin'), 'sealed:{not json')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await createModelServices(dir).saveAccount(DEEPSEEK, null)
  const kept = fs.readdirSync(dir).filter((name) => name.startsWith('model.bin.unreadable-'))
  expect(kept.map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))).toEqual(['sealed:{not json'])
})

it('leaves a file it could not read in place until something is saved, so a keychain that says no once is not final', () => {
  fs.writeFileSync(path.join(dir, 'model.bin'), 'sealed:{not json')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  createModelServices(dir)
  expect(fs.readdirSync(dir)).toEqual(['model.bin'])
})
