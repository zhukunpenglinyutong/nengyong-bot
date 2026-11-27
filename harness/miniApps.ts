import fs from 'node:fs'
import { tool } from 'ai'
import { z } from 'zod'
import type { HarnessEvent } from '../shared/bridge'
import { strings } from '../shared/strings'
import {
  latestVersion,
  MINI_APP_COLORS,
  MINI_APP_DATA_MAX_CHARS,
  MINI_APP_HTML_MAX_CHARS,
  MINI_APP_ICONS,
  type MiniApp,
  miniAppMention,
} from '../shared/miniApp'
import { miniAppPage } from '../shared/miniAppPage'
import { newId } from '../shared/newId'
import type { Store } from './store'
import { line, OptionalId } from './toolInputs'
import type { Workspace } from './workspace'

const MAX_MINI_APPS = 30 // per bot: each one is listed in every system prompt of its chat

/** A mini app's files in the library: one page per version, and one data file for all of them. */
export const miniAppFolder = (id: string) => `apps/${id}`
export const miniAppPath = (id: string, version: number) => `${miniAppFolder(id)}/v${version}.html`
export const miniAppDataPath = (id: string) => `${miniAppFolder(id)}/data.json`

const NewMiniApp = z.object({
  id: OptionalId.describe('改已有的小程序时填它的 id，存成新版本；新做的不填'),
  name: line(20).describe('显示在面板和窗口标题上的短名字，如“收入汇总”'),
  icon: z.enum(MINI_APP_ICONS),
  color: z.enum(MINI_APP_COLORS).describe('图标的底色'),
  change: line(60).describe('这一版改了什么，一句话，如“加了月目标线”；新做的写“第一版：”加上它做什么'),
  html: z.string().min(1).max(MINI_APP_HTML_MAX_CHARS).describe('完整的单文件 HTML，CSS 和 JS 都写在里面'),
  data: z
    .string()
    .max(MINI_APP_DATA_MAX_CHARS)
    .optional()
    .describe('页面用的数据，JSON 文本，页面里用 nengyongbot.data 读；不填就保留原来的数据'),
})

interface MiniAppContext {
  botId: string
  store: Store
  workspace: Workspace
  emit: (event: HarnessEvent) => void
}

/** What a task uses to make a mini app, change its page (a new version each time), or put new data in. */
export function miniAppTools(context: MiniAppContext) {
  const { botId, store, workspace } = context
  return {
    save_app: tool({
      description:
        '存一个小程序：新做（不填 id）或者改已有的（填 id，存成新版本）。它显示在用户面板的「小程序」里，点开是一个手机大小的窗口。返回的 mention 原样写进结论。',
      inputSchema: NewMiniApp,
      execute: async ({ id, html, data, change, ...look }) => {
        const parsed = data === undefined ? undefined : parseData(data)
        const known = id === undefined ? undefined : miniAppOf(store, botId, id)
        if (!known && miniAppsOf(store, botId).length >= MAX_MINI_APPS)
          throw new Error(`最多 ${MAX_MINI_APPS} 个小程序，先请用户删掉不用的`)
        const now = Date.now()
        const version = known ? latestVersion(known).version + 1 : 1
        const app: MiniApp = {
          id: known?.id ?? newId('a'),
          ...look,
          versions: [...(known?.versions ?? []), { version, change, at: now }],
          dataAt: parsed === undefined ? (known?.dataAt ?? null) : now,
        }
        workspace.write(miniAppPath(app.id, version), html)
        if (parsed !== undefined) workspace.write(miniAppDataPath(app.id), JSON.stringify(parsed))
        updateMiniApps(context, (apps) =>
          known ? apps.map((each) => (each.id === app.id ? app : each)) : [...apps, app],
        )
        if (parsed !== undefined && app.dataAt !== null)
          context.emit({ kind: 'mini-app-data', botId, miniAppId: app.id, data: parsed, dataAt: app.dataAt })
        return { saved: app.id, version, mention: miniAppMention(app) }
      },
    }),
    update_app_data: tool({
      description: '只换小程序的数据，页面不变，也不算新版本。例行任务每天刷新数据就用它。',
      inputSchema: z.object({
        id: z.string(),
        data: z.string().max(MINI_APP_DATA_MAX_CHARS).describe('新的数据，JSON 文本，整份替换'),
      }),
      execute: async ({ id, data }) => {
        const parsed = parseData(data)
        const dataAt = saveMiniAppData(context, id, parsed)
        context.emit({ kind: 'mini-app-data', botId, miniAppId: id, data: parsed, dataAt })
        return { updated: id }
      },
    }),
  }
}

