import { useSyncExternalStore } from 'react'
import type { Quote } from '../../shared/bridge'

/** What is written to one bot and not sent yet; each bot keeps its own while another is open or the chat is closed. */
export interface Draft {
  text: string
  files: File[]
  quote: Quote | null
  fills: number // how often a text was put in the box from outside it: the box starts over with each
}

export type DraftChange = (current: Draft) => Partial<Draft>

export type Drafts = ReturnType<typeof createDrafts>

const EMPTY_DRAFT: Draft = { text: '', files: [], quote: null, fills: 0 }

/**
 * Every bot's draft, kept above the chat so that closing the chat, as a phone does on its list, keeps it; outside React
 * state, so a keystroke renders only the chat that shows it.
 */
export function createDrafts() {
  let drafts: Record<string, Draft> = {}
  const listeners = new Set<() => void>()
  return {
    of: (botId: string) => drafts[botId] ?? EMPTY_DRAFT,
    edit(botId: string, change: DraftChange) {
      const current = drafts[botId] ?? EMPTY_DRAFT
      drafts = { ...drafts, [botId]: { ...current, ...change(current) } }
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export function useDraft(drafts: Drafts, botId: string): Draft {
  return useSyncExternalStore(drafts.subscribe, () => drafts.of(botId))
}

/** Puts a text in the message box for the user to finish and send, in place of what was typed. */
export const fillWith =
  (text: string): DraftChange =>
  ({ fills }) => ({ text, fills: fills + 1 })
