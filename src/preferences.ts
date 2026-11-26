import { z } from 'zod'
import { strings } from '../shared/strings'

export const THEMES = [
  { id: 'light', label: strings().app.themes.light },
  { id: 'dark', label: strings().app.themes.dark },
  { id: 'system', label: strings().app.themes.system },
] as const

export const ACCENTS = [
  { id: 'black', label: strings().app.accents.black },
  { id: 'bot', label: strings().app.accents.bot },
] as const

const Fields = z.object({
  theme: z.enum(THEMES.map(({ id }) => id)).catch('light'),
  accent: z.enum(ACCENTS.map(({ id }) => id)).catch('bot'), // what the user's own bubbles are filled with
  sendKey: z.enum(['enter', 'mod-enter']).catch('enter'),
  isDebug: z.boolean().catch(true), // shows what only someone debugging needs, like the panel's recent tasks
})

/** The 通用 page's choices. Each field falls back on its own, so one stale value does not reset the rest. */
export const Preferences = Fields.catch(() => Fields.parse({}))
export type Preferences = z.infer<typeof Preferences>
export type Theme = Exclude<Preferences['theme'], 'system'>
export type SendKey = Preferences['sendKey']
