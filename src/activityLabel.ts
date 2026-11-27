import type { Activity } from '../shared/bridge'
import { strings } from '../shared/strings'

const words = strings().app.activity
// One phrase is drawn per turn so the label does not flicker.
const TOOL_LABELS: Record<string, string> = {
  remember: words.noting,
  forget: words.noting,
  propose_duty: words.noting,
  report_progress: words.noting,
  update_my_name: words.renaming,
  search_history: words.lookingBack,
  create_bot: words.creatingBot,
  start_task: words.startingTask,
  read_history: words.lookingBack,
}

const pick = (list: string[], draw: number) =>
  list[Math.min(list.length - 1, Math.max(0, Math.floor(draw * list.length)))]

/** Activity label rules: a per-tool phrase, otherwise a generic one. */
export function activityLabel(activity: Activity | null, draw: number): string {
  if (!activity) return pick(words.working, draw)
  if (activity.kind === 'typing') return words.typing
  if (activity.kind === 'thinking') return pick(words.thinking, draw)
  return TOOL_LABELS[activity.tool] ?? pick(words.working, draw)
}
