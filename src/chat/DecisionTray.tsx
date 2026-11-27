import { AnimatePresence, motion } from 'motion/react'
import type { Bot } from '../../shared/bot'
import type { Decision } from '../../shared/decisions'
import type { DutyOffer } from '../../shared/duty'
import { strings } from '../../shared/strings'
import { BotAvatar } from '../bot/BotAvatar'
import { useNavigation } from '../NavigationContext'
import { SkillOfferCard } from '../skills/SkillOfferCard'
import { useSkills } from '../skills/SkillsContext'
import { timeLabel } from '../timeLabel'
import { Icon } from '../ui/Icon'
import { EASE_SHARP } from '../ui/motion'
import { ASK_KINDS, askTitle } from './askLabels'
import { AskButton } from './AskButton'
import { DutyOfferCard } from './DutyOfferCard'

/** What the tray shows: one line, the list of what waits, or one card opened (by the seq of its entry). */
export type TrayView = 'closed' | 'list' | number

interface Props {
  decisions: Decision[] // of this chat, oldest first
  view: TrayView
  onView: (view: TrayView) => void
  bot: Bot // whose chat it is
  bots: Bot[] // whose duty or skills a card is about
  accent?: string // the colour of the user's bubbles
  onAnswer: (seq: number, answer: string) => void // a question: the answer is sent as the user's reply to it
  onAnswerDuty?: (offer: string, isAccepted: boolean, isReviewOn: boolean) => Promise<void> // absent on a device
}

/**
 * What the bot waits on the user for, tucked behind the top of the message box: a line saying how many, which opens
 * into the list, where a question is answered with a click and a card opens in full.
 */
