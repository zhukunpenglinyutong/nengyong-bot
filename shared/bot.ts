import { z } from 'zod'
import { listOf } from './listOf'
import { newId, timeOfId } from './newId'
import { MAIN_BOT_OUTFIT, OutfitId } from './outfit'
import { strings } from './strings'

export const PICKER_SHAPES = [
  'blob',
  'cloud',
  'onigiri',
  'sun',
  'clover',
  'cat',
  'pudding',
  'diamond',
  'mushroom',
  'drop',
  'octagon',
  'bell',
] as const

export const PALETTE = [
  { id: 'ink', value: '#1E1E22' },
  { id: 'coral', value: '#FF5A5F' },
  { id: 'tangerine', value: '#FF8A1F' },
  { id: 'lemon', value: '#F2B705' },
  { id: 'moss', value: '#7AA83B' },
  { id: 'mint', value: '#2BC48A' },
  { id: 'lake', value: '#1BA9C8' },
  { id: 'sky', value: '#4A8CFF' },
  { id: 'grape', value: '#7B5CF5' },
  { id: 'rose', value: '#F0468C' },
  { id: 'cocoa', value: '#8B5E3C' },
  { id: 'slate', value: '#6E7681' },
] as const

export const BOT_NAME_MAX = 40

// ids are handed to the model in prompts and tool calls: keep them plain, word characters and dashes only
export const BOT_ID_PATTERN = '[\\w-]{1,40}'
export const BotId = z.string().regex(new RegExp(`^${BOT_ID_PATTERN}$`))

export const Shape = z.enum(PICKER_SHAPES)
export type Shape = z.infer<typeof Shape>

const AVATAR_MAX_CHARS = 500_000
const avatarDataUrl = z
  .string()
  .max(AVATAR_MAX_CHARS)
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)

/** A bot as the sidebar shows it. Parsing truncates an over-long name instead of rejecting the bot.
 * An uploaded picture (`avatar`) is drawn in place of the shape and colour, and without the outfit. */
export const Bot = z.object({
  id: BotId,
  name: z
    .string()
    .trim()
    .min(1)
    .transform((name) => name.slice(0, BOT_NAME_MAX)),
  shape: Shape,
  color: z.string().refine((value) => PALETTE.some((color) => color.value === value)),
  avatar: avatarDataUrl.optional(),
  outfit: z.array(OutfitId).optional(),
})
export type Bot = z.infer<typeof Bot>

/** Where the harness puts a bot in the sidebar: the section already called `name`, or else a new one with `id`. */
const SectionByName = z.object({ id: z.string(), name: z.string() })
export type SectionByName = z.infer<typeof SectionByName>

/** A bot just created by the harness, and the sidebar section it goes into (absent = the ungrouped one). */
export const NewBot = Bot.extend({ section: SectionByName.optional() })
export type NewBot = z.infer<typeof NewBot>

/** A saved bot keeps its place even when its look is no longer offered: it gets the closest colour and a shape of its own.
 * A picture it cannot draw is dropped, and the shape shows instead; so is a piece of outfit that no longer exists. */
export const StoredBot = Bot.extend({
  shape: z.string(),
  color: z.string(),
  avatar: avatarDataUrl.optional().catch(undefined),
  outfit: listOf(OutfitId).optional().catch(undefined),
}).transform(
  (bot): Bot => ({
    ...bot,
    shape: Shape.safeParse(bot.shape).data ?? fallbackShape(bot.id),
    color: closestColor(bot.color),
    // the main bot wore its crown before outfits were saved: one saved without an outfit still has it on
    outfit: bot.outfit ?? (bot.id === MAIN_BOT_ID ? MAIN_BOT_OUTFIT : undefined),
  }),
)

function fallbackShape(id: string): Shape {
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0)
  return PICKER_SHAPES[sum % PICKER_SHAPES.length]
}

function closestColor(value: string): string {
  const target = rgbOf(value)
  if (!target) return PALETTE[0].value
  const distance = (hex: string) =>
    (rgbOf(hex) ?? [0, 0, 0]).reduce((sum, channel, i) => sum + (channel - target[i]) ** 2, 0)
  return PALETTE.reduce((best, color) => (distance(color.value) < distance(best.value) ? color : best)).value
}

function rgbOf(hex: string): number[] | null {
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)?.[1]
  if (!digits) return null
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits
  return [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16))
}

// The main agent: always present, the entry point for every request, never deletable.
export const MAIN_BOT_ID = 'chief'
export const MAIN_BOT: Bot = { id: MAIN_BOT_ID, name: 'CEO', shape: 'blob', color: '#1E1E22', outfit: MAIN_BOT_OUTFIT }

// Every new user gets it from the onboarding, pinned next to the main bot; unlike the main bot it can be deleted.
export const secretary = (): Bot => ({
  id: 'secretary',
  name: strings().common.secretaryName,
  shape: 'clover',
  color: '#F0468C',
})

const BOT_ID_PREFIX = 'b'
export const newBotId = () => newId(BOT_ID_PREFIX)
/** When the bot was created; undefined for the built-in ones, whose ids are fixed. */
export const botCreatedAt = (id: string) => timeOfId(id, BOT_ID_PREFIX)
/** The number on its staff badge: the last 4 characters of a created bot's id, the whole id of a built-in one. */
export const workNumberOf = (id: string) => (botCreatedAt(id) === undefined ? id : id.slice(-4)).toUpperCase()
