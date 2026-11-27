import { describe, expect, it } from 'vitest'
import { dateTimeLabel, timeLabel, whenLabel } from './timeLabel'

const now = Date.parse('2026-11-18T12:00:00+08:00')
const NOW = new Date('2026-11-23T08:10:00+08:00').getTime()
const MINUTE = 60_000

it('says today or yesterday for the last two days, and the date further back', () => {
  expect(timeLabel(now - 60_000, now)).toBe('今天 11:59')
  expect(timeLabel(now - 86_400_000, now)).toBe('昨天 12:00')
  expect(timeLabel(Date.parse('2026-11-01T09:05:00+08:00'), now)).toBe('11月1日 9:05')
})

it('always gives the date and time, for something looked at days later', () => {
  expect(dateTimeLabel(now)).toBe('11月18日 12:00')
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