export function DecisionTray(props: Props) {
  const { decisions, view } = props
  const open = typeof view === 'number' ? decisions.find((decision) => decision.seq === view) : undefined
  return (
    <AnimatePresence>
      {decisions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: EASE_SHARP }}
          data-open={view !== 'closed' || undefined}
          className="relative mx-auto -mb-[22px] flex w-[calc(100%-88px)] max-w-[912px] shrink-0 flex-col overflow-hidden rounded-t-2xl bg-surface pb-[22px] shadow-card data-open:max-h-[min(620px,72vh)] data-open:shadow-pop"
        >
          {open ? (
            <Opened {...props} decision={open} />
          ) : view === 'closed' ? (
            <Strip {...props} />
          ) : (
            <List {...props} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Collapsed: the one question with its answers, the one card, or how many wait and what they are. */
function Strip({ decisions, onView, bots, accent, onAnswer }: Props) {
  const [only, ...rest] = decisions
  if (rest.length === 0 && only) {
    const { ask } = only
    return (
      <div className="flex min-h-12 items-center gap-2.5 py-2 pr-2 pl-3 text-md leading-snug">
        <KindIcon decision={only} />
        <span className="min-w-0 flex-1">
          {askTitle(ask, bots)}
          {ask.kind !== 'question' && <span className="text-muted"> · {strings().chat.asks.waiting}</span>}
        </span>
        {ask.kind === 'question' ? (
          <>
            <Answers decision={only} accent={accent} onAnswer={onAnswer} />
            <button
              type="button"
              aria-label={strings().chat.asks.expand}
              onClick={() => onView('list')}
              className="grid size-[30px] shrink-0 -rotate-90 place-items-center rounded-full text-muted"
            >
              <Icon name="chevron" size={16} />
            </button>
          </>
        ) : (
          <LookButton accent={accent} onClick={() => onView(only.seq)} />
        )}
      </div>
    )
  }
  return (
    <button type="button" onClick={() => onView('list')} className="flex h-11 w-full items-center gap-2 px-3 text-md">
      <Count count={decisions.length} />
      <span className="min-w-0 flex-1 truncate text-left text-sm text-muted">
        {decisions.map(({ ask }) => askTitle(ask, bots)).join(' · ')}
      </span>
      <span className="-rotate-90 text-muted">
        <Icon name="chevron" size={16} />
      </span>
    </button>
  )
}

/** Expanded: every ask on its own card, oldest first. */
function List({ decisions, onView, bots, accent, onAnswer }: Props) {
  return (
    <>
      <button
        type="button"
        aria-label={strings().chat.asks.collapse}
        onClick={() => onView('closed')}
        className="flex h-12 w-full shrink-0 items-center gap-2 px-3 text-md"
      >
        <Count count={decisions.length} />
        <span className="flex-1" />
        <span className="rotate-90 text-muted">
          <Icon name="chevron" size={16} />
        </span>
      </button>
      <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto px-2.5 pb-3">
        {decisions.map((decision) => (
          <li key={decision.seq} className="flex items-start gap-3 rounded-lg bg-canvas p-3.5 shadow-ring">
            <Tile decision={decision} accent={accent} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2.5">
                <span className="min-w-0 flex-1 text-md font-medium">{askTitle(decision.ask, bots)}</span>
                <small className="shrink-0 text-xs text-muted">
                  {ASK_KINDS[decision.ask.kind].label} · {timeLabel(decision.at)}
                </small>
              </div>
              <Detail decision={decision} />
              {decision.ask.kind === 'question' && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Answers decision={decision} accent={accent} onAnswer={onAnswer} />
                </div>
              )}
            </div>
            {decision.ask.kind !== 'question' && (
              <span className="self-center">
                <LookButton accent={accent} onClick={() => onView(decision.seq)} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

/** One card in full, under a header saying whose it is; back to the list while others wait. */
function Opened({ decisions, decision, onView, bot, bots, accent, onAnswerDuty }: Props & { decision: Decision }) {
  const words = strings().chat.asks
  const { ask } = decision
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: EASE_SHARP }}
      className="flex min-h-0 flex-col"
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line py-3 pr-2.5 pl-3.5">
        {decisions.length > 1 && (
          <button
            type="button"
            aria-label={words.backToList}
            onClick={() => onView('list')}
            className="grid size-[30px] shrink-0 rotate-180 place-items-center rounded-full text-muted"
          >
            <Icon name="chevron" size={18} />
          </button>
        )}
        <BotAvatar bot={bot} size={32} />
        <span className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold">{askTitle(ask, bots)}</h3>
          <small className="block text-xs text-muted">{words.proposedBy(bot.name, timeLabel(decision.at))}</small>
        </span>
        <button
          type="button"
          aria-label={words.collapse}
          onClick={() => onView('closed')}
          className="grid size-[30px] shrink-0 rotate-90 place-items-center rounded-full text-muted"
        >
          <Icon name="chevron" size={18} />
        </button>
      </div>
      {ask.kind === 'duty' && (
        <DutyOfferCard
          key={ask.offer.offer}
          offer={ask.offer}
          accent={accent}
          onAnswer={dutyAnswer(ask.offer, onAnswerDuty)}
        />
      )}
      {ask.kind === 'skill' && <SkillCard decision={decision} bot={bot} bots={bots} />}
    </motion.div>
  )
}

const dutyAnswer = (offer: DutyOffer, onAnswerDuty: Props['onAnswerDuty']) =>
  onAnswerDuty && ((isAccepted: boolean, isReviewOn: boolean) => onAnswerDuty(offer.offer, isAccepted, isReviewOn))

/** An install card, as the chat used to show it: ticking, the files, installing. */
function SkillCard({ decision, bot, bots }: { decision: Decision; bot: Bot; bots: Bot[] }) {
  const { manager } = useSkills()
  const { openSkillFiles } = useNavigation()
  if (decision.ask.kind !== 'skill') return null
  const { offer } = decision.ask
  const forBot = offer.botId === bot.id ? undefined : bots.find((candidate) => candidate.id === offer.botId)
  const botName = (forBot ?? bot).name
  return (
    <div className="min-h-0 overflow-y-auto p-4">
      <SkillOfferCard
        offer={offer}
        installed={null}
        forBot={forBot}
        onAnswer={manager && ((names) => manager.answerSkillOffer(bot.id, offer.offer, names))}
        onViewFiles={(name) => openSkillFiles({ ref: { kind: 'offer', offer: offer.offer, name }, name, botName })}
      />
    </div>
  )
}

/** Under an ask's title in the list: what the card proposes. A question says it all in its title. */
function Detail({ decision }: { decision: Decision }) {
  const { ask } = decision
  const text =
    ask.kind === 'duty'
      ? ask.offer.plan.purpose
      : ask.kind === 'skill'
        ? ask.offer.skills.map((skill) => skill.description).join(' · ')
        : ''
  return text && <p className="mt-0.5 line-clamp-2 text-sm leading-normal text-soft">{text}</p>
}

/** A question's answers: the bot's pick first and filled. */
function Answers({ decision, accent, onAnswer }: { decision: Decision; accent?: string; onAnswer: Props['onAnswer'] }) {
  if (decision.ask.kind !== 'question') return null
  return decision.ask.question.answers.map((answer, index) => (
    <AskButton key={answer} accent={accent} isPrimary={index === 0} onClick={() => onAnswer(decision.seq, answer)}>
      {answer}
    </AskButton>
  ))
}

function LookButton({ accent, onClick }: { accent?: string; onClick: () => void }) {
  return (
    <AskButton accent={accent} onClick={onClick}>
      {strings().chat.asks.look}
      <Icon name="chevron" size={14} />
    </AskButton>
  )
}

function KindIcon({ decision }: { decision: Decision }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
      <Icon name={ASK_KINDS[decision.ask.kind].icon} size={14} />
    </span>
  )
}

/** An ask's mark in the list, tinted with the colour of the user's bubbles like its answers. */
function Tile({ decision, accent }: { decision: Decision; accent?: string }) {
  const color = accent ?? 'var(--color-ink)'
  return (
    <span
      style={{ background: `color-mix(in srgb, ${color} 11%, var(--color-surface))`, color }}
      className="grid size-[34px] shrink-0 place-items-center rounded-md"
    >
      <Icon name={ASK_KINDS[decision.ask.kind].icon} size={17} />
    </span>
  )
}

function Count({ count }: { count: number }) {
  return (
    <>
      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white">
        {count}
      </span>
      <span className="shrink-0">{strings().chat.asks.waitingOnYou}</span>
    </>
  )
}
