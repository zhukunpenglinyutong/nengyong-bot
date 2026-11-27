import { z } from 'zod'

/** How many days back the 用量 page can look. */
export const USAGE_DAYS = 30

const DOLLARS_MAX = 10_000

/** A model's price in dollars per million tokens; `cached` is the price of input the API read from its cache. */
export const Price = z.object({
  input: z.number().min(0).max(DOLLARS_MAX),
  cached: z.number().min(0).max(DOLLARS_MAX),
  output: z.number().min(0).max(DOLLARS_MAX),
})
export type Price = z.infer<typeof Price>

export const ModelName = z.string().trim().min(1).max(100)

/** Where a model call came from: a bot's chat (and the tasks it starts for the user), a routine, another bot's request. */
export type UsageSource = { kind: 'chat' } | { kind: 'routine'; name: string } | { kind: 'bot'; from: string }

export interface TokenCounts {
  input: number
  cached: number // part of `input` the API read from its cache
  output: number
}

/** The model calls of one bot, from one source, on one model, in one hour, summed. */
export interface UsageRecord extends TokenCounts {
  day: number // calendarDay of the calls
  hour: number // of the calls, on TIMEZONE's clock
  botId: string
  source: UsageSource
  model: string
  runs: number // chat turns or tasks this model answered; one it only summed up, or stood in for partway, counts elsewhere
  cost: number | null // estimated dollars; null when the model has no price
}

export interface ModelPrice {
  model: string
  price: Price | null // null: the model catalog does not list it and the user has not filled one in
  isCustom: boolean // the user filled it in
}

export interface UsageView {
  today: number // calendarDay
  hour: number // of now, on TIMEZONE's clock
  since: number | null // calendarDay of the first call ever recorded; null before the first
  records: UsageRecord[] // the last USAGE_DAYS days
  prices: ModelPrice[] // of every model in `records`
  botNames: Record<string, string> // every bot in `records`, also ones no longer in the sidebar
}

/** Uncached input at the input price, cached input at the cache price, output at the output price. */
const costOf = (tokens: TokenCounts, price: Price) =>
  ((tokens.input - tokens.cached) * price.input + tokens.cached * price.cached + tokens.output * price.output) / 1e6

/** Each model priced once, and every record with its model's price; null cost where there is none. */
export function priceRecords(
  unpriced: Omit<UsageRecord, 'cost'>[],
  priceOf: (model: string) => ModelPrice,
): { records: UsageRecord[]; prices: ModelPrice[] } {
  const prices = [...new Set(unpriced.map((record) => record.model))].map(priceOf)
  const priceByModel = new Map(prices.map((entry) => [entry.model, entry.price]))
  const records = unpriced.map((record): UsageRecord => {
    const price = priceByModel.get(record.model)
    return { ...record, cost: price ? costOf(record, price) : null }
  })
  return { records, prices }
}
