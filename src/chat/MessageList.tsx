import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { imageType } from '../../shared/attachment'
import { plainText } from '../../shared/plainText'
import { Icon } from '../ui/Icon'
import { MiniAppCard } from '../miniApp/MiniAppCard'
import { useNavigation } from '../NavigationContext'
import { ENTER } from '../ui/motion'
import { miniAppIdsIn } from '../../shared/miniApp'
import type { Message } from './chatMessages'
import { ImagePreview } from './ImagePreview'
import { Markdown } from './Markdown'
import { useMentions } from './MentionContext'
import { MentionText } from './MentionText'
import { MessageActions } from './MessageActions'
import { SelectableRow } from './SelectableRow'
import { SkillOfferCard } from '../skills/SkillOfferCard'
import { useSkills } from '../skills/SkillsContext'
import type { Selection, SelectionEvent } from './selection'
import { strings } from '../../shared/strings'

interface Props {
  messages: Message[]
  bubbleColor?: string // fills the user's bubbles; without one they are ink
  selection: Selection | null // null: not in selection mode
  onQuote: (seq: number, text: string) => void
  onSelection: (event: SelectionEvent) => void
  onDelete: (seq: number) => void
}

// Keyed by bot: the thread fades in on switch; only messages added after mount slide up.
export function MessageList({ messages, ...rest }: Props) {
  const initialCount = useRef(messages.length)
  return (
    <motion.div
      className="flex flex-col gap-1.5 pt-6"
      data-testid="messages"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      {messages.map((message, index) => (
        <MessageItem
          key={index}
          message={message}
          previous={messages[index - 1]}
          animateIn={index >= initialCount.current}
          {...rest}
        />
      ))}
    </motion.div>
  )
}

type ItemProps = Omit<Props, 'messages'> & { message: Message; previous?: Message; animateIn: boolean }

function MessageItem({
  message,
  previous,
  bubbleColor,
  selection,
  onQuote,
  onSelection,
  onDelete,
  animateIn,
}: ItemProps) {
  const { bots, chatBotId } = useMentions()
  const { openSkillFiles } = useNavigation()
  const { manager } = useSkills()
  const enter = animateIn ? ENTER : { initial: false as const }
  const row = (seq: number | undefined) => ({
    seq,
    isSelecting: selection !== null,
    isSelected: seq !== undefined && selection !== null && selection.seqs.includes(seq),
    enter,
    onSelection,
  })
  const actions = (seq: number, text: string) => ({
    text,
    onQuote: () => onQuote(seq, text),
    onStartSelection: () => onSelection({ kind: 'start', seq }),
    onDelete: () => onDelete(seq),
  })
  switch (message.kind) {
    case 'note':
      return (
        <motion.div {...enter} className="my-4 max-w-[min(600px,62%)] self-center text-xs text-muted first:mt-0">
          {message.text}
        </motion.div>
      )
    case 'from-bot':
      return (
        <motion.div {...enter} className="my-3 max-w-[min(600px,62%)] self-end">
          <div className="mb-1 text-right text-xs text-muted">{strings().chat.messages.askedBy(message.from)}</div>
          <div className="rounded-2xl bg-surface px-3.5 py-2.5 break-words whitespace-pre-wrap shadow-ring">
            {message.text}
          </div>
        </motion.div>
      )
    case 'user':
    case 'queued':
      return (
        <SelectableRow
          {...row(message.kind === 'user' ? message.seq : undefined)}
          side="end"
          // the first bubble after a time divider sits flush under it
          isFlush={!previous || previous.kind === 'note'}
          className="my-5 data-flush:mt-0 data-flush:mb-4"
        >
          <div
            data-queued={message.kind === 'queued' || undefined}
            className="group relative flex flex-col items-end gap-1.5 data-queued:opacity-60"
          >
            {message.kind === 'user' && (
              <MessageActions {...actions(message.seq, message.text)} className="absolute top-0 right-full pr-1" />
            )}
            {message.kind === 'user' && message.sentBy && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Icon name="cube" size={13} />
                {strings().chat.messages.sentFrom(message.sentBy)}
              </span>
            )}
            {message.kind === 'user' && message.quote && <QuotedLine text={message.quote.text} />}
            {message.kind === 'user' && message.attachments && <SentAttachments paths={message.attachments} />}
            {message.text && (
              <div
                style={{ background: bubbleColor }}
                data-tinted={bubbleColor !== undefined || undefined}
                data-user-bubble=""
                className="rounded-2xl bg-ink px-3.5 py-2.5 wrap-anywhere whitespace-pre-wrap text-canvas data-tinted:text-white [&_[data-mention]]:font-semibold [&_[data-mention]]:text-inherit!"
              >
                <MentionText text={message.text} bots={bots} />
              </div>
            )}
          </div>
        </SelectableRow>
      )
    case 'bot': {
      const { seq } = message
      return (
        <SelectableRow {...row(seq)} side="start">
          <div className="group relative rounded-2xl bg-bubble px-3.5 py-2.5 break-words shadow-ring">
            <Markdown text={message.text} />
            {seq !== undefined && (
              <MessageActions
                {...actions(seq, message.text)}
                model={message.model}
                fallbackFrom={message.fallbackFrom}
                at={message.at}
                requestId={message.requestId}
                className="absolute top-0 left-full pl-1"
              />
            )}
          </div>
          {message.fallbackFrom && (
            <p className="mt-1 ml-1.5 text-xs text-muted">
              <span className="font-mono">{message.fallbackFrom}</span>
              {strings().chat.messages.fellBack}
            </p>
          )}
          {message.at !== undefined && <LinkedMiniApps text={message.text} at={message.at} />}
        </SelectableRow>
      )
    }
    case 'skill-offer': {
      const { offer } = message
      const forBot = offer.botId === chatBotId ? undefined : bots.find((candidate) => candidate.id === offer.botId)
      const botName = forBot?.name ?? bots.find((candidate) => candidate.id === chatBotId)?.name ?? offer.botId
      return (
        <motion.div {...enter} className="my-2 max-w-[min(600px,80%)] self-start">
          <SkillOfferCard
            offer={offer}
            installed={message.installed}
            forBot={forBot}
            onAnswer={manager && ((names) => manager.answerSkillOffer(chatBotId, offer.offer, names))}
            onViewFiles={(name) => openSkillFiles({ ref: { kind: 'offer', offer: offer.offer, name }, name, botName })}
          />
        </motion.div>
      )
    }
    default:
      return message satisfies never
  }
}

