// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { dueRoutines, NewRoutine, Routine, routineViews, scheduleRoutines } from './routines'
import { createStore } from './store'
import type { BotBrain, HarnessState } from './types'

const daily8 = (overrides: Partial<Routine> = {}): Routine => ({
  id: 'r1',
  name: '日报',
  prompt: '写日报',
  cron: '0 8 * * *',
  timezone: 'Asia/Shanghai',
  isEnabled: true,
  ...overrides,
})

const brain = (id: string, routines: Routine[]): BotBrain => ({
  id,
  name: id,
  instructions: '',
  memories: [],
  summary: '',
  summarizedUpTo: 0,
  routines,
  flows: [],
  miniApps: [],
  skills: [],
})

const stateWith = (routines: Routine[], roster = ['chief']): HarnessState => ({
  userFacts: [],
  bots: { chief: brain('chief', routines) },
  roster,
  pending: [],
  onboardedAt: null,
})

// 08:00 in Shanghai is 00:00 UTC
const at = (iso: string) => new Date(iso)

it('runs a routine whose time falls inside the tick, in its own timezone', () => {
  const due = dueRoutines(stateWith([daily8()]), at('2026-11-18T23:59:40Z'), at('2026-11-19T00:00:10Z'))
  expect(due.map(({ botId, routine }) => [botId, routine.id])).toEqual([['chief', 'r1']])
})

it('does not run a routine before its time', () => {
  expect(dueRoutines(stateWith([daily8()]), at('2026-11-18T23:59:00Z'), at('2026-11-18T23:59:30Z'))).toEqual([])
})

it('runs a routine once after a long gap such as the laptop sleeping for days', () => {
  expect(dueRoutines(stateWith([daily8()]), at('2026-11-10T00:00:00Z'), at('2026-11-19T00:00:00Z'))).toHaveLength(1)
})

it('skips paused routines and bots that are no longer in the sidebar', () => {
  const from = at('2026-11-18T23:59:40Z')
  const to = at('2026-11-19T00:00:10Z')
  expect(dueRoutines(stateWith([daily8({ isEnabled: false })]), from, to)).toEqual([])
  expect(dueRoutines(stateWith([daily8()], []), from, to)).toEqual([])
})

it('shows the next run while enabled and none while paused', () => {
  const now = at('2026-11-18T12:00:00Z')
  const [enabled, paused] = routineViews([daily8(), daily8({ id: 'r2', isEnabled: false })], now)
  expect(enabled.nextRunAt).toBe(at('2026-11-19T00:00:00Z').getTime())
  expect(paused.nextRunAt).toBeNull()
})

it("accepts a five-part cron and fills in the app's timezone, not the computer's", () => {
  const parsed = NewRoutine.parse({ name: '日报', prompt: '写日报', cron: ' 0 8 * * 1-5 ' })
  expect(parsed.cron).toBe('0 8 * * 1-5')
  expect(parsed.timezone).toBe('Asia/Shanghai')
})

it('rejects schedules that would run every second, never run, or name an unknown timezone', () => {
  const input = { name: '日报', prompt: '写日报' }
  expect(NewRoutine.safeParse({ ...input, cron: '* * * * * *' }).success).toBe(false)
  expect(NewRoutine.safeParse({ ...input, cron: '0 0 30 2 *' }).success).toBe(false)
  expect(NewRoutine.safeParse({ ...input, cron: 'every morning' }).success).toBe(false)
  expect(NewRoutine.safeParse({ ...input, cron: '0 8 * * *', timezone: 'Mars/Base' }).success).toBe(false)
})

it('keeps a stored routine whose schedule no longer parses, and never runs it', () => {
  const broken = Routine.parse(daily8({ cron: 'not a cron' }))
  expect(routineViews([broken])[0].nextRunAt).toBeNull()
  expect(dueRoutines(stateWith([broken]), at('2026-11-10T00:00:00Z'), at('2026-11-19T00:00:00Z'))).toEqual([])
})

afterEach(() => {
  vi.useRealTimers()
})

function scheduledEveryMinute(start: string) {
  vi.useFakeTimers({ now: at(start) })
  const store = createStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'routines-')), 'nengyongbot.db'))
  store.syncRoster([{ id: 'chief', name: 'CEO' }])
  store.update((s) => ({
    ...s,
    bots: { ...s.bots, chief: { ...s.bots.chief, routines: [daily8({ cron: '* * * * *', timezone: 'UTC' })] } },
  }))
  const run = vi.fn()
  const emit = vi.fn()
  scheduleRoutines(store, emit, run)
  return { run, emit }
}

it('starts a routine when its time comes and refreshes its next run on the panel', async () => {
  const { run, emit } = scheduledEveryMinute('2026-11-18T23:59:50Z')
  await vi.advanceTimersByTimeAsync(30_000) // 00:00:20, the 00:00 run starts
  expect(run).toHaveBeenCalledWith('chief', 'r1')
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'routines', botId: 'chief' }))
})

it('does not run a time twice when the clock is set back', async () => {
  const { run } = scheduledEveryMinute('2026-11-19T00:00:50Z')
  await vi.advanceTimersByTimeAsync(30_000) // 00:01:20, the 00:01 run starts
  vi.setSystemTime(at('2026-11-19T00:00:20Z'))
  await vi.advanceTimersByTimeAsync(60_000) // the clock passes 00:01 a second time
  expect(run).toHaveBeenCalledTimes(1)
})
