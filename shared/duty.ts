import { z } from 'zod'

export const MAX_OBJECTIVES = 3
export const MAX_KEY_RESULTS = 4

/** How far a key result has come, as its bot last reported it: in its own words, and as a share of the way there. */
export const Progress = z.object({
  text: z.string(), // 本周 1/2, 上周 31%
  ratio: z.number().min(0).max(1),
  verdict: z.enum(['met', 'onTrack', 'behind']),
  at: z.number(),
})
export type Progress = z.infer<typeof Progress>

/** One check that an objective is reached: a number in a time window, and where that number comes from. */
export const KeyResult = z.object({
  text: z.string(), // 每周 2 篇成稿交用户审
  window: z.string(), // 每周, 每篇, 到 12/31
  source: z.string(), // 我自己数, 用户周一发截图
  progress: Progress.optional(),
})
export type KeyResult = z.infer<typeof KeyResult>

/** A result the bot is there to bring about, and the key results that tell when it has. */
export const Objective = z.object({ id: z.string(), name: z.string(), keyResults: z.array(KeyResult) })
export type Objective = z.infer<typeof Objective>

/** What a duty card proposes: why the bot is there, its objectives, and what it leaves to others. */
export const DutyPlan = z.object({
  purpose: z.string(),
  objectives: z.array(Objective),
  outOfScope: z.array(z.string()),
})
export type DutyPlan = z.infer<typeof DutyPlan>

/** A bot's duty, the OKR it works and is checked by. Changed only by the user agreeing to a card the bot shows. */
export const Duty = DutyPlan.extend({
  version: z.number(), // 0: never agreed, only a purpose to start from
  reviewRoutineId: z.string().optional(), // its weekly review, once the user wanted one; the routine's switch turns it on and off
})
export type Duty = z.infer<typeof Duty>

export const dutyOf = (purpose: string): Duty => ({ purpose, objectives: [], outOfScope: [], version: 0 })

/** What propose_duty records, and the chat shows as a card: the duty it would become, what changed and why. */
export const DutyOffer = z.object({
  offer: z.string(),
  botId: z.string(), // whose duty: the main bot may propose another bot's
  baseVersion: z.number(), // once another version is agreed, the card is void
  plan: DutyPlan,
  changes: z.array(z.string()), // empty for a first version
  isReviewOn: z.boolean(), // as agreed in the chat; the card lets the user switch it before agreeing
})
export type DutyOffer = z.infer<typeof DutyOffer>
