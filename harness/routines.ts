import { Cron } from 'croner'
import { z } from 'zod'
import type { HarnessEvent, RoutineView } from '../shared/bridge'
import { strings } from '../shared/strings'
import { ModelChoice } from '../shared/modelServices'
import { TIMEZONE } from '../shared/timezone'
import type { Store } from './store'
import { MODEL_INPUT, OptionalId } from './toolInputs'
import type { HarnessState } from './types'

const TICK_MS = 30_000

interface Schedule {
  cron: string
  timezone: string
}

function nextRun(schedule: Schedule, after: Date): Date | null {
  try {
    return new Cron(schedule.cron, { mode: '5-part', timezone: schedule.timezone }).nextRun(after)
  } catch {
    return null
  }
}

const isRunnable = (schedule: Schedule) => nextRun(schedule, new Date()) !== null

const SCHEDULE_ERROR = {
  message:
    'cron 必须是 5 段（分 时 日 月 周）并且将来会到点，例如 "0 8 * * 1-5"；timezone 必须是 IANA 时区名，例如 "Asia/Shanghai"',
}

export const Routine = z.object({
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
  cron: z.string(),
  timezone: z.string(),
  isEnabled: z.boolean(),
  flowId: z.string().optional(), // the flow of its bot each run follows
  model: ModelChoice.optional().catch(undefined), // what each run is set to; undefined: its flow's model, else its bot's task model, else the main one
})
export type Routine = z.infer<typeof Routine>

export const NewRoutine = z
  .object({
    name: z.string().trim().min(1).max(40).describe('显示在面板上的短名字，如“GitHub 五仓库日报”'),
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe('到点时要做的事，写成给后台任务的完整说明：目标、约束、产出形式'),
    cron: z
      .string()
      .trim()
      .describe('5 段 cron：分 时 日 月 周。每天 8 点 "0 8 * * *"；工作日 8-23 点每 30 分钟 "*/30 8-23 * * 1-5"'),
    timezone: z.string().trim().default(TIMEZONE).describe(`cron 按哪个 IANA 时区算，默认 ${TIMEZONE}`),
    flowId: OptionalId.describe('每次按你的哪个流程做（流程 id）；不按流程就不填'),
    model: MODEL_INPUT,
  })
  .refine(isRunnable, SCHEDULE_ERROR)

export function dueRoutines(state: HarnessState, from: Date, to: Date): { botId: string; routine: Routine }[] {
  return state.roster.flatMap((botId) =>
    (state.bots[botId]?.routines ?? []).flatMap((routine) => {
      const next = routine.isEnabled ? nextRun(routine, from) : null
      return next && next <= to ? [{ botId, routine }] : []
    }),
  )
}

export function routineViews(routines: Routine[], now = new Date()): RoutineView[] {
  return routines.map((routine) => ({
    id: routine.id,
    name: routine.name,
    timezone: routine.timezone,
    isEnabled: routine.isEnabled,
    nextRunAt: routine.isEnabled ? (nextRun(routine, now)?.getTime() ?? null) : null,
    flowId: routine.flowId,
    model: routine.model?.model,
  }))
}

export function updateRoutines(
  store: Store,
  emit: (event: HarnessEvent) => void,
  botId: string,
  change: (routines: Routine[]) => Routine[],
) {
  const bot = store.get().bots[botId]
  if (!bot) throw new Error(strings().harness.unknownBot(botId))
  const routines = change(bot.routines)
  store.updateBot(botId, { routines })
  emit({ kind: 'routines', botId, routines: routineViews(routines) })
}

/** Changes or (with null) deletes the routine with this id, saying so when the bot has none. */
export function patchRoutine(
  store: Store,
  emit: (event: HarnessEvent) => void,
  botId: string,
  routineId: string,
  patch: Partial<Omit<Routine, 'id'>> | null,
) {
  updateRoutines(store, emit, botId, (routines) => {
    if (!routines.some((routine) => routine.id === routineId))
      throw new Error(strings().harness.routineNotFound(routineId))
    if (!patch) return routines.filter((routine) => routine.id !== routineId)
    return routines.map((routine) => (routine.id === routineId ? { ...routine, ...patch } : routine))
  })
}

export function scheduleRoutines(
  store: Store,
  emit: (event: HarnessEvent) => void,
  run: (botId: string, routineId: string) => void,
) {
  let last = new Date()
  setInterval(() => {
    const now = new Date()
    for (const { botId, routine } of dueRoutines(store.get(), last, now)) {
      try {
        run(botId, routine.id)
      } catch (error) {
        console.error(`routine ${routine.id} failed to start:`, error)
      }
      emit({ kind: 'routines', botId, routines: routineViews(store.get().bots[botId].routines, now) })
    }
    if (now > last) last = now
  }, TICK_MS)
}
