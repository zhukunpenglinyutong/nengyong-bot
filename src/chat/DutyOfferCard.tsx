import { useState } from 'react'
import type { DutyOffer } from '../../shared/duty'
import { strings } from '../../shared/strings'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { Button, PrimaryButton } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Switch } from '../ui/Switch'

interface Props {
  offer: DutyOffer
  botName: string // whose duty it is
  isAgreed: boolean | null // the answer the chat has recorded; null: none yet
  isReplaced: boolean // a later card for the same bot came, so this one can no longer be answered
  onAnswer?: (isAccepted: boolean, isReviewOn: boolean) => Promise<void> // absent on a device: the card says where to decide
}

type Answer = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; isAccepted: boolean }

/**
 * The duty a bot proposes, whole: why it is there, its objectives with their key results, what it leaves to others, and
 * the weekly review, which the user can switch before agreeing. Only the user's click changes the duty; once answered,
 * the card folds into one line.
 */
export function DutyOfferCard({ offer, botName, isAgreed, isReplaced, onAnswer }: Props) {
  const words = strings().bot.duty
  const [answer, setAnswer] = useState<Answer>({ kind: 'idle' })
  const [isReviewOn, setIsReviewOn] = useState(offer.isReviewOn)
  const [error, setError] = useState<string | null>(null)
  const version = offer.baseVersion + 1
  // the answer reaches the chat with the bot's next turn, which may wait for the running one: until then the click says it
  const answered = isAgreed ?? (answer.kind === 'sent' ? answer.isAccepted : null)
  if (answered !== null)
    return (
      <Line icon={answered ? 'check' : 'close'} text={answered ? words.offer.agreed(version) : words.offer.declined} />
    )
  if (isReplaced) return <Line icon="close" text={words.offer.void} />
  const send = async (isAccepted: boolean) => {
    if (!onAnswer) return
    setAnswer({ kind: 'sending' })
    setError(null)
    try {
      await onAnswer(isAccepted, isReviewOn)
      setAnswer({ kind: 'sent', isAccepted })
    } catch (failure) {
      setAnswer({ kind: 'idle' })
      setError(words.offer.failed(ipcErrorMessage(failure)))
    }
  }
  const { purpose, objectives, outOfScope } = offer.plan
  return (
    <div className="w-[450px] max-w-full overflow-hidden rounded-xl bg-surface shadow-ring">
      <p className="flex items-center gap-1.5 bg-bubble px-3.5 py-2 text-sm text-soft">
        <Icon name="target" size={15} />
        {words.offer.title(botName, version)}
      </p>
      <div className="px-3.5 pt-3">
        <small className="text-xs text-muted">{words.purpose}</small>
        <p className="mb-2.5 text-md font-medium text-ink">{purpose}</p>
        {objectives.map((objective, index) => (
          <section key={objective.id} aria-label={objective.name} className="border-t border-line py-2.5">
            <h6 className="flex items-baseline gap-1.5 text-md font-medium text-ink">
              <small className="text-xs font-normal text-muted">{words.objective(index + 1)}</small>
              {objective.name}
            </h6>
            <ul className="mt-1 flex flex-col gap-1.5">
              {objective.keyResults.map((keyResult) => (
                <li key={keyResult.text} className="flex gap-1.5 text-sm leading-[1.45] text-ink">
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
        ))}
        {outOfScope.length > 0 && (
          <div className="border-t border-line py-2.5 text-sm text-soft">
            <small className="block text-xs text-muted">{words.outOfScope}</small>
            <ul className="list-disc pl-4">
              {outOfScope.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {offer.changes.length > 0 && (
          <div className="border-t border-line py-2.5 text-sm text-soft">
            <small className="block text-xs text-muted">{words.offer.changes}</small>
            <ul className="list-disc pl-4">
              {offer.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-line px-3.5 py-2.5">
        <span className="flex min-w-0 flex-1 flex-col leading-[1.4]">
          <span className="text-md text-ink">{words.review}</span>
          <small className="text-sm text-soft">{isReviewOn ? words.reviewOn : words.reviewOff}</small>
        </span>
        {onAnswer && <Switch label={words.review} isOn={isReviewOn} onChange={setIsReviewOn} />}
      </div>
      {error && (
        <p role="alert" className="px-3.5 pb-1 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 border-t border-line px-3.5 py-3">
        {onAnswer ? (
          <>
            <Button disabled={answer.kind === 'sending'} onClick={() => send(false)}>
              {words.offer.decline}
            </Button>
            <PrimaryButton disabled={answer.kind === 'sending'} onClick={() => send(true)}>
              {words.offer.accept}
            </PrimaryButton>
          </>
        ) : (
          <span className="text-sm text-muted">{words.offer.onComputer}</span>
        )}
      </div>
    </div>
  )
}

function Line({ icon, text }: { icon: 'check' | 'close'; text: string }) {
  return (
    <p className="flex w-fit max-w-full items-center gap-2 rounded-xl bg-surface px-3.5 py-2.5 text-sm text-muted shadow-ring">
      <Icon name={icon} size={15} />
      {text}
    </p>
  )
}
