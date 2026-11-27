import { expect, it } from 'vitest'
import type { TaskView } from '../../shared/bridge'
import {
  clockOf,
  type DeskState,
  deskStateOf,
  furnitureOf,
  isWorking,
  nextUnlockOf,
  nowLineOf,
  plantStageOf,
  pokeLineOf,
  SLACKS,
} from './deskState'

const NOW = new Date('2026-11-21T15:30:00+08:00').getTime()
const MINUTE = 60_000

const task = (fields: Partial<TaskView>): TaskView => ({
  id: 't1',
  title: '整理周报',
  status: 'running',
  statusText: '',
  createdAt: NOW - 5 * MINUTE,
  endedAt: null,
  requestedBy: null,
  isRoutine: false,
  ...fields,
})

const idle = { botId: 'b1', activity: 'idle' as const, tasks: [], isCaught: false, now: NOW }

it('replies before anything else, even with a task running', () => {
  expect(deskStateOf({ ...idle, activity: 'thinking', tasks: [task({})] })).toEqual({ kind: 'replying' })
})

it('works on an unfinished task when it is not replying', () => {
  const running = task({ status: 'waiting' })
  expect(deskStateOf({ ...idle, tasks: [running] })).toEqual({ kind: 'task', task: running })
})

it('owns up to a task that failed in the last half hour, then lets it go', () => {
  const failed = task({ status: 'failed', endedAt: NOW - 10 * MINUTE })
  const older = task({ id: 't0', status: 'done', endedAt: NOW - 20 * MINUTE })
  expect(deskStateOf({ ...idle, tasks: [older, failed] })).toEqual({ kind: 'failed', task: failed })
  expect(deskStateOf({ ...idle, tasks: [failed], now: NOW + 30 * MINUTE }).kind).not.toBe('failed')
})

it('does not dwell on a failure once a later task came back done', () => {
  const failed = task({ status: 'failed', endedAt: NOW - 10 * MINUTE })
  const done = task({ id: 't2', status: 'done', endedAt: NOW - 2 * MINUTE })
  expect(SLACKS).toContain(deskStateOf({ ...idle, tasks: [failed, done] }).kind)
})

it('slacks off between jobs, one way for ten minutes, and bots do not all slack the same way', () => {
  const at = (now: number, botId = 'b1') => deskStateOf({ ...idle, botId, now }).kind
  expect(at(NOW)).toBe(at(NOW + 9 * MINUTE - (NOW % (10 * MINUTE))))
  expect(new Set(SLACKS.map((_, slot) => at(NOW + slot * 10 * MINUTE)))).toEqual(new Set(SLACKS))
  expect(at(NOW, 'b1')).not.toBe(at(NOW, 'b2'))
})

it('pretends to work when caught slacking, but a real job still comes first', () => {
  expect(deskStateOf({ ...idle, isCaught: true })).toEqual({ kind: 'caught' })
  expect(deskStateOf({ ...idle, isCaught: true, tasks: [task({})] }).kind).toBe('task')
})

it('says what it is running and for how long', () => {
  expect(nowLineOf({ kind: 'task', task: task({}) }, NOW)).toEqual({
    text: '在跑「整理周报」',
    aside: '· 5 分钟',
  })
  expect(nowLineOf({ kind: 'game' }, NOW)).toEqual({ text: '摸鱼中', aside: '在打王者荣耀' })
})

it('makes a different excuse each time it is caught slacking', () => {
  const facts = { messages: 940, flowCount: 6, level: 45 }
  const window: DeskState = { kind: 'window' }
  expect([0, 1, 2, 3].map((pokes) => pokeLineOf(window, facts, pokes))).toEqual([
    '在…在看资料呢',
    '没摸鱼！在回想咱俩聊过的 940 次',
    '在研究怎么升到 Lv.60，换上地毯和奖杯',
    '在复习书架上那 6 套流程',
  ])
})

it('adds a piece of furniture at each tier and names the next one', () => {
  expect(furnitureOf(3)).toEqual({
    hasMonitor: false,
    hasLamp: false,
    hasTrophy: false,
    hasNeon: false,
    isRainbow: false,
  })
  expect(furnitureOf(45)).toEqual({
    hasMonitor: true,
    hasLamp: true,
    hasTrophy: false,
    hasNeon: false,
    isRainbow: false,
  })
  expect(nextUnlockOf(3)).toEqual({ level: 10, name: '显示器和靠背椅' })
  expect(nextUnlockOf(99)).toBeUndefined()
})

it('grows the plant at a week, a month and a hundred days', () => {
  expect([1, 7, 29, 30, 100].map(plantStageOf)).toEqual([0, 1, 1, 2, 3])
})

it('reads the clock and the sky in Beijing time', () => {
  expect(clockOf(NOW)).toEqual({ hour: 15, minute: 30, timeOfDay: 'day' })
  expect(clockOf(new Date('2026-11-21T18:10:00+08:00').getTime()).timeOfDay).toBe('dusk')
  expect(clockOf(new Date('2026-11-21T02:00:00+08:00').getTime()).timeOfDay).toBe('night')
})

it('counts replying and running a task as working, and nothing else', () => {
  expect(isWorking({ kind: 'replying' })).toBe(true)
  expect(isWorking({ kind: 'task', task: task({}) })).toBe(true)
  expect(isWorking({ kind: 'replied' })).toBe(false)
  expect(isWorking({ kind: 'failed', task: task({ status: 'failed' }) })).toBe(false)
})
