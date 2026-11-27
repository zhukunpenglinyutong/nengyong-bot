import { z } from 'zod'
import { NewBot } from '../shared/bot'
import { type Entry, TaskStatus } from '../shared/bridge'
import { Duty, dutyOf } from '../shared/duty'
import { Flow } from '../shared/flow'
import { listOf } from '../shared/listOf'
import { MiniApp } from '../shared/miniApp'
import { ModelChoice } from '../shared/modelServices'
import { Skill } from '../shared/skill'
import type { TokenCounts } from '../shared/usage'
import { Routine } from './routines'

/** Harness-internal state, saved as one JSON value in the database. What crosses to the renderer lives in shared/bridge.ts. */

// the stored JSON can be edited by hand, so it is read leniently: a missing or null field gets its default, a bad list
// item is dropped, unknown fields are ignored. Only a wrongly shaped file fails, and is then set aside by the store.
const orDefault = <T>(schema: z.ZodType<T>, fallback: T) => z.preprocess((value) => value ?? fallback, schema)

export const Fact = z.object({
  id: orDefault(z.string(), ''), // 'u…' = about the user (shared by all bots), 'm…' = one bot's own memory
  text: z.string(),
  at: orDefault(z.number(), 0),
})
export type Fact = z.infer<typeof Fact>

// a bot saved before duties had one paragraph, `instructions`: it becomes the purpose of a duty not yet agreed on
const withDuty = (raw: unknown) =>
  typeof raw === 'object' && raw !== null && !('duty' in raw)
    ? { ...raw, duty: dutyOf('instructions' in raw && typeof raw.instructions === 'string' ? raw.instructions : '') }
    : raw

/** What the harness knows about a bot. Look (shape/colour) and sidebar placement stay in the renderer. */
const BotBrainFields = z.object({
  id: z.string(),
  name: orDefault(z.string(), ''),
  duty: Duty,
  memories: orDefault(listOf(Fact), []),
  summary: orDefault(z.string(), ''), // compressed older conversation
  summarizedUpTo: orDefault(z.number(), 0), // seq of the last entry folded into `summary`
  routines: orDefault(listOf(Routine), []),
  flows: orDefault(listOf(Flow), []),
  miniApps: orDefault(listOf(MiniApp), []), // their pages and data are files in the library: see miniApps.ts
  skills: orDefault(listOf(Skill), []), // their files are in the data dir's skills/<bot id>/: see skills.ts
  model: ModelChoice.optional().catch(undefined), // what its chat runs on, set when the user asked in the chat; absent: the main model
  taskModel: ModelChoice.optional().catch(undefined), // what its tasks run on when neither they nor their flow name one; absent: the main model
})
export const BotBrain = z.preprocess(withDuty, BotBrainFields)
export type BotBrain = z.infer<typeof BotBrainFields>

export const HarnessState = z.object({
  userFacts: orDefault(listOf(Fact), []),
  bots: orDefault(z.record(z.string(), BotBrain), {}),
  roster: orDefault(listOf(z.string()), []), // ids of bots that currently exist in the sidebar
  pending: orDefault(listOf(NewBot), []), // created by a bot, not yet confirmed by the sidebar
  onboardedAt: orDefault(z.number().nullable(), null), // when the onboarding hired the first team; it runs once
})
export type HarnessState = z.infer<typeof HarnessState>

export const Task = z.object({
  id: z.string(),
  botId: z.string(),
  requestedBy: z.string(),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('chat') }),
    z.object({ kind: z.literal('routine'), routineId: z.string() }),
  ]),
  title: z.string(),
  status: TaskStatus,
  statusText: orDefault(z.string(), ''),
  createdAt: z.number(),
  endedAt: z.number().optional(),
  failureReason: z.string().optional(),
  flowId: z.string().optional(), // the flow of its bot it follows
  miniAppId: z.string().optional(), // the mini app of its bot it changes
  model: ModelChoice.optional().catch(undefined), // its own, else its flow's, else its bot's task model, when it started; undefined: the main model
})
export type Task = z.infer<typeof Task>

type WithoutStamp<T> = T extends unknown ? Omit<T, 'seq' | 'at'> : never // distributes over the union
export type EntryInput = WithoutStamp<Entry>

/** The model calls of one run (a chat turn or a task) on one model, summed: a row of the store's usageRuns. */
export const UsageRun = z.object({
  at: z.number(), // its first call
  runId: z.string(),
  transcriptId: z.string(),
  botId: z.string(),
  model: z.string(),
  input: z.number(),
  cached: z.number(),
  output: z.number(),
})
export type UsageRun = z.infer<typeof UsageRun>

/** One model call as recorded: the run it belongs to (a chat turn's own id, a task's id), and what the API counted. */
export interface UsageCall extends TokenCounts {
  at: number
  runId: string
  transcriptId: string
  botId: string
  model: string
}
