import { type Bot, StoredBot } from '../../shared/bot'
import { type TokenCounts, USAGE_DAYS, type UsageRecord, type UsageSource, type UsageView } from '../../shared/usage'
import type { IconName } from '../ui/Icon'
import { strings } from '../../shared/strings'

export type Dimension = 'bot' | 'source' | 'model'
export type Range = 1 | 7 | 30 // 1: today, hour by hour

/** A record with what it amounts to in the page's measure; null: spent on a model with no price. */
export interface Measured extends UsageRecord {
  amount: number | null
}

export interface MeasuredView extends UsageView {
  records: Measured[]
}

export const KEY_OF: Record<Dimension, (record: UsageRecord) => string> = {
  bot: (record) => record.botId,
  source: (record) => record.source.kind,
  model: (record) => record.model,
}

// spelled out in full: Tailwind emits a theme colour only when it finds its whole name in the source
const SERIES_COLORS = [
  'var(--color-series-1)',
  'var(--color-series-2)',
  'var(--color-series-3)',
  'var(--color-series-4)',
]
const OTHER_MODELS_COLOR = 'var(--color-muted)' // models past the fourth share one grey

export interface Totals extends TokenCounts {
  amount: number
  tokens: number
  unpriced: number // tokens of models with no price, left out of `amount`
  runs: number
}

export interface Group extends Totals {
  key: string
  records: Measured[]
}

const NO_TOTALS: Totals = { input: 0, cached: 0, output: 0, amount: 0, tokens: 0, unpriced: 0, runs: 0 }

export function totalsOf(records: Measured[]): Totals {
  return records.reduce((sum, record) => {
    const tokens = record.input + record.output
    return {
      input: sum.input + record.input,
      cached: sum.cached + record.cached,
      output: sum.output + record.output,
      amount: sum.amount + (record.amount ?? 0),
      tokens: sum.tokens + tokens,
      unpriced: sum.unpriced + (record.amount === null ? tokens : 0),
      runs: sum.runs + record.runs,
    }
  }, NO_TOTALS)
}

/** The records per key, the largest amount first; ones with no price after, the most tokens first. */
export function groupBy(records: Measured[], keyOf: (record: Measured) => string): Group[] {
  const byKey = new Map<string, Measured[]>()
  for (const record of records) {
    const group = byKey.get(keyOf(record)) ?? []
    group.push(record)
    byKey.set(keyOf(record), group)
  }
  return [...byKey]
    .map(([key, items]) => ({ key, records: items, ...totalsOf(items) }))
    .sort((a, b) => b.amount - a.amount || b.tokens - a.tokens)
}

export const isUnpricedOnly = (totals: Totals) => totals.amount === 0 && totals.unpriced > 0

/** A colour per model with an amount, in the order the chart stacks them: the largest over the whole view first, so a model keeps its colour across ranges. */
export function modelColors(records: Measured[]): Map<string, string> {
  const priced = groupBy(
    records.filter((record) => record.amount !== null),
    KEY_OF.model,
  )
  return new Map(priced.map((group, index) => [group.key, SERIES_COLORS[index] ?? OTHER_MODELS_COLOR]))
}

/** Model groups in the order their segments stack, bottom first; models with no price last. */
export function inStackOrder(groups: Group[], colors: Map<string, string>): Group[] {
  const order = [...colors.keys()]
  const rank = (model: string) => (colors.has(model) ? order.indexOf(model) : order.length)
  return [...groups].sort((a, b) => rank(a.key) - rank(b.key))
}

export interface Segment {
  model: string
  color: string
  amount: number
  isFaded: boolean
}

/** A day's column, bottom up: the pointed-at row's amount on each model, then all the others', faded. */
export function segmentsOf(
  records: Measured[],
  colors: Map<string, string>,
  isPointed: ((record: Measured) => boolean) | null,
): Segment[] {
  const byModel = (list: Measured[], isFaded: boolean) =>
    [...colors].map(([model, color]) => ({
      model,
      color,
      isFaded,
      amount: totalsOf(list.filter((record) => record.model === model)).amount,
    }))
  if (!isPointed) return byModel(records, false)
  return [
    ...byModel(records.filter(isPointed), false),
    ...byModel(
      records.filter((record) => !isPointed(record)),
      true,
    ),
  ]
}

/** How much more (0.1) or less (-0.1) the range amounts to than the same number of days before it; null when those were not all recorded, or for today alone, which is not over. */
export function changeOf(view: MeasuredView, range: Range): number | null {
  const start = view.today - range + 1
  const before = start - range
  if (view.since === null || view.since > before || range === 1 || range * 2 > USAGE_DAYS) return null
  const inDays = (from: number, to: number) => view.records.filter((record) => record.day >= from && record.day <= to)
  const previous = totalsOf(inDays(before, start - 1)).amount
  if (!previous) return null
  return totalsOf(inDays(start, view.today)).amount / previous - 1
}

interface Source {
  name: string
  icon: IconName
  runs: (runs: number) => string // what its runs are called: turns of chat, runs of a routine, tasks
}

/** Where the bots' model calls came from, by the key the breakdown groups them under: the source's kind. */
export const SOURCES: Record<string, Source> = {
  chat: { name: strings().usage.sources.chat, icon: 'chat', runs: strings().usage.counts.turns },
  routine: { name: strings().usage.sources.routine, icon: 'clock', runs: strings().usage.counts.runs },
  bot: { name: strings().usage.sources.bot, icon: 'team', runs: strings().usage.counts.tasks },
} satisfies Record<UsageSource['kind'], Source>

export interface UsageNames {
  botOf: (id: string) => Bot
  nameOf: (dimension: Dimension, key: string) => string
}

/** Bots as the sidebar shows them; one no longer there keeps its last name and gets a look of its own. */
export function namesOf(bots: Bot[], view: UsageView): UsageNames {
  const botOf = (id: string) =>
    bots.find((bot) => bot.id === id) ?? StoredBot.parse({ id, name: view.botNames[id] || id, shape: '', color: '' })
  const nameOf = (dimension: Dimension, key: string) => {
    switch (dimension) {
      case 'bot':
        return botOf(key).name
      case 'source':
        return SOURCES[key].name
      case 'model':
        return key
      default:
        return dimension satisfies never
    }
  }
  return { botOf, nameOf }
}
