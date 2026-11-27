import { describe, expect, it } from 'vitest'
import type { RoutineView, TaskView } from '../../shared/bridge'
import { EMPTY_THREAD, type Thread } from '../harnessState'
import { botStatusOf, dotKindOf, nextRoutineOf, statusLineOf, whenLabel } from './botStatus'

const NOW = new Date('2026-11-23T08:10:00+08:00').getTime()
const MINUTE = 60_000

function task(id: string, status: TaskView['status'], minutesAgo: number, endedMinutesAgo?: number): TaskView {
  return {
    id,
    title: id,
    status,
    statusText: '',
    createdAt: NOW - minutesAgo * MINUTE,
    endedAt: endedMinutesAgo === undefined ? null : NOW - endedMinutesAgo * MINUTE,
    requestedBy: null,
    isRoutine: false,
  }
}

const withTasks = (...tasks: TaskView[]): Thread => ({ ...EMPTY_THREAD, panel: { ...EMPTY_THREAD.panel, tasks } })
const replying: Thread = {
  ...EMPTY_THREAD,
  progress: { runId: 'r1', activity: { kind: 'thinking' }, since: NOW - 2 * MINUTE, draw: 0 },
}

describe('botStatusOf', () => {
  it('is idle with nothing running and nothing failed', () => {
    expect(botStatusOf(withTasks(task('日报', 'done', 30, 20)), 0, false)).toEqual({ kind: 'idle' })
  })

  it('flags a last task that failed after the user last looked', () => {
    const failed = task('巡检', 'failed', 10, 5)
    expect(botStatusOf(withTasks(failed), NOW - 6 * MINUTE, false)).toEqual({ kind: 'failed', task: failed })
  })

  it('does not flag a failure the user has seen since', () => {
    expect(botStatusOf(withTasks(task('巡检', 'failed', 10, 5)), NOW - 4 * MINUTE, false)).toEqual({ kind: 'idle' })
  })

  it('does not flag a failure while its chat is open', () => {
    expect(botStatusOf(withTasks(task('巡检', 'failed', 10, 5)), 0, true)).toEqual({ kind: 'idle' })
  })

  it('drops the flag once a later task finishes well', () => {
    const tasks = [task('巡检', 'failed', 70, 65), task('巡检 2', 'done', 10, 5)]
    expect(botStatusOf(withTasks(...tasks), 0, false)).toEqual({ kind: 'idle' })
  })

  it('puts a failure before a reply in progress', () => {
    const failed = task('巡检', 'failed', 10, 5)
    expect(botStatusOf({ ...replying, panel: withTasks(failed).panel }, 0, false).kind).toBe('failed')
  })

  it('puts a reply in progress before a running task', () => {
    const status = botStatusOf({ ...replying, panel: withTasks(task('巡检', 'running', 3)).panel }, 0, false)
    expect(status).toEqual({ kind: 'replying', label: '想一想', since: NOW - 2 * MINUTE })
  })

  it('counts every unfinished task when one runs', () => {
    const running = task('审查 #412', 'running', 3)
    expect(botStatusOf(withTasks(task('审查 #413', 'waiting', 3), running), 0, false)).toEqual({
      kind: 'working',
      task: running,
      count: 2,
    })
  })

  it('is waiting when its only tasks are queued', () => {
    const queued = task('日报', 'waiting', 1)
    expect(botStatusOf(withTasks(queued), 0, false)).toEqual({ kind: 'waiting', task: queued })
  })
})

describe('dotKindOf', () => {
  it('shows replying and running a task the same way', () => {
    expect(dotKindOf({ kind: 'replying', label: '想一想', since: NOW })).toBe('busy')
    expect(dotKindOf({ kind: 'working', task: task('巡检', 'running', 1), count: 1 })).toBe('busy')
  })

  it('shows nothing while idle', () => {
    expect(dotKindOf({ kind: 'idle' })).toBeNull()
  })
})

describe('statusLineOf', () => {
  it('says which task failed and when', () => {
    expect(statusLineOf({ kind: 'failed', task: task('巡检', 'failed', 10, 6) }, NOW)).toBe('「巡检」没跑成 · 8:04')
  })

  it('says how long a reply has taken', () => {
    expect(statusLineOf({ kind: 'replying', label: '翻翻旧记录', since: NOW - 2 * MINUTE }, NOW)).toBe(
      '翻翻旧记录 · 2 分钟',
    )
  })

  it('names the running task, how many there are and how long it has run', () => {
    expect(statusLineOf({ kind: 'working', task: task('审查 #412', 'running', 3), count: 2 }, NOW)).toBe(
      '在跑「审查 #412」 等 2 个 · 3 分钟',
    )
  })

  it('leaves the elapsed time out in the first minute', () => {
    expect(statusLineOf({ kind: 'working', task: task('巡检', 'running', 0), count: 1 }, NOW)).toBe('在跑「巡检」')
  })

  it('keeps the last reply while idle', () => {
    expect(statusLineOf({ kind: 'idle' }, NOW)).toBeNull()
  })
})

describe('nextRoutineOf', () => {
  const routine = (id: string, nextRunAt: number | null, isEnabled = true): RoutineView => ({
    id,
    name: id,
    timezone: 'Asia/Shanghai',
    isEnabled,
    nextRunAt,
  })

  it('picks the enabled routine that runs soonest', () => {
    const routines = [
      routine('日报', NOW + 60 * MINUTE),
      routine('巡检', NOW + 5 * MINUTE),
      routine('停了', null, false),
    ]
    expect(nextRoutineOf(routines)?.id).toBe('巡检')
  })

  it('finds none when no routine will run again', () => {
    expect(nextRoutineOf([routine('一次性', null)])).toBeUndefined()
  })
})

describe('whenLabel', () => {
  it('gives only the time today', () => {
    expect(whenLabel(NOW + 50 * MINUTE, NOW)).toBe('9:00')
  })

  it('says 明天 and 昨天 a day off', () => {
    expect(whenLabel(NOW + 24 * 60 * MINUTE, NOW)).toBe('明天 8:10')
    expect(whenLabel(NOW - 24 * 60 * MINUTE, NOW)).toBe('昨天 8:10')
  })

  it('gives the date further away', () => {
    expect(whenLabel(NOW + 3 * 24 * 60 * MINUTE, NOW)).toBe('11月26日')
  })
})
