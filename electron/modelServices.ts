import fs from 'node:fs'
import path from 'node:path'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { safeStorage } from 'electron'
import { z } from 'zod'
import { listModels } from '../harness/modelList'
import type { ModelObject } from '../harness/runModel'
import {
  AccountId,
  AccountInput,
  AccountUse,
  canSearch,
  DEEPSEEK_MODEL,
  ModelChoice,
  type ModelServicesView,
  SERVICES,
  ServiceId,
} from '../shared/modelServices'
import { strings } from '../shared/strings'
import { newId } from '../shared/newId'

const FILE_NAME = 'model.bin'
const CUSTOM_PREFIX = 'custom-'

const Account = z.object({
  id: AccountId,
  service: ServiceId,
  name: z.string(),
  baseURL: z.string(),
  apiKey: z.string(),
})
type Account = z.infer<typeof Account>

const Saved = z.object({
  accounts: z.array(Account),
  chat: ModelChoice.nullable(),
  searchAccountId: AccountId.nullable(),
})
type Saved = z.infer<typeof Saved>

/** The one connection older versions saved, before there were accounts. */
const LegacyConfig = z.object({
  apiKey: z.string().min(1),
  baseURL: z.string().url().default(SERVICES.deepseek.baseURL),
  model: z.string().min(1).default(DEEPSEEK_MODEL),
})

const EMPTY: Saved = { accounts: [], chat: null, searchAccountId: null }

/**
 * The accounts saved under `dir`, encrypted with the system keychain, which of their models is the main one, and which
 * account web search uses.
 * Keys never leave the main process: the renderer gets views with the last four characters.
 */
export function createModelServices(dir: string) {
  const file = path.join(dir, FILE_NAME)
  let { saved, isUnreadable } = read(file)
  let model = modelOf(saved.accounts, saved.chat)
  const modelsByAccount = new Map<string, string[]>()

  const accountOf = (id: string | null) => saved.accounts.find((account) => account.id === id)

  function write(next: Saved): ModelServicesView {
    if (!safeStorage.isEncryptionAvailable()) throw new Error(strings().main.accounts.noKeychain)
    // keep the unreadable file (e.g. sealed by another keychain) instead of writing over every account in it
    if (isUnreadable) fs.renameSync(file, `${file}.unreadable-${Date.now()}`)
    isUnreadable = false
    fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 })
    saved = next
    model = modelOf(next.accounts, next.chat)
    return viewOf(next)
  }

  return {
    model: () => model, // the main model; null = none chosen yet
    accounts: () => saved.accounts.map((account) => ({ id: account.id, name: nameOf(account) })),
    modelOf: (choice: ModelChoice) => modelOf(saved.accounts, choice), // null: its account was removed
    searchKey: () => {
      const account = accountOf(saved.searchAccountId)
      return account && canSearch(account) ? account.apiKey : null
    },
    view: () => viewOf(saved),
    async listModels(accountId: unknown) {
      const account = accountOf(parse(AccountId, accountId))
      if (!account) throw new Error(disconnected())
      const isLocal = SERVICES[account.service].kind === 'local'
      const cached = isLocal ? undefined : modelsByAccount.get(account.id)
      if (cached) return cached
      const listed = await listModels(account)
      if (accountOf(account.id) === account) modelsByAccount.set(account.id, listed)
      return listed
    },
    async saveAccount(input: unknown, use: unknown) {
      const forUse = parse(AccountUse.nullable(), use)
      const { account, models } = await connect(saved, parse(AccountInput, input))
      modelsByAccount.set(account.id, models)
      return write(withAccount(saved, account, models, forUse))
    },
    removeAccount(accountId: unknown) {
      const id = parse(AccountId, accountId)
      modelsByAccount.delete(id)
      return write(withoutAccount(saved, id))
    },
    setChatModel(choice: unknown) {
      const chat = parse(ModelChoice, choice)
      if (!accountOf(chat.accountId)) throw new Error(disconnected())
      return write({ ...saved, chat })
    },
    setSearchAccount(accountId: unknown) {
      const id = parse(AccountId.nullable(), accountId)
      const account = accountOf(id)
      if (id !== null && !(account && canSearch(account))) throw new Error(strings().main.accounts.searchNeedsDeepSeek)
      return write({ ...saved, searchAccountId: id })
    },
  }
}

// Everything from the renderer is untrusted input; the first problem becomes the message the user sees.
function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? strings().main.accounts.invalidInput)
  return parsed.data
}

/**
 * The account the input describes, once its address and key have been shown to work, and the models it lists.
 * A saved key only ever goes back to the address it was saved for: a new address needs the key typed again.
 */
