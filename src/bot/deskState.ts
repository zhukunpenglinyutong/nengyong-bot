import { isUnfinished, type TaskView } from '../../shared/bridge'
import { clockLabel } from '../../shared/timezone'
import { TIERS } from '../../shared/trust'
import { elapsedLabel } from '../elapsedLabel'
import type { BotActivity } from './botActivity'
import { strings } from '../../shared/strings'

export const SLACKS = ['video', 'game', 'window', 'nap'] as const
const SLACK_SLOT_MS = 10 * 60_000
const FAILED_SHOWN_MS = 30 * 60_000

/** What the bot on the back of its badge is doing: replying, running a task, just failed one, or slacking off between jobs. */
export type DeskState =
  | { kind: 'replying' }
  | { kind: 'replied' }
  | { kind: 'task'; task: TaskView }
  | { kind: 'failed'; task: TaskView }
  | { kind: 'caught' }
  | { kind: 'video' }
  | { kind: 'game' }
  | { kind: 'window' }
  | { kind: 'nap' }

interface DeskInput {
  botId: string
  activity: BotActivity | 'idle'
  tasks: TaskView[]
  isCaught: boolean // poked while slacking, a moment ago
  now: number
}

/** Work comes first; between jobs it slacks off a different way every ten minutes, offset by its id so bots differ. */
export function deskStateOf({ botId, activity, tasks, isCaught, now }: DeskInput): DeskState {
  if (activity === 'thinking') return { kind: 'replying' }
  if (activity === 'happy') return { kind: 'replied' }
  const running = tasks.find(isUnfinished)
  if (running) return { kind: 'task', task: running }
  const last = tasks.reduce<TaskView | undefined>(
    (latest, task) => ((task.endedAt ?? 0) > (latest?.endedAt ?? 0) ? task : latest),
    undefined,
  )
  if (last?.status === 'failed' && now - (last.endedAt ?? 0) < FAILED_SHOWN_MS) return { kind: 'failed', task: last }
  if (isCaught) return { kind: 'caught' }
  const offset = [...botId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return { kind: SLACKS[(Math.floor(now / SLACK_SLOT_MS) + offset) % SLACKS.length] }
}

export const isSlacking = (state: DeskState) => SLACKS.some((slack) => slack === state.kind)

export const isWorking = (state: DeskState) => state.kind === 'replying' || state.kind === 'task'

/** The line under the desk: what it is doing, and a short aside. */
export function nowLineOf(state: DeskState, now: number): { text: string; aside: string } {
  const words = strings().desk.now
  switch (state.kind) {
    case 'replying':
      return { text: words.replying, aside: '' }
    case 'replied':
      return { text: words.replied, aside: '' }
    case 'task':
      if (state.task.status === 'waiting') return { text: words.queued(state.task.title), aside: '' }
      return { text: words.running(state.task.title), aside: elapsedLabel(now - state.task.createdAt) }
    case 'failed':
      return {
        text: words.failed(state.task.title),
        aside: clockLabel(state.task.endedAt ?? now),
      }
    case 'caught':
      return {
        text: words.caught,
        aside: '',
      }
    case 'nap':
      return {
        text: words.napping,
        aside: words.napAside,
      }
    case 'video':
      return {
        text: words.slacking,
        aside: words.slackAsides.video,
      }
    case 'game':
      return {
        text: words.slacking,
        aside: words.slackAsides.game,
      }
    case 'window':
      return {
        text: words.slacking,
        aside: words.slackAsides.window,
      }
    default:
      return state satisfies never
  }
}

interface DeskFacts {
  messages: number
  flowCount: number
  level: number
}

/** What it says when poked; caught slacking it makes excuses, taking turns by how many times it has been poked. */
export function pokeLineOf(state: DeskState, facts: DeskFacts, pokes: number): string {
  const words = strings().desk.poke
  switch (state.kind) {
    case 'replying':
      return words.replying
    case 'replied':
      return words.replied
    case 'task':
      return words.running(state.task.title, state.task.statusText || words.almostDone)
    case 'failed':
      return words.failed
    case 'caught':
      return words.caught
    case 'nap':
      return words.napping
    case 'video':
    case 'game':
    case 'window': {
      const unlock = nextUnlockOf(facts.level)
      const excuses = [
        words.excuses[state.kind],
        words.chats(facts.messages),
        unlock ? words.nextUnlock(unlock.level, unlock.name) : words.fullyKitted,
        facts.flowCount ? words.flows(facts.flowCount) : words.noFlows,
      ]
      return excuses[pokes % excuses.length]
    }
    default:
      return state satisfies never
  }
}

export function nextUnlockOf(level: number): { level: number; name: string } | undefined {
  const tier = TIERS.find((candidate) => level < candidate.from)
  // the desk gets better as the user trusts the bot more: one piece of furniture per tier
  return tier && { level: tier.from, name: strings().desk.furniture[tier.from] }
}

/** What stands on the desk at a level: each tier adds its piece and keeps the ones before. */
export function furnitureOf(level: number) {
  const tier = TIERS.findLastIndex((candidate) => level >= candidate.from)
  return { hasMonitor: tier >= 1, hasLamp: tier >= 2, hasTrophy: tier >= 3, hasNeon: tier >= 4, isRainbow: tier >= 5 }
}

/** The plant grows with the days on the team. */
export const plantStageOf = (days: number) => [7, 30, 100].filter((threshold) => days >= threshold).length

export type TimeOfDay = 'day' | 'dusk' | 'night'

/** The hour and minute on TIMEZONE's clock, and what the window shows then. */
export function clockOf(at: number): { hour: number; minute: number; timeOfDay: TimeOfDay } {
  const [hour, minute] = clockLabel(at).split(':').map(Number)
  const timeOfDay = hour >= 6 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night'
  return { hour, minute, timeOfDay }
}
