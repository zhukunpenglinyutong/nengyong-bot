import { z } from 'zod'
import type { AttachmentFile } from './attachment'
import { Bot, type NewBot } from './bot'
import type { ContextView, Trace } from './debug'
import type { DevicesView, PairingRequest } from './devices'
import type { Flow } from './flow'
import type { Limits } from './limits'
import type { Language } from './language'
import type { MiniApp } from './miniApp'
import type { AccountInput, AccountUse, ModelChoice, ModelServicesView } from './modelServices'
import type { SidebarState } from './sidebar'
import type { SkillFileView, SkillOffer, SkillRef, SkillUploadKind, SkillView } from './skill'
import type { Price, UsageView } from './usage'

/** The contract between the Electron main process (harness) and the renderer. */

/** What preload exposes as window.nengyongbot; a paired device's browser gets the methods it may use over HTTP (src/remote). */
export interface NengyongBotBridge {
  isMac: boolean // macOS draws its window buttons over the sidebar's top bar; other platforms keep that space free
  getLanguage: () => Promise<Language> // the app's, which the renderer sets before it shows anything
  setLanguage: (language: Language) => Promise<void> // from the next text made; the renderer reloads to show it
  // text may be empty when there are attachments; quoteSeq: the seq of the message in this bot's chat the user replies to;
  // miniAppId: the mini app of this bot open while the user wrote it, so "改一下" means that one
  send: (
    botId: string,
    text: string,
    attachments: AttachmentFile[],
    quoteSeq: number | null,
    miniAppId: string | null,
  ) => Promise<void>
  attachmentUrl: (path: string) => string // where an <img> loads an attachment from
  miniAppUrl: (botId: string, miniAppId: string, version: number, dataAt: number | null) => string // a sandboxed iframe's src
  askFromMiniApp: (botId: string, miniAppId: string, text: string) => Promise<void> // nengyongbot.ask: sent to its bot as the user
  saveMiniAppData: (botId: string, miniAppId: string, data: unknown) => Promise<void> // nengyongbot.save
  restoreMiniApp: (botId: string, miniAppId: string, version: number) => Promise<void> // a new version with that one's page
  deleteMiniApp: (botId: string, miniAppId: string) => Promise<void> // its versions and data too
  miniAppHtml: (botId: string, miniAppId: string, version: number) => Promise<string> // one file that runs offline, to export
  history: (botId: string) => Promise<Entry[]>
  deleteMessages: (botId: string, seqs: number[]) => Promise<void> // user and bot messages of its chat; gone from every read, the model's included
  previews: () => Promise<Record<string, string>> // last reply per bot, for the sidebar
  panel: (botId: string) => Promise<PanelData> // the right-hand panel of one bot
  tasksAndRoutines: () => Promise<Record<string, TasksAndRoutines>> // of every bot, for the status the sidebar shows before one is opened
  context: (botId: string) => Promise<ContextView | null> // what its chat would send the model now, for debug mode
  setDebug: (isOn: boolean) => Promise<void> // context and trace events are sent only while debug mode is on
  setRoutineEnabled: (botId: string, routineId: string, isEnabled: boolean) => Promise<void>
  openLibraryItem: (path: string) => Promise<void> // relative to the library, or absolute inside it
  // the user's answer to an install card in botId's chat: the skills to install, none to turn it down; throws a
  // readable reason once the card has expired
  answerSkillOffer: (botId: string, offer: string, names: string[]) => Promise<void>
  // asks for a skill folder or archive on this computer and reads the skills in it for botId; null when cancelled
  uploadSkill: (botId: string, kind: SkillUploadKind) => Promise<SkillOffer | null>
  // the user's answer to the card an upload showed in botId's panel, as above; nothing goes in the chat
  answerSkillUpload: (botId: string, offer: string, names: string[]) => Promise<void>
  removeSkills: (botId: string, names: string[]) => Promise<void> // of that bot, all or none; their folders are deleted
  skillFiles: (ref: SkillRef) => Promise<SkillFileView[]> // for the files dialog, SKILL.md first
  skillFile: (ref: SkillRef, path: string) => Promise<string | null> // its text; null when it is not text or too big
  revealSkill: (botId: string, name: string) => Promise<void> // shows its folder in Finder
  stopReply: (botId: string, runId: string) => Promise<void> // only while that turn still runs; what it wrote so far stays
  stopTask: (botId: string, taskId: string) => Promise<void> // only a task this bot runs
  getSidebar: () => Promise<SidebarState | null> // null until the first save
  needsOnboarding: () => Promise<boolean> // the onboarding has not run yet: it comes first, even over saved data
  saveSidebar: (sidebar: SidebarState) => Promise<NewBot[]> // returns bots the harness created that the sidebar has not shown yet
  getDataDir: () => Promise<string>
  openDataDir: () => Promise<void> // shows the data dir in Finder
  moveDataDir: () => Promise<void> // asks for a new place; on success the app restarts with the data there
  exportData: () => Promise<string | null> // asks for a folder; returns the backup's path, null when cancelled
  importData: () => Promise<void> // asks for a backup; on success the app restarts
  getModelServices: () => Promise<ModelServicesView>
  listModels: (accountId: string) => Promise<string[]> // its chat models; throws a readable reason when it cannot be reached
  // checks the address and key first and saves only if they work; use: also set that use to this account
  saveAccount: (input: AccountInput, use: AccountUse | null) => Promise<ModelServicesView>
  removeAccount: (accountId: string) => Promise<ModelServicesView> // whatever used it is turned off
  setChatModel: (choice: ModelChoice) => Promise<ModelServicesView>
  setSearchAccount: (accountId: string | null) => Promise<ModelServicesView> // null turns web search off
  getMcpConfig: () => Promise<McpConfigView> // waits until every server has connected or failed
  setMcpConfig: (text: string) => Promise<McpConfigView> // reconnects every server; throws a readable reason when the text is not a valid config
  getLimits: () => Promise<Limits>
  setLimits: (limits: Limits) => Promise<Limits> // applies from the next turn or task; waiting tasks start if more may run
  usage: () => Promise<UsageView> // the 用量 page: model calls of the last USAGE_DAYS days, priced as they are read
  setModelPrice: (model: string, price: Price) => Promise<UsageView> // for a model the catalog does not list; prices past calls too
  onboard: (choices: OnboardingChoices) => Promise<Bot[]> // the hired bots: the secretary, then the ones asked in order; the main bot greets
  getDevices: () => Promise<DevicesView>
  setLanAccess: (isOn: boolean) => Promise<DevicesView> // off: every device is cut off at once, and let in again once it is back on
  removeDevice: (deviceId: string) => Promise<DevicesView> // cut off at once; it has to pair again
  answerPairing: (requestId: string, code: string | null) => Promise<void> // the code on the device's screen; null turns it away
  checkForUpdate: () => Promise<UpdateCheck> // asks GitHub Releases; throws a readable reason when it cannot
  installUpdate: () => Promise<void> // downloads what the last check found, reporting update-progress, then restarts into it
  onEvent: (cb: (e: HarnessEvent) => void) => () => void
}

