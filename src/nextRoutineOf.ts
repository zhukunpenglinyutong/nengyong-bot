import type { RoutineView } from '../shared/bridge'

/** The routine that runs next, if any is going to. */
export function nextRoutineOf(routines: RoutineView[]): (RoutineView & { nextRunAt: number }) | undefined {
  return routines.reduce<(RoutineView & { nextRunAt: number }) | undefined>((soonest, routine) => {
    const { nextRunAt } = routine
    if (nextRunAt === null) return soonest
    return soonest && soonest.nextRunAt <= nextRunAt ? soonest : { ...routine, nextRunAt }
  }, undefined)
}
