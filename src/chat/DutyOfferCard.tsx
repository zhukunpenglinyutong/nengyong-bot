import { useState } from 'react'
import type { DutyOffer, Objective } from '../../shared/duty'
import { strings } from '../../shared/strings'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { Icon } from '../ui/Icon'
import { Switch } from '../ui/Switch'
import { AskButton } from './AskButton'

interface Props {
  offer: DutyOffer
  accent?: string // the colour of the user's bubbles
  onAnswer?: (isAccepted: boolean, isReviewOn: boolean) => Promise<void> // absent on a device: the card says where to decide
}

/**
 * The duty a bot proposes, opened in the tray: why it is there, its objectives with their key results, what it leaves to
 * others, and the weekly review, which the user can switch before agreeing. Only the user's click changes the duty.
 */
export function DutyOfferCard({ offer, accent, onAnswer }: Props) {
  const words = strings().bot.duty
  const [isSending, setIsSending] = useState(false)
  const [isReviewOn, setIsReviewOn] = useState(offer.isReviewOn)
  const [error, setError] = useState<string | null>(null)
  const send = async (isAccepted: boolean) => {
    if (!onAnswer) return
    setIsSending(true)
    setError(null)
    try {
      await onAnswer(isAccepted, isReviewOn)
    } catch (failure) {
      setError(words.offer.failed(ipcErrorMessage(failure)))
    }
    setIsSending(false)
  }
  const { purpose, objectives, outOfScope } = offer.plan
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-5">
        <div className="max-w-[640px]">
          <small className="mb-1.5 block text-xs text-muted">{words.purpose}</small>
          <p className="rounded-lg bg-canvas px-4 py-3 text-md font-medium shadow-ring">{purpose}</p>
          <ol className="mt-5 flex flex-col gap-5">
            {objectives.map((objective, index) => (
              <ObjectiveItem key={objective.id} objective={objective} number={index + 1} accent={accent} />
            ))}
          </ol>
          {outOfScope.length > 0 && <Chips label={words.outOfScope} items={outOfScope} />}
          {offer.changes.length > 0 && <Chips label={words.offer.changes} items={offer.changes} />}
          <div className="mt-4 flex items-center gap-3 rounded-lg px-3.5 py-3 shadow-ring">
            <span className="flex min-w-0 flex-1 flex-col leading-[1.4]">
              <span className="text-md">{words.review}</span>
              <small className="text-sm text-soft">{isReviewOn ? words.reviewOn : words.reviewOff}</small>
            </span>
            {onAnswer && <Switch label={words.review} isOn={isReviewOn} onChange={setIsReviewOn} />}
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="px-6 pb-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex shrink-0 items-center gap-2 border-t border-line py-3 pr-3.5 pl-6">
        <small className="flex-1 text-xs text-muted">{strings().chat.asks.yoursToDecide}</small>
        {onAnswer ? (
          <>
            <AskButton accent={accent} isLarge disabled={isSending} onClick={() => send(false)}>
              {words.offer.decline}
            </AskButton>
            <AskButton accent={accent} isLarge isPrimary disabled={isSending} onClick={() => send(true)}>
              {words.offer.accept}
            </AskButton>
          </>
        ) : (
          <span className="text-sm text-muted">{words.offer.onComputer}</span>
        )}
      </div>
    </>
  )
}

/** One objective: its number in the user's colour, its name, and the key results that tell it is reached. */
function ObjectiveItem({ objective, number, accent }: { objective: Objective; number: number; accent?: string }) {
  const color = accent ?? 'var(--color-ink)'
  return (
    <li className="flex gap-3">
      <span
        style={{
          background: `color-mix(in srgb, ${color} 14%, var(--color-surface))`,
          color: `color-mix(in srgb, ${color} 80%, var(--color-ink))`,
        }}
        className="mt-px grid size-[22px] shrink-0 place-items-center rounded-full text-xs font-semibold"
      >
        {number}
      </span>
      <section aria-label={objective.name} className="min-w-0 flex-1">
        <h6 className="text-md font-semibold">{objective.name}</h6>
        <ul className="mt-2 flex flex-col gap-2.5">
          {objective.keyResults.map((keyResult) => (
            <li key={keyResult.text} className="flex gap-2 text-sm leading-normal">
              <span className="mt-0.5 text-muted">
                <Icon name="target" size={14} />
              </span>
              <span>
                {keyResult.text}
                <small className="block text-xs text-muted">
                  {keyResult.window} · {keyResult.source}
                </small>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </li>
  )
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-5 flex flex-wrap items-baseline gap-2 text-sm text-soft">
      <small className="text-xs text-muted">{label}</small>
      {items.map((item) => (
        <span key={item} className="rounded-full bg-bubble px-2.5 py-0.5 text-xs">
          {item}
        </span>
      ))}
    </div>
  )
}
