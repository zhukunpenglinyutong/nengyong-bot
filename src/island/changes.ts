import type { Entry } from '../../shared/bridge'
import { DutyOffer } from '../../shared/duty'
import { strings } from '../../shared/strings'

/** Something a bot's chat changed for good: a memory, its duty, a routine, a new bot. Read from its tool records. */
export interface Change {
  seq: number
  at: number
  label: string
  text: string
  tool: string
  before?: string // what the duty said until this change, when an earlier one is in the transcript
}

interface Fold {
  changes: Change[]
  names: Record<string, string> // memory and routine ids → what they say, to show what a later call touched
  duty?: string
}

/** Newest first. Failed calls changed nothing and are left out. */
export function changesOf(entries: Entry[]): Change[] {
  return entries.reduce(fold, { changes: [], names: {} }).changes.toReversed()
}

function fold(state: Fold, entry: Entry): Fold {
  if (entry.kind === 'duty-answer') return entry.isAccepted ? agreed(state, entry) : state
  if (entry.kind !== 'tool' || valueOf(entry.output, 'error') !== undefined) return state
  const { input, output } = entry
  const words = strings().debug.changes
  const named = (id: string | undefined) => (id ? `[${id}] ${state.names[id] ?? ''}`.trim() : '')
  const add = (label: string, text: string, names: Record<string, string> = {}, more: Partial<Change> = {}) => ({
    ...state,
    changes: [...state.changes, { seq: entry.seq, at: entry.at, label, text, tool: entry.name, ...more }],
    names: { ...state.names, ...names },
  })
  switch (entry.name) {
    case 'remember': {
      const id = fieldOf(output, 'saved') ?? ''
      const text = fieldOf(input, 'text') ?? ''
      const label = fieldOf(input, 'scope') === 'user' ? words.userPlus : words.memoryPlus
      return add(label, `[${id}] ${text}`, { [id]: text })
    }
    case 'forget':
      return add(words.forgot, named(fieldOf(input, 'id')))
    case 'update_my_instructions': {
      const duty = fieldOf(input, 'instructions') ?? ''
      return { ...add(words.job, duty, {}, state.duty === undefined ? {} : { before: state.duty }), duty }
    }
    case 'propose_duty': {
      const offer = DutyOffer.safeParse(output).data
      if (!offer) return state
      const text = [offer.plan.purpose, ...offer.plan.objectives.map((objective) => objective.name)].join(' · ')
      return { ...state, names: { ...state.names, [offer.offer]: text } }
    }
    case 'update_my_name':
      return add(words.name, fieldOf(input, 'name') ?? '')
    case 'create_routine': {
      const id = fieldOf(output, 'id') ?? ''
      const name = fieldOf(input, 'name') ?? ''
      return add(words.routinePlus, `[${id}] ${name} · ${fieldOf(input, 'cron') ?? ''}`, { [id]: name })
    }
    case 'set_routine_enabled':
      return add(
        valueOf(input, 'isEnabled') === true ? words.routineResumed : words.routinePaused,
        named(fieldOf(input, 'id')),
      )
    case 'delete_routine':
      return add(words.routineMinus, named(fieldOf(input, 'id')))
    case 'create_bot': {
      const name = fieldOf(input, 'name') ?? ''
      const purpose = fieldOf(input, 'purpose') ?? ''
      return add(words.newBot, words.newBotText(name, purpose))
    }
    default:
      return state
  }
}

/** A duty card the user agreed to: the duty it made, and the one it replaced when that is in the transcript too. */
function agreed(state: Fold, entry: Extract<Entry, { kind: 'duty-answer' }>): Fold {
  const duty = state.names[entry.offer] ?? ''
  const change = { seq: entry.seq, at: entry.at, label: strings().debug.changes.job, text: duty, tool: 'propose_duty' }
  return {
    ...state,
    changes: [...state.changes, state.duty === undefined ? change : { ...change, before: state.duty }],
    duty,
  }
}

/** A string field of a tool's input or output, which the renderer only knows as unknown JSON. */
export function fieldOf(value: unknown, key: string): string | undefined {
  const field = valueOf(value, key)
  return typeof field === 'string' ? field : undefined
}

function valueOf(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  return Object.entries(value).find(([name]) => name === key)?.[1]
}
