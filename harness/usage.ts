import type { LanguageModelUsage } from 'ai'
import { calendarDay, clockHour } from '../shared/timezone'
import {
  type ModelPrice,
  priceRecords,
  type TokenCounts,
  USAGE_DAYS,
  type UsageRecord,
  type UsageSource,
  type UsageView,
} from '../shared/usage'
import type { Store } from './store'
import type { UsageRun } from './types'

const DAY_MS = 86_400_000

type Unpriced = Omit<UsageRecord, 'cost'>

export function usageOf(usage: LanguageModelUsage): TokenCounts | null {
  if (usage.inputTokens === undefined) return null
  return {
    input: usage.inputTokens,
    cached: usage.inputTokenDetails.cacheReadTokens ?? 0,
    output: usage.outputTokens ?? 0,
  }
}

/** The model calls of the last USAGE_DAYS days, summed per hour, bot, source and model, and priced as they are read. */
export function usageView(store: Store, priceOf: (model: string) => ModelPrice, now = Date.now()): UsageView {
  const today = calendarDay(now)
  const firstDay = today - USAGE_DAYS + 1
  // a day more than needed: the cut that counts is the calendar day in TIMEZONE, below
  const runs = store.usageRuns(now - (USAGE_DAYS + 1) * DAY_MS).filter((run) => calendarDay(run.at) >= firstDay)
  const { records, prices } = priceRecords(sumPerHour(store, runs), priceOf)
  const firstAt = store.firstUsageAt()
  return {
    today,
    hour: clockHour(now),
    since: firstAt === null ? null : calendarDay(firstAt),
    records,
    prices,
    botNames: botNamesOf(store, records),
  }
}

function sumPerHour(store: Store, runs: UsageRun[]): Unpriced[] {
  const answered = answeredBy(runs)
  const records = new Map<string, Unpriced>()
  for (const run of runs) {
    const day = calendarDay(run.at)
    const hour = clockHour(run.at)
    const source = sourceOf(store, run)
    const key = JSON.stringify([day, hour, run.botId, source, run.model])
    const known = records.get(key)
    const counts = { input: run.input, cached: run.cached, output: run.output }
    const isAnswer = answered.get(run.runId) === run
    records.set(
      key,
      known
        ? {
            ...known,
            input: known.input + counts.input,
            cached: known.cached + counts.cached,
            output: known.output + counts.output,
            runs: known.runs + (isAnswer ? 1 : 0),
          }
        : { day, hour, botId: run.botId, source, model: run.model, ...counts, runs: isAnswer ? 1 : 0 },
    )
  }
  return [...records.values()]
}

/** The model that answered each run: the last one in, after the main model summed up the chat or stood in for its model. */
function answeredBy(runs: UsageRun[]): Map<string, UsageRun> {
  const answered = new Map<string, UsageRun>()
  for (const run of runs) {
    const known = answered.get(run.runId)
    if (!known || run.at >= known.at) answered.set(run.runId, run)
  }
  return answered
}

function sourceOf(store: Store, run: UsageRun): UsageSource {
  if (run.transcriptId === run.botId) return { kind: 'chat' }
  const task = store.task(run.transcriptId)
  if (task?.source.kind === 'routine') return { kind: 'routine', name: task.title }
  if (task && task.requestedBy !== task.botId) return { kind: 'bot', from: task.requestedBy }
  return { kind: 'chat' } // a task the bot started in its chat, for the user
}

// a bot removed from the sidebar keeps its brain, and with it its name
function botNamesOf(store: Store, records: UsageRecord[]): Record<string, string> {
  const ids = new Set(
    records.flatMap((record) => [record.botId, ...(record.source.kind === 'bot' ? [record.source.from] : [])]),
  )
  return Object.fromEntries([...ids].map((id) => [id, store.get().bots[id]?.name || id]))
}