const stamp = { seq: z.number(), at: z.number() }

/** The message of the same chat a user message replies to: its seq, and the start of its text. */
export const Quote = z.object({ seq: z.number(), text: z.string() })
export type Quote = z.infer<typeof Quote>

/** One record of a transcript: a bot's chat or a task's run. Append-only. */
export const Entry = z.discriminatedUnion('kind', [
  z.object({
    ...stamp,
    kind: z.literal('user'),
    text: z.string(),
    attachments: z.array(z.string()).optional(), // library paths
    quote: Quote.optional(),
    // the mini app of this bot that was open when the user wrote it, or that sent it for them (nengyongbot.ask)
    miniApp: z.object({ id: z.string(), name: z.string(), version: z.number(), isSentByApp: z.boolean() }).optional(),
  }),
  // a message the user sees; suggestions: things to try, under the onboarding's greeting, each fills the message box;
  // model: what wrote it, absent on replies from before it was recorded; requestId: the model API's id for the call that
  // wrote it, when the API gave one
  z.object({
    ...stamp,
    kind: z.literal('bot'),
    text: z.string(),
    suggestions: z.array(z.string()).optional(),
    model: z.string().optional(),
    fallbackFrom: z.string().optional(), // the model it was set to, which could not be reached: `model`, the main one, stood in
    requestId: z.string().optional(),
  }),
  z.object({ ...stamp, kind: z.literal('from-bot'), from: z.string(), text: z.string() }), // a task's brief; in older chats, a request from another bot
  z.object({ ...stamp, kind: z.literal('routine'), name: z.string(), text: z.string() }),
  z.object({
    ...stamp,
    kind: z.literal('task-result'),
    taskId: z.string(),
    title: z.string(),
    status: z.enum(['done', 'failed']),
    text: z.string(),
    flowId: z.string().optional(), // the flow of this chat's bot the task followed
    model: z.string().optional(), // what it ran on, absent on results from before it was recorded
    fallbackFrom: z.string().optional(), // as on a bot entry
  }), // what a task handed back to the chat of the bot that started it
  // the user's answer to an install card in this chat: the skills ticked, installed on `botId`; none when turned down
  z.object({
    ...stamp,
    kind: z.literal('skill-answer'),
    offer: z.string(),
    botId: z.string(),
    names: z.array(z.string()),
  }),
  z.object({
    ...stamp,
    kind: z.literal('tool'),
    name: z.string(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
  }), // audit trail, not shown
])
export type Entry = z.infer<typeof Entry>

export const TaskStatus = z.enum(['waiting', 'running', 'done', 'failed', 'stopped', 'interrupted'])
export type TaskStatus = z.infer<typeof TaskStatus>
export const isUnfinished = (task: { status: TaskStatus }) => task.status === 'running' || task.status === 'waiting'

/** Live activity of a bot: the renderer turns it into a label ("正在安排任务"). */
export type Activity = { kind: 'thinking' } | { kind: 'typing' } | { kind: 'tool'; tool: string }

export type HarnessEvent =
  | { kind: 'entry'; botId: string; entry: Entry }
  | { kind: 'draft'; botId: string; text: string } // the message being streamed right now ('' clears it)
  | { kind: 'busy'; botId: string; busy: boolean; runId: string } // runId: the turn starting or ending, which stopReply names
  | { kind: 'queued'; botId: string; texts: string[] } // user messages waiting for the running turn to end; [] once read
  | { kind: 'activity'; botId: string; activity: Activity } // what the bot is doing right now, for the progress row
  | { kind: 'bot-created'; bot: NewBot }
  | { kind: 'bot-renamed'; botId: string; name: string }
  | { kind: 'routines'; botId: string; routines: RoutineView[] }
  | { kind: 'flows'; botId: string; flows: Flow[] }
  | { kind: 'skills'; botId: string; skills: SkillView[] } // what its panel lists: the main bot's lists every bot's
  | { kind: 'mini-apps'; botId: string; miniApps: MiniApp[] }
  | { kind: 'mini-app-data'; botId: string; miniAppId: string; data: unknown; dataAt: number } // a task put new data in
  | { kind: 'library'; botId: string; library: LibraryItem[] }
  | { kind: 'tasks'; botId: string; tasks: TaskView[] }
  | { kind: 'models'; botId: string; models: BotModels } // it switched its chat model, or the main model changed
  | { kind: 'context'; botId: string; context: ContextView } // a chat turn starts with it; again once the API has counted it
  | { kind: 'trace'; botId: string; trace: Trace } // a run of this bot (its chat or one of its tasks) moved on
  | { kind: 'error'; botId: string; message: string; code?: 'no-key' }
  | { kind: 'open-settings' } // app menu: open the settings window
  | { kind: 'open-bot'; botId: string } // a system notification was clicked: show this bot
  | { kind: 'devices'; devices: DevicesView } // a device came or went, was removed, or 局域网访问 was switched
  | { kind: 'pairing'; request: PairingRequest | null } // a device asks to be let in; null once answered or expired
  | { kind: 'update-progress'; percent: number; transferredBytes: number; totalBytes: number } // installUpdate downloading
  | { kind: 'update-error'; message: string } // electron-updater gave up: after installUpdate answered, nothing else says so

/** What GitHub Releases has: its newest version, and whether that is newer than the one running. */
export interface UpdateCheck {
  version: string
  date: string // ISO; when it was published
  isNewer: boolean
}

export interface RoutineView {
  id: string
  name: string
  timezone: string
  isEnabled: boolean
  nextRunAt: number | null
  flowId?: string // the flow of its bot each run follows
  model?: string // what each run is set to; undefined: the flow's model, else the main one
}

export interface LibraryItem {
  kind: 'file' | 'doc' | 'media'
  path: string
  writtenAt: number
}

export interface TaskView {
  id: string
  title: string
  status: TaskStatus
  statusText: string
  createdAt: number
  endedAt: number | null
  requestedBy: string | null // null when the bot started the task itself
  isRoutine: boolean
  flowId?: string // the flow of its bot it follows
  miniAppId?: string // the mini app of its bot it changes
  model?: string // what it is set to run on; undefined: the main model
  failureReason?: string // why it failed, when it did
}

/** The models a bot works with, for its panel: shown there, changed only by asking the bot in its chat. */
export interface BotModels {
  main: string | null // null until the user picks one in the settings
  chat: ChosenModel | null // what its chat is set to; null: the main model
  tasks: ChosenModel | null // what its tasks run on when neither they nor their flow name one; null: the main model
}

interface ChosenModel {
  model: string
  isGone: boolean // its account was removed: the main model stands in
}

export type TasksAndRoutines = Pick<PanelData, 'tasks' | 'routines'>

export interface PanelData {
  routines: RoutineView[]
  flows: Flow[]
  skills: SkillView[] // its own; the main bot's are every bot's, since it can use them all
  miniApps: MiniApp[]
  library: LibraryItem[]
  tasks: TaskView[]
  models: BotModels
}

/** The local MCP servers as the user wrote them (Claude Desktop's mcpServers format), and how connecting to each went. */
export interface McpConfigView {
  text: string
  servers: McpServerView[]
}
export type McpServerView =
  | { kind: 'ready'; name: string; tools: McpToolView[] }
  | { kind: 'failed'; name: string; message: string }
export interface McpToolView {
  name: string
  description?: string
}
export const EMPTY_MCP_CONFIG = '{\n  "mcpServers": {}\n}\n'

export const ADDRESS_MAX = 20
const MAX_HIRES = 5
const MAX_SUGGESTIONS = 3

/** What the user settled in the onboarding: the main bot's name, how to address them, the bots to hire, what to try first. */
export const OnboardingChoices = z.object({
  bossName: Bot.shape.name,
  address: z.string().trim().max(ADDRESS_MAX), // '' when the user gave none
  hires: z
    .array(Bot.omit({ id: true, outfit: true }).extend({ duty: z.string().trim().min(1).max(200) }))
    .max(MAX_HIRES),
  suggestions: z.array(z.string().trim().min(1).max(100)).max(MAX_SUGGESTIONS),
})
export type OnboardingChoices = z.infer<typeof OnboardingChoices>
