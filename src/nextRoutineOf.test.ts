import { describe, expect, it } from 'vitest'
import type { RoutineView } from '../shared/bridge'
import { nextRoutineOf } from './nextRoutineOf'

const NOW = new Date('2026-11-23T08:10:00+08:00').getTime()
const MINUTE = 60_000

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
