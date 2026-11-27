import { locale } from '../shared/language'
import { calendarDay, clockLabel, TIMEZONE } from '../shared/timezone'
import { strings } from '../shared/strings'

export function timeLabel(at: number, now = Date.now()): string {
  const diff = calendarDay(now) - calendarDay(at)
  if (diff === 0) return strings().app.time.today(clockLabel(at))
  if (diff === 1) return strings().app.time.yesterday(clockLabel(at))
  return dateTimeLabel(at)
}

/** 11月1日 9:05, never 昨天: for an image that is looked at days later. */
export const dateTimeLabel = (at: number) => `${dateLabel(at)} ${clockLabel(at)}`

export const dateLabel = (at: number) =>
  new Date(at).toLocaleDateString(locale(), { timeZone: TIMEZONE, month: 'long', day: 'numeric' })

/** 8:05 today, 昨天 / 明天 8:05 a day off, the date further away. */
export function whenLabel(at: number, now: number): string {
  const days = calendarDay(at) - calendarDay(now)
  if (days === 0) return clockLabel(at)
  if (days === 1) return strings().app.time.tomorrow(clockLabel(at))
  if (days === -1) return strings().app.time.yesterday(clockLabel(at))
  return dateLabel(at)
}
