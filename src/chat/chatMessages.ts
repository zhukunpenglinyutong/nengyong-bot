import type { Bot } from '../../shared/bot'
import type { Entry, Quote } from '../../shared/bridge'
import { type Ask, askOf, pendingDecisions } from '../../shared/decisions'
import { timeLabel } from '../timeLabel'
import type { Thread } from '../harnessState'
import { strings } from '../../shared/strings'

// seq and at: the entry it shows, which can be replied to, deleted and shared; none for the greeting and the reply being streamed
export type Message =
  // suggestions: only while nothing follows it; fallbackFrom: the model it was set to, which the main one stood in for
  | {
      kind: 'bot'
      text: string
      seq?: number
      at?: number
      model?: string
      fallbackFrom?: string
      requestId?: string
      suggestions?: string[]
    }
  | { kind: 'user'; text: string; seq: number; at: number; quote?: Quote; attachments?: string[]; sentBy?: string } // attachments: library paths; sentBy: the mini app that sent it for the user
  | { kind: 'queued'; text: string } // sent while the bot is busy; its next turn reads it
  | { kind: 'note'; text: string } // grey line across the chat: the time, a task's end, a routine's start, an error, the queued line
  | { kind: 'from-bot'; from: string; text: string } // a request delegated by another bot
  // a card or a question the bot put to the user, answered in the tray above the message box; outcome: the line it
  // folds into once it waits no more, null while it waits
  | { kind: 'ask'; seq: number; ask: Ask; outcome: AskOutcome | null }

/** How an ask ended: what the user picked or did, or that it lapsed; isYes: it went ahead (agreed, installed, answered). */
export interface AskOutcome {
  text: string
  isYes: boolean
}

/** What the chat view renders for one bot: its transcript (or a greeting), the reply being streamed, queued messages, the last error. */
export function chatMessages(
  thread: Pick<Thread, 'entries' | 'streaming' | 'queued' | 'error'>,
  bot: Bot,
  bots: Bot[],
  now = Date.now(),
): Message[] {
  const transcript = transcriptMessages(thread.entries, bot, bots, now)
  const greeting: Message = {
    kind: 'bot',
    text: strings().chat.messages.greeting(bot.name),
  }
  const streaming: Message[] = thread.streaming ? [{ kind: 'bot', text: thread.streaming }] : []
  const queued: Message[] = thread.queued.length
    ? [
        ...thread.queued.map((text): Message => ({ kind: 'queued', text })),
        {
          kind: 'note',
          text: strings().chat.messages.queued(bot.name),
        },
      ]
    : []
  const error: Message[] = thread.error ? [{ kind: 'note', text: strings().chat.messages.error(thread.error) }] : []
  return [...(transcript.length ? transcript : [greeting]), ...streaming, ...queued, ...error]
}

export const GAP_MS = 20 * 60_000 // a time divider appears after this much silence

/** Transcript entries → messages, with time dividers between bursts. */
function transcriptMessages(entries: Entry[], bot: Bot, bots: Bot[], now: number): Message[] {
  let last = 0
  const lastEntry = entries.at(-1)
  const outcomeOf = outcomes(entries, bot, bots, now)
  return entries.flatMap((e): Message[] => {
    // of the tool records only the asks show, and the answer to one shows on its line
    const ask = askOf(e)
    if (e.kind === 'skill-answer' || e.kind === 'duty-answer' || (e.kind === 'tool' && !ask)) return []
    const divider: Message[] = e.at - last > GAP_MS ? [{ kind: 'note', text: timeLabel(e.at, now) }] : []
    last = e.at
    switch (e.kind) {
      case 'from-bot':
        return [...divider, { kind: 'from-bot', from: bots.find((b) => b.id === e.from)?.name ?? e.from, text: e.text }]
      case 'routine':
        return [...divider, { kind: 'note', text: strings().chat.messages.routineStarted(e.name) }]
      case 'task-result':
        return [
          ...divider,
          {
            kind: 'note',
            text:
              e.status === 'done'
                ? strings().chat.messages.taskDone(e.title, ranOn(e))
                : strings().chat.messages.taskFailed(e.title, ranOn(e)),
          },
        ]
      case 'user':
        return [
          ...divider,
          {
            kind: 'user',
            text: e.text,
            seq: e.seq,
            at: e.at,
            quote: e.quote,
            attachments: e.attachments,
            sentBy: e.miniApp?.isSentByApp ? e.miniApp.name : undefined,
          },
        ]
      case 'bot': {
        const suggestions = e === lastEntry ? e.suggestions : undefined
        return [
          ...divider,
          {
            kind: 'bot',
            text: e.text,
            seq: e.seq,
            at: e.at,
            model: e.model,
            fallbackFrom: e.fallbackFrom,
            requestId: e.requestId,
            suggestions,
          },
        ]
      }
      case 'tool':
        return ask ? [...divider, { kind: 'ask', seq: e.seq, ask, outcome: outcomeOf(e.seq, ask) }] : []
      default:
        return e satisfies never
    }
  })
}

/** How each ask of a chat ended, by its seq: null while it still waits on the user. */
function outcomes(entries: Entry[], bot: Bot, bots: Bot[], now: number) {
  const words = strings()
  const waiting = new Set(pendingDecisions(entries, now).map((decision) => decision.seq))
  const agreed = new Map(entries.flatMap((e) => (e.kind === 'duty-answer' ? [[e.offer, e.isAccepted]] : [])))
  const installed = new Map(entries.flatMap((e) => (e.kind === 'skill-answer' ? [[e.offer, e.names]] : [])))
  const picked = new Map(entries.flatMap((e) => (e.kind === 'user' && e.quote ? [[e.quote.seq, e.text]] : [])))
  return (seq: number, ask: Ask): AskOutcome | null => {
    if (waiting.has(seq)) return null
    switch (ask.kind) {
      case 'duty': {
        const isAccepted = agreed.get(ask.offer.offer)
        if (isAccepted === undefined) return { text: words.bot.duty.offer.void, isYes: false }
        if (!isAccepted) return { text: words.bot.duty.offer.declined, isYes: false }
        return { text: words.bot.duty.offer.agreed(ask.offer.baseVersion + 1), isYes: true }
      }
      case 'skill': {
        const names = installed.get(ask.offer.offer)
        if (names === undefined) return { text: words.chat.asks.skillExpired, isYes: false }
        const offered = words.skills.names(ask.offer.skills.map((skill) => skill.name))
        if (!names.length) return { text: words.skills.offer.declined(offered), isYes: false }
        const forBot = ask.offer.botId === bot.id ? undefined : bots.find((each) => each.id === ask.offer.botId)
        const text = forBot
          ? words.skills.offer.installedFor(forBot.name, words.skills.names(names))
          : words.skills.offer.installed(words.skills.names(names))
        return { text, isYes: true }
      }
      case 'question': {
        const answer = picked.get(seq)
        return { text: answer === undefined ? words.chat.asks.replied : words.chat.asks.picked(answer), isYes: true }
      }
      default:
        return ask satisfies never
    }
  }
}

/** What a task's note adds about the model it ran on; nothing on results from before that was recorded. */
function ranOn({ model, fallbackFrom }: { model?: string; fallbackFrom?: string }): string {
  if (fallbackFrom) return strings().chat.messages.ranOnFallback(fallbackFrom)
  return model ? ` · ${model}` : ''
}