function parseData(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('data 不是合法的 JSON 文本')
  }
}

const miniAppsOf = (store: Store, botId: string) => store.get().bots[botId]?.miniApps ?? []

/** Throws a readable reason unless the bot has this mini app. */
export function miniAppOf(store: Store, botId: string, id: string): MiniApp {
  const app = miniAppsOf(store, botId).find((candidate) => candidate.id === id)
  if (!app) throw new Error(strings().harness.miniApps.notFound(id))
  return app
}

function updateMiniApps({ store, emit, botId }: MiniAppContext, change: (apps: MiniApp[]) => MiniApp[]) {
  const miniApps = change(miniAppsOf(store, botId))
  store.updateBot(botId, { miniApps })
  emit({ kind: 'mini-apps', botId, miniApps })
}

/** Replaces its data: from a task, or saved by the page itself, which already shows it. Returns when it changed. */
export function saveMiniAppData(context: MiniAppContext, id: string, data: unknown): number {
  const app = miniAppOf(context.store, context.botId, id)
  const text = JSON.stringify(data ?? null)
  if (text.length > MINI_APP_DATA_MAX_CHARS)
    throw new Error(strings().harness.miniApps.dataTooLarge(MINI_APP_DATA_MAX_CHARS))
  context.workspace.write(miniAppDataPath(id), text)
  const dataAt = Date.now()
  updateMiniApps(context, (apps) => apps.map((each) => (each.id === app.id ? { ...each, dataAt } : each)))
  return dataAt
}

/** A new version whose page is the one of `version`: going back never rewrites what was saved. */
export function restoreMiniApp(context: MiniAppContext, id: string, version: number) {
  const app = miniAppOf(context.store, context.botId, id)
  const html = readPage(context.workspace, app, version)
  const next = latestVersion(app).version + 1
  context.workspace.write(miniAppPath(id, next), html)
  const restored = {
    version: next,
    change: strings().harness.miniApps.restored(version),
    at: Date.now(),
  }
  updateMiniApps(context, (apps) =>
    apps.map((each) => (each.id === id ? { ...each, versions: [...each.versions, restored] } : each)),
  )
}

/** Gone from the panel, its versions and data deleted from the library. */
export function deleteMiniApp(context: MiniAppContext, id: string) {
  miniAppOf(context.store, context.botId, id)
  updateMiniApps(context, (apps) => apps.filter((each) => each.id !== id))
  fs.rmSync(context.workspace.resolve(miniAppFolder(id)), { recursive: true, force: true })
}

/** One version's page with its data and `window.nengyongbot` built in: what its window loads, or the user exports. */
export function miniAppHtml(store: Store, workspace: Workspace, botId: string, id: string, version: number): string {
  const app = miniAppOf(store, botId, id)
  return miniAppPage(readPage(workspace, app, version), readData(workspace, id))
}

function readPage(workspace: Workspace, app: MiniApp, version: number): string {
  if (!app.versions.some((each) => each.version === version))
    throw new Error(strings().harness.miniApps.noVersion(app.name, version))
  const file = workspace.resolve(miniAppPath(app.id, version))
  if (!fs.existsSync(file)) throw new Error(strings().harness.miniApps.pageMissing(app.name, version))
  return fs.readFileSync(file, 'utf8')
}

function readData(workspace: Workspace, id: string): unknown {
  const file = workspace.resolve(miniAppDataPath(id))
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null // edited by hand into something that is not JSON: the page starts without data instead of failing
  }
}