async function connect(saved: Saved, input: z.output<typeof AccountInput>) {
  const service = SERVICES[input.service]
  const id = service.kind === 'custom' ? (input.id ?? newId(CUSTOM_PREFIX)) : service.id
  if (service.kind === 'custom' && !id.startsWith(CUSTOM_PREFIX))
    throw new Error(strings().main.accounts.serviceMismatch)
  const existing = saved.accounts.find((account) => account.id === id)
  const apiKey = input.apiKey || (existing?.baseURL === input.baseURL ? existing.apiKey : '')
  if (service.kind === 'key' && !apiKey) throw new Error(strings().main.accounts.needKey)
  if (service.kind === 'custom' && !input.name) throw new Error(strings().main.accounts.needName)
  const models = await listModels({ service: service.id, apiKey, baseURL: input.baseURL })
  if (models.length === 0) throw new Error(strings().main.accounts.noChatModels)
  const name = service.kind === 'custom' ? input.name : service.name
  return { account: { id, service: service.id, name, baseURL: input.baseURL, apiKey }, models }
}

/**
 * Saved with the account added or replaced. A use with nothing set yet starts on it, and so does the use it was
 * connected for; chat only when the service names a model to start on, as a listed one may not chat at all.
 */
function withAccount(saved: Saved, account: Account, models: string[], use: AccountUse | null): Saved {
  const isKnown = saved.accounts.some((known) => known.id === account.id)
  const accounts = isKnown
    ? saved.accounts.map((known) => (known.id === account.id ? account : known))
    : [...saved.accounts, account]
  const model = SERVICES[account.service].defaultModel
  const canStartChat = model !== null && models.includes(model) && (use === 'chat' || saved.chat === null)
  const chat = canStartChat ? { accountId: account.id, model } : saved.chat
  const isFirst = saved.accounts.length === 0
  const searchAccountId = canSearch(account) && (use === 'search' || isFirst) ? account.id : saved.searchAccountId
  return { ...saved, accounts, chat, searchAccountId }
}

/** Saved without the account; whatever used it is turned off. */
function withoutAccount(saved: Saved, id: string): Saved {
  return {
    accounts: saved.accounts.filter((account) => account.id !== id),
    chat: saved.chat?.accountId === id ? null : saved.chat,
    searchAccountId: saved.searchAccountId === id ? null : saved.searchAccountId,
  }
}

const disconnected = () => strings().main.accounts.disconnected

// a service's own name follows the app's language; only a custom account keeps the name the user gave it
const nameOf = (account: Pick<Account, 'service' | 'name'>) =>
  SERVICES[account.service].kind === 'custom' ? account.name : SERVICES[account.service].name

function viewOf({ accounts, chat, searchAccountId }: Saved): ModelServicesView {
  return {
    accounts: accounts.map(({ apiKey, ...account }) => ({
      ...account,
      name: nameOf(account),
      keyHint: apiKey ? `••••${apiKey.slice(-4)}` : '',
    })),
    chat,
    searchAccountId,
  }
}

// DeepSeek's own provider adds fields only DeepSeek accepts (reasoning_content on every past reply), so the rest get the plain one
function modelOf(accounts: Account[], choice: ModelChoice | null): ModelObject | null {
  const account = accounts.find((candidate) => candidate.id === choice?.accountId)
  if (!account || !choice) return null
  const { apiKey, baseURL } = account
  if (account.service === 'deepseek') return createDeepSeek({ apiKey, baseURL })(choice.model)
  return createOpenAICompatible({ name: account.service, apiKey: apiKey || undefined, baseURL, includeUsage: true })(
    choice.model,
  )
}

/** The single connection of older versions as accounts: a DeepSeek one when it pointed at DeepSeek, a custom one otherwise. */
function fromLegacy({ apiKey, baseURL, model }: z.output<typeof LegacyConfig>): Saved {
  const host = new URL(baseURL).hostname
  const isOfficial = host === 'api.deepseek.com'
  const service = isOfficial || /deepseek/i.test(model) ? 'deepseek' : 'custom'
  const id = service === 'deepseek' ? 'deepseek' : `${CUSTOM_PREFIX}legacy`
  const name = service === 'deepseek' ? SERVICES.deepseek.name : host
  return {
    accounts: [{ id, service, name, baseURL, apiKey }],
    chat: { accountId: id, model },
    searchAccountId: isOfficial ? id : null,
  }
}

// What the app saved wins, so fixing a bad key in the UI works; DEEPSEEK_API_KEY is only a fallback for dev.
function read(file: string): { saved: Saved; isUnreadable: boolean } {
  if (fs.existsSync(file)) {
    try {
      const json: unknown = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)))
      return { saved: z.union([Saved, LegacyConfig.transform(fromLegacy)]).parse(json), isUnreadable: false }
    } catch (error) {
      console.error('saved model services could not be read; set aside on the next save:', error)
      return { saved: fromEnv(), isUnreadable: true }
    }
  }
  return { saved: fromEnv(), isUnreadable: false }
}

function fromEnv(): Saved {
  const envKey = process.env.DEEPSEEK_API_KEY
  if (!envKey) return EMPTY
  return fromLegacy({
    apiKey: envKey,
    baseURL: SERVICES.deepseek.baseURL,
    model: process.env.DEEPSEEK_MODEL ?? DEEPSEEK_MODEL,
  })
}
