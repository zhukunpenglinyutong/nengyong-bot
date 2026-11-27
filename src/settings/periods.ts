import type { UsageRecord, UsageView } from '../../shared/usage'
import { dayLabel, weekdayLabel } from './usageFormat'
import { type Measured, type Range, type Totals, totalsOf } from './usageStats'
import { strings } from '../../shared/strings'

const WEEK_DAYS = 7
const DAY_HOURS = 24
const HOURS_PER_LABEL = 6

/** What the chart's columns and a row's spark bars stand for: the days of the range, or the hours of today. */
export interface Periods {
  span: string // the whole range: today, the last 7 days
  each: string // per day, per hour
  average: string // the daily or hourly average
  list: Period[]
  idOf: (record: UsageRecord) => number
}

export interface Period {
  id: number // calendarDay; for today, the hour
  isCounted: boolean // begun and recorded: counts toward the average
  isNow: boolean
  axisLabel: string | null // under its column, when it gets one
  name: string // where it is the busiest
  heading: string // above its tip
  emptyNote: string // in its tip, when it has no usage
}

export function periodsOf(view: UsageView, range: Range): Periods {
  return range === 1 ? hoursOf(view) : daysOf(view, range)
}

/** The records of each period, and what they add up to. */
export function byPeriod(
  periods: Periods,
  records: Measured[],
): { period: Period; records: Measured[]; totals: Totals }[] {
  return periods.list.map((period) => {
    const ofPeriod = records.filter((record) => periods.idOf(record) === period.id)
    return { period, records: ofPeriod, totals: totalsOf(ofPeriod) }
  })
}

function hoursOf(view: UsageView): Periods {
  return {
    span: strings().usage.periods.todaySpan,
    each: strings().usage.periods.perHour,
    average: strings().usage.periods.hourlyAverage,
    idOf: (record) => record.hour,
    list: Array.from({ length: DAY_HOURS }, (_, hour) => ({
      id: hour,
      isCounted: hour <= view.hour,
      isNow: hour === view.hour,
      axisLabel: hour % HOURS_PER_LABEL === 0 ? strings().usage.periods.hour(hour) : null,
      name: strings().usage.periods.hour(hour),
      heading: strings().usage.periods.hourHeading(hour),
      emptyNote: hour > view.hour ? strings().usage.periods.notYet : strings().usage.periods.noUsageHour,
    })),
  }
}

function daysOf(view: UsageView, range: Range): Periods {
  const since = view.since ?? view.today
  const isWeek = range <= WEEK_DAYS
  return {
    span: strings().usage.periods.lastDays(range),
    each: strings().usage.periods.perDay,
    average: strings().usage.periods.dailyAverage,
    idOf: (record) => record.day,
    list: Array.from({ length: range }, (_, index) => {
      const day = view.today - range + 1 + index
      const isToday = day === view.today
      const isLabelled = isWeek || (view.today - day) % WEEK_DAYS === 0
      const today = strings().usage.periods.today
      return {
        id: day,
        isCounted: day >= since,
        isNow: isToday,
        axisLabel: !isLabelled ? null : isToday ? today : isWeek ? weekdayLabel(day) : dayLabel(day),
        name: isToday ? today : dayLabel(day),
        heading: `${dayLabel(day)} ${isToday ? today : weekdayLabel(day)}`,
        emptyNote: day < since ? strings().usage.periods.notRecorded : strings().usage.periods.noUsageDay,
      }
    }),
  }
}
