import { Fragment, type Ref } from 'react'
import { type Bot, MAIN_BOT } from '../../shared/bot'
import { locale } from '../../shared/language'
import { TIMEZONE } from '../../shared/timezone'
import { BotAvatar } from '../bot/BotAvatar'
import { ShapePattern } from '../bot/ShapePattern'
import { Icon } from '../ui/Icon'
import { dateLabel, dateTimeLabel } from '../timeLabel'
import { GAP_MS } from './chatMessages'
import { Markdown } from './Markdown'
import { useMentions } from './MentionContext'
import { MentionText } from './MentionText'
import { fileName } from './MessageList'
import type { SelectableMessage } from './selection'
import { strings } from '../../shared/strings'

export type CardLook = 'bot' | 'plain' | 'dark'

interface Props {
  bot: Bot
  messages: SelectableMessage[] // in the order of the chat
  look: CardLook
  bubbleColor?: string // fills the user's bubbles, as in the chat
  ref: Ref<HTMLDivElement>
}

/**
 * The picked messages laid out to be shared as an image: whose chat and when, the messages, and the app it came from.
 * It sets its own colour scheme, so it looks the same whichever theme the app is in.
 */
export function ShareCard({ bot, messages, look, bubbleColor, ref }: Props) {
  const days = [...new Set(messages.map((message) => dateLabel(message.at)))]
  const today = new Date().toLocaleDateString(locale(), {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return (
    <div
      ref={ref}
      data-look={look}
      style={{ background: backdropOf(look, bot.color) }}
      className="group/card relative w-[420px] overflow-hidden bg-side px-5 pt-6 pb-4.5 font-sans text-base leading-[1.6] text-ink antialiased scheme-light data-[look=dark]:scheme-dark"
    >
      <div
        style={{ color: bot.color }}
        className="absolute inset-0 opacity-0 group-data-[look=bot]/card:opacity-10 group-data-[look=dark]/card:opacity-7"
      >
        <ShapePattern shape={bot.shape} />
      </div>
      <div className="relative flex items-center gap-3 px-1 pb-4.5">
        <span className="grid size-[50px] shrink-0 place-items-center rounded-xl bg-surface/75 group-data-[look=dark]/card:bg-ink">
          <BotAvatar bot={bot} size={36} animated={false} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-lg leading-snug font-semibold">{bot.name}</div>
          <div className="text-xs text-soft">
            {strings().chat.share.cardTitle} · {days.length > 1 ? `${days[0]} – ${days.at(-1)}` : days[0]}
          </div>
        </div>
      </div>
      <div className="relative flex flex-col gap-1.5 rounded-2xl bg-surface p-4 shadow-card group-data-[look=dark]/card:bg-canvas group-data-[look=dark]/card:shadow-ring">
        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const isNewMoment = !previous || message.at - previous.at > GAP_MS
          return (
            <Fragment key={message.seq}>
              {isNewMoment && (
                <div className="my-1 self-center text-xs text-muted first:mt-0">{dateTimeLabel(message.at)}</div>
              )}
              <CardMessage
                message={message}
                isTurn={!isNewMoment && previous?.kind !== message.kind}
                bubbleColor={bubbleColor}
              />
            </Fragment>
          )
        })}
      </div>
      <div className="relative flex items-center justify-between px-1.5 pt-4 text-xs text-soft">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <span className="grid size-[22px] place-items-center rounded-md group-data-[look=dark]/card:bg-ink">
            <BotAvatar bot={MAIN_BOT} size={18} animated={false} />
          </span>
          Nengyong Bot
        </span>
        <span>{strings().chat.share.madeOn(today)}</span>
      </div>
    </div>
  )
}

// colour-mixed with the scheme's own surfaces, so the bot's colour reads as a tint in both schemes
function backdropOf(look: CardLook, color: string): string | undefined {
  switch (look) {
    case 'bot':
      return `linear-gradient(165deg, color-mix(in srgb, ${color} 28%, var(--color-surface)), color-mix(in srgb, ${color} 9%, var(--color-surface)) 62%, color-mix(in srgb, ${color} 16%, var(--color-surface)))`
    case 'plain':
      return undefined
    case 'dark':
      return `radial-gradient(130% 55% at 50% 0%, color-mix(in srgb, ${color} 36%, var(--color-side)), var(--color-side) 72%)`
    default:
      return look satisfies never
  }
}

interface CardMessageProps {
  message: SelectableMessage
  isTurn: boolean // the other side spoke last: a little more room above
  bubbleColor?: string
}

function CardMessage({ message, isTurn, bubbleColor }: CardMessageProps) {
  const { bots } = useMentions()
  if (message.kind === 'bot')
    return (
      <div
        data-turn={isTurn || undefined}
        className="max-w-[92%] self-start rounded-2xl rounded-tl-sm bg-bubble px-3 py-2 text-md break-words data-turn:mt-2"
      >
        <Markdown text={message.text} />
      </div>
    )
  return (
    <div data-turn={isTurn || undefined} className="flex max-w-[80%] flex-col items-end gap-1 self-end data-turn:mt-2">
      {message.attachments?.map((path) => (
        <span key={path} className="flex max-w-full items-center gap-1.5 rounded-xl bg-bubble px-3 py-1.5 text-sm">
          <Icon name="file" size={15} />
          <span className="truncate">{fileName(path)}</span>
        </span>
      ))}
      {message.text && (
        <div
          style={{ background: bubbleColor }}
          data-tinted={bubbleColor !== undefined || undefined}
          className="rounded-2xl rounded-tr-sm bg-ink px-3 py-2 text-md wrap-anywhere whitespace-pre-wrap text-canvas data-tinted:text-white [&_[data-mention]]:font-semibold [&_[data-mention]]:text-inherit!"
        >
          <MentionText text={message.text} bots={bots} />
        </div>
      )}
    </div>
  )
}
