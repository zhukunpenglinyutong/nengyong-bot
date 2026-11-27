import type { Bot } from '../../shared/bot'
import type { Entry, Quote } from '../../shared/bridge'
import { SkillOffer } from '../../shared/skill'
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
  | { kind: 'skill-offer'; offer: SkillOffer; installed: string[] | null } // an install card: the skills installed from it, null before it is answered

/** What the chat view renders for one bot: its transcript (or a greeting), the reply being streamed, queued messages, the last error. */
export function chatMessages(
  thread: Pick<Thread, 'entries' | 'streaming' | 'queued' | 'error'>,
  bot: Bot,
  bots: Bot[],
  now = Date.now(),
): Message[] {
  const transcript = transcriptMessages(thread.entries, bots, now)
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
function transcriptMessages(entries: Entry[], bots: Bot[], now: number): Message[] {
  let last = 0
  const lastEntry = entries.at(-1)
  const answers = new Map(entries.flatMap((e) => (e.kind === 'skill-answer' ? [[e.offer, e.names]] : [])))
  return entries.flatMap((e): Message[] => {
    // of the tool records only install cards show, and the answer to one shows on its card
    const offer = e.kind === 'tool' && e.name === 'install_skill' ? SkillOffer.safeParse(e.output).data : undefined
    if (e.kind === 'skill-answer' || (e.kind === 'tool' && !offer)) return []
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
        return offer ? [...divider, { kind: 'skill-offer', offer, installed: answers.get(offer.offer) ?? null }] : []
      default:
        return e satisfies never
    }
  })
}

/** What a task's note adds about the model it ran on; nothing on results from before that was recorded. */
function ranOn({ model, fallbackFrom }: { model?: string; fallbackFrom?: string }): string {
  if (fallbackFrom) return strings().chat.messages.ranOnFallback(fallbackFrom)
  return model ? ` · ${model}` : ''
}
