import type { Message } from './chatMessages'

/** The messages picked while the chat is in selection mode, by seq; null while it is not. */
export interface Selection {
  seqs: number[] // ascending; may hold seqs of entries that are not shown, so read it through the messages
  anchor: number // a Shift-press picks from here: the row last pressed without Shift
  stroke: Stroke // the last press: rows the pointer is dragged over while it is held take its side
}

interface Stroke {
  from: number
  isAdding: boolean
  before: number[] // what was picked when the press started
}

export type SelectionEvent =
  | { kind: 'start'; seq: number } // a long press on a message, or 多选 in its menu
  | { kind: 'press'; seq: number; isRange: boolean }
  | { kind: 'drag'; seq: number } // the pointer, still pressed, came onto this row
  | { kind: 'all'; seqs: number[] } // every message that can be picked: all of them, or none once they all are
  | { kind: 'end' }

export function selectionOf(selection: Selection | null, event: SelectionEvent): Selection | null {
  switch (event.kind) {
    case 'start':
      return { seqs: [event.seq], anchor: event.seq, stroke: { from: event.seq, isAdding: true, before: [] } }
    case 'end':
      return null
    case 'press': {
      if (!selection) return null
      const before = selection.seqs
      if (event.isRange) return stroke(selection, { from: selection.anchor, isAdding: true, before }, event.seq)
      const isAdding = !before.includes(event.seq)
      return stroke({ ...selection, anchor: event.seq }, { from: event.seq, isAdding, before }, event.seq)
    }
    case 'drag':
      return selection && stroke(selection, selection.stroke, event.seq)
    case 'all': {
      if (!selection) return null
      const isAll = event.seqs.every((seq) => selection.seqs.includes(seq))
      return { ...selection, seqs: isAll ? [] : event.seqs }
    }
    default:
      return event satisfies never
  }
}

function stroke(selection: Selection, next: Stroke, to: number): Selection {
  const low = Math.min(next.from, to)
  const high = Math.max(next.from, to)
  const range = Array.from({ length: high - low + 1 }, (_, index) => low + index)
  const seqs = next.isAdding
    ? [...new Set([...next.before, ...range])].sort((a, b) => a - b)
    : next.before.filter((seq) => seq < low || seq > high)
  return { ...selection, seqs, stroke: next }
}

/** A message of the transcript that can be picked, deleted and shared. */
export interface SelectableMessage {
  kind: 'user' | 'bot'
  text: string
  seq: number
  at: number
  attachments?: string[] // library paths
}

export function selectableMessages(messages: Message[]): SelectableMessage[] {
  return messages.flatMap((message): SelectableMessage[] => {
    switch (message.kind) {
      case 'user': {
        const { text, seq, at, attachments } = message
        return [{ kind: 'user', text, seq, at, ...(attachments ? { attachments } : {}) }]
      }
      case 'bot':
        return message.seq === undefined || message.at === undefined
          ? []
          : [{ kind: 'bot', text: message.text, seq: message.seq, at: message.at }]
      case 'queued':
      case 'note':
      case 'from-bot':
      case 'skill-offer':
      case 'duty-offer':
        return []
      default:
        return message satisfies never
    }
  })
}
