import { z } from 'zod'
import type { Entry } from './bridge'
import { DutyOffer } from './duty'
import { SKILL_OFFER_TTL_MS, SkillOffer } from './skill'

export const MAX_ANSWERS = 4

/** What ask_user records: a question the bot put to the user, and the answers it offers to pick from. */
const Question = z.object({ question: z.string(), answers: z.array(z.string()).min(1).max(MAX_ANSWERS) })
type Question = z.infer<typeof Question>

/** What a bot puts to the user in its chat and then waits on: a duty card, an install card or a question. */
export type Ask =
  | { kind: 'duty'; offer: DutyOffer }
  | { kind: 'skill'; offer: SkillOffer }
  | { kind: 'question'; question: Question }

/** The ask a tool record holds; undefined for any other entry. */
export function askOf(entry: Entry): Ask | undefined {
  if (entry.kind !== 'tool') return undefined
  switch (entry.name) {
    case 'propose_duty': {
      const offer = DutyOffer.safeParse(entry.output).data
      return offer && { kind: 'duty', offer }
    }
    case 'install_skill': {
      const offer = SkillOffer.safeParse(entry.output).data
      return offer && { kind: 'skill', offer }
    }
    case 'ask_user': {
      const question = Question.safeParse(entry.output).data
      return question && { kind: 'question', question }
    }
    default:
      return undefined
  }
}

/** What a reply to an entry quotes: a message's own text, or the question a bot asked; undefined when it has neither. */
export function quotedText(entry: Entry): string | undefined {
  const ask = askOf(entry)
  if (ask?.kind === 'question') return ask.question.question
  return 'text' in entry ? entry.text : undefined
}

/** An ask still waiting on the user, with the entry that holds it. */
export interface Decision {
  seq: number
  at: number
  ask: Ask
}

/**
 * The asks of one chat still waiting on the user, oldest first: a duty card not answered and not followed by another
 * for the same bot, an install card not answered and still young enough to install, a question the user has written
 * nothing after. Entries may come in any order.
 */
export function pendingDecisions(entries: Entry[], now: number): Decision[] {
  const answered = new Set(
    entries.flatMap((entry) => (entry.kind === 'duty-answer' || entry.kind === 'skill-answer' ? [entry.offer] : [])),
  )
  const lastUserSeq = Math.max(0, ...entries.flatMap((entry) => (entry.kind === 'user' ? [entry.seq] : [])))
  const asks = entries
    .flatMap((entry) => {
      const ask = askOf(entry)
      return ask ? [{ seq: entry.seq, at: entry.at, ask }] : []
    })
    .sort((a, b) => a.seq - b.seq)
  const latestDutyCard = (botId: string) =>
    asks.findLast(({ ask }) => ask.kind === 'duty' && ask.offer.botId === botId)?.seq
  return asks.filter(({ seq, at, ask }) => {
    switch (ask.kind) {
      case 'duty':
        return !answered.has(ask.offer.offer) && latestDutyCard(ask.offer.botId) === seq
      case 'skill':
        return !answered.has(ask.offer.offer) && now - at < SKILL_OFFER_TTL_MS
      case 'question':
        return seq > lastUserSeq
      default:
        return ask satisfies never
    }
  })
}