const CARDS_PER_REPLY = 2

/** The mini apps a reply links, each as a card under it. */
function LinkedMiniApps({ text, at }: { text: string; at: number }) {
  const { miniApps, thumbUrl } = useMentions()
  const { openMiniApp } = useNavigation()
  const linked = miniAppIdsIn(text).flatMap((id) => miniApps.filter((app) => app.id === id))
  return linked
    .slice(0, CARDS_PER_REPLY)
    .map((app) => (
      <MiniAppCard
        key={app.id}
        app={app}
        at={at}
        thumbUrl={thumbUrl(app)}
        onOpen={(from) => openMiniApp(app.id, from)}
      />
    ))
}

/** What a sent message replies to, in one line above its bubble. */
function QuotedLine({ text }: { text: string }) {
  return (
    <div className="flex max-w-[252px] items-center gap-1 text-sm text-muted">
      <Icon name="reply" size={14} />
      <span className="sr-only">{strings().chat.messages.reply}</span>
      <span className="truncate">{plainText(text)}</span>
    </div>
  )
}

function SentAttachments({ paths }: { paths: string[] }) {
  const { attachmentUrl } = useMentions()
  const [previewing, setPreviewing] = useState<string | null>(null)
  return (
    <ul aria-label={strings().chat.messages.attachments} className="flex flex-wrap justify-end gap-1.5">
      <AnimatePresence>
        {previewing && (
          <ImagePreview
            key={previewing}
            src={attachmentUrl(previewing)}
            name={fileName(previewing)}
            onClose={() => setPreviewing(null)}
          />
        )}
      </AnimatePresence>
      {paths.map((path) => {
        const name = fileName(path)
        return (
          <li key={path}>
            {imageType(path) ? (
              <button
                type="button"
                aria-label={strings().chat.messages.viewImage(name)}
                onClick={() => setPreviewing(path)}
                className="block rounded-2xl"
              >
                <img src={attachmentUrl(path)} alt={name} className="max-h-60 max-w-[280px] rounded-2xl shadow-ring" />
              </button>
            ) : (
              <span className="flex max-w-[260px] items-center gap-1.5 rounded-2xl bg-surface px-3.5 py-2.5 text-sm shadow-ring">
                <Icon name="file" size={16} />
                <span className="truncate">{name}</span>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function fileName(path: string) {
  return path.split(/[\\/]/).at(-1) ?? path
}
