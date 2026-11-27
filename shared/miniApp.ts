import { z } from 'zod'
import { PALETTE } from './bot'
import { isUnfinished, type TaskView } from './bridge'
import { MESSAGE_MAX_CHARS } from './limits'

/** The icons a mini app's tile can carry: the bot picks one when it saves the app. Each is a name in src/ui/Icon. */
export const MINI_APP_ICONS = [
  'chart',
  'table',
  'calendar',
  'doc',
  'check',
  'clock',
  'team',
  'chat',
  'folder',
  'cube',
] as const
export const MINI_APP_COLORS = PALETTE.filter((color) => color.id !== 'ink').map((color) => color.id)

export const MINI_APP_HTML_MAX_CHARS = 300_000
export const MINI_APP_DATA_MAX_CHARS = 500_000 // its data as JSON text: what the app itself saves, too

/** One saved state of a mini app's page. The data is not part of it: new data never makes a new version. */
const MiniAppVersion = z.object({
  version: z.number().int().min(1),
  change: z.string(), // what this version changed, in one line
  at: z.number(),
})
type MiniAppVersion = z.infer<typeof MiniAppVersion>

/** 小程序: a page a bot wrote, with the data it put in. Opens in a phone-sized window; every change to the page is a new version. */
export const MiniApp = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.enum(MINI_APP_ICONS),
  color: z.enum(MINI_APP_COLORS),
  versions: z.array(MiniAppVersion).min(1), // oldest first; the last one is what opens
  dataAt: z.number().nullable(), // when its data last changed, by the bot or saved from the page; null: no data yet
})
export type MiniApp = z.infer<typeof MiniApp>

export const latestVersion = (app: MiniApp): MiniAppVersion => app.versions.at(-1) ?? { version: 1, change: '', at: 0 }

/** Whether an unfinished task of its bot is changing the mini app. */
export const isBeingChanged = (miniAppId: string, tasks: TaskView[]) =>
  tasks.some((task) => isUnfinished(task) && task.miniAppId === miniAppId)

/** The version that was the latest at `at`: what a reply written then showed. */
export const versionAt = (app: MiniApp, at: number): MiniAppVersion =>
  app.versions.findLast((version) => version.at <= at) ?? latestVersion(app)

/** What a reply links as [名字](app:ID); what save_app returns for the bot to write. */
export const miniAppMention = (app: Pick<MiniApp, 'id' | 'name'>) => `[${app.name}](app:${app.id})`

/** The mini apps a reply links, each once, in the order it links them. */
export function miniAppIdsIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\]\(app:([\w-]+)\)/g)].flatMap((match) => (match[1] ? [match[1]] : [])))]
}

/** What a page posts to the window it sits in (see miniAppPage): untrusted, parsed when it arrives. */
export const MiniAppMessage = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('save'), data: z.unknown() }), // nengyongbot.save(data): keep what the user changed
  z.object({ kind: z.literal('ask'), text: z.string().trim().min(1).max(MESSAGE_MAX_CHARS) }), // nengyongbot.ask(text)
  z.object({ kind: z.literal('error'), message: z.string() }), // an error its own scripts did not catch
])
export type MiniAppMessage = z.infer<typeof MiniAppMessage>
