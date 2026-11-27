import { MAIN_BOT_ID } from '../../shared/bot'
import { DEEPSEEK_MODEL } from '../../shared/modelServices'
import { calendarDay, clockHour } from '../../shared/timezone'
import {
  type ModelPrice,
  type Price,
  priceRecords,
  USAGE_DAYS,
  type UsageRecord,
  type UsageSource,
  type UsageView,
} from '../../shared/usage'
import { DEMO_SIDEBAR } from './demoData'
import { strings } from '../../shared/strings'

const words = strings().demo.routines

// as LiteLLM's catalog lists them; qwen-plus is left out, so the demo shows filling in a price
const CATALOG_PRICES: Record<string, Price> = {
  [DEEPSEEK_MODEL]: { input: 0.3, cached: 0.006, output: 1.2 },
  'gpt-5': { input: 1.25, cached: 0.125, output: 10 },
  'claude-sonnet-4-5': { input: 3, cached: 0.3, output: 15 },
}

interface Work {
  botId: string
  source: UsageSource
  input: number // tokens a run reads, about
  output: number
  cacheRate: number // of the input, read from the API's cache
  runsOn: (weekday: number, random: () => number) => number
  hours?: number[] // a routine's, one per run; chats and requests come any time from FIRST_HOUR on
}

const FIRST_HOUR = 9
const WAKING_HOURS = 14

const isWeekend = (weekday: number) => weekday === 0 || weekday === 6
const daily = (times: number) => () => times
const onDays = (days: number[]) => (weekday: number) => (days.includes(weekday) ? 1 : 0)
const chats = (most: number) => (weekday: number, random: () => number) =>
  Math.round(random() * most * (isWeekend(weekday) ? 0.4 : 1))
const sometimes = (chance: number) => (weekday: number, random: () => number) =>
  random() < chance * (isWeekend(weekday) ? 0.5 : 1) ? 1 : 0

const routine = (name: string) => ({ kind: 'routine', name }) as const
const CHAT = { kind: 'chat' } as const

const WORK: Work[] = [
  {
    botId: 'repo',
    source: routine(words.githubStats),
    input: 820_000,
    output: 22_000,
    cacheRate: 0.6,
    runsOn: daily(1),
    hours: [9],
  },
  {
    botId: 'content',
    source: routine(words.opsReport),
    input: 420_000,
    output: 14_000,
    cacheRate: 0.6,
    runsOn: onDays([1, 2, 3, 4, 5]),
    hours: [10],
  },
  {
    botId: 'support',
    source: routine(words.feedbackDigest),
    input: 95_000,
    output: 3_000,
    cacheRate: 0.6,
    runsOn: daily(4),
    hours: [9, 12, 15, 18],
  },
  {
    botId: 'release',
    source: routine(words.fridayRelease),
    input: 1_300_000,
    output: 36_000,
    cacheRate: 0.6,
    runsOn: onDays([5]),
    hours: [16],
  },
  {
    botId: 'fitness',
    source: routine(words.workoutReview),
    input: 60_000,
    output: 2_500,
    cacheRate: 0.6,
    runsOn: daily(1),
    hours: [21],
  },
  { botId: MAIN_BOT_ID, source: CHAT, input: 46_000, output: 1_400, cacheRate: 0.8, runsOn: chats(14) },
  { botId: 'ledger', source: CHAT, input: 70_000, output: 1_800, cacheRate: 0.8, runsOn: chats(6) },
  { botId: 'repo', source: CHAT, input: 52_000, output: 1_500, cacheRate: 0.8, runsOn: chats(3) },
  { botId: 'travel', source: CHAT, input: 30_000, output: 1_200, cacheRate: 0.8, runsOn: chats(4) },
  { botId: 'ideas', source: CHAT, input: 26_000, output: 1_000, cacheRate: 0.8, runsOn: chats(3) },
  {
    botId: 'ledger',
    source: { kind: 'bot', from: MAIN_BOT_ID },
    input: 300_000,
    output: 9_000,
    cacheRate: 0.6,
    runsOn: sometimes(0.5),
  },
  {
    botId: 'repo',
    source: { kind: 'bot', from: MAIN_BOT_ID },
    input: 380_000,
    output: 12_000,
    cacheRate: 0.6,
    runsOn: sometimes(0.35),
  },
]

// a bot can have a model of its own, and even use one for chat and another for its routines
function modelOf({ botId, source }: Work): string {
  if (botId === MAIN_BOT_ID) return 'gpt-5'
  if (botId === 'ledger') return 'claude-sonnet-4-5'
  if (botId === 'repo' && source.kind === 'chat') return 'gpt-5'
  if (botId === 'fitness') return 'qwen-plus'
  return DEEPSEEK_MODEL
}

/** A month of model calls from the demo's bots, the same on every load; priced with what the user filled in. */
export function demoUsage(filled: ReadonlyMap<string, Price>, now = Date.now()): UsageView {
  const today = calendarDay(now)
  const hour = clockHour(now)
  const random = seeded(7)
  const days = Array.from({ length: USAGE_DAYS }, (_, index) => today - USAGE_DAYS + 1 + index)
  const unpriced = days
    .flatMap((day) => WORK.flatMap((work) => recordsOf(day, work, random)))
    .filter((record) => record.day < today || record.hour <= hour)
  const { records, prices } = priceRecords(
    unpriced,
    (model): ModelPrice => ({
      model,
      price: filled.get(model) ?? CATALOG_PRICES[model] ?? null,
      isCustom: filled.has(model),
    }),
  )
  const botNames = Object.fromEntries(DEMO_SIDEBAR.bots.map((bot) => [bot.id, bot.name]))
  return { today, hour, since: days[0] ?? today, records, prices, botNames }
}

function recordsOf(day: number, work: Work, random: () => number): Omit<UsageRecord, 'cost'>[] {
  const runs = work.runsOn(new Date(day * 86_400_000).getUTCDay(), random)
  const hours = Array.from(
    { length: runs },
    (_, index) => work.hours?.[index] ?? FIRST_HOUR + Math.floor(random() * WAKING_HOURS),
  )
  return [...new Set(hours)].map((hour) => {
    const runsInHour = hours.filter((runHour) => runHour === hour).length
    const vary = (tokens: number) => Math.round(tokens * runsInHour * (0.7 + random() * 0.6))
    const input = vary(work.input)
    const cached = Math.round(input * work.cacheRate * (0.85 + random() * 0.15))
    return {
      day,
      hour,
      botId: work.botId,
      source: work.source,
      model: modelOf(work),
      input,
      cached,
      output: vary(work.output),
      runs: runsInHour,
    }
  })
}

/** mulberry32, seeded: the demo's numbers stay put between reloads. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state += 0x6d2b79f5
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
