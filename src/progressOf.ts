import { activityLabel } from './activityLabel'
import type { Thread } from './harnessState'

/** What a bot is doing in its chat while a turn runs, and since when; undefined while it is not replying. */
export function progressOf({ progress }: Thread) {
  return progress && { label: activityLabel(progress.activity, progress.draw), since: progress.since }
}
