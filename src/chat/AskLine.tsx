import type { Ask } from '../../shared/decisions'
import { strings } from '../../shared/strings'
import { Icon } from '../ui/Icon'
import { ASK_KINDS, askTitle } from './askLabels'
import type { AskOutcome } from './chatMessages'
import { useMentions } from './MentionContext'

interface Props {
  ask: Ask
  outcome: AskOutcome | null // null while it waits on the user
  onOpen: () => void // shows it in the tray above the message box
}

/** Where a card or a question sits in the chat: one line that opens it in the tray, then what became of it. */
export function AskLine({ ask, outcome, onOpen }: Props) {
  const { bots } = useMentions()
  if (outcome)
    return (
      <p className="flex w-fit max-w-full items-center gap-2 rounded-xl bg-surface px-3.5 py-2.5 text-sm text-muted shadow-ring">
        <Icon name={outcome.isYes ? 'check' : 'close'} size={15} />
        {outcome.text}
      </p>
    )
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-fit max-w-full items-center gap-1.5 rounded-full bg-accent/7 py-1 pr-3 pl-1 text-left text-sm text-accent ring-1 ring-accent/20 ring-inset"
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/12">
        <Icon name={ASK_KINDS[ask.kind].icon} size={14} />
      </span>
      <span className="min-w-0 truncate">{askTitle(ask, bots)}</span>
      <span className="shrink-0 text-muted">· {strings().chat.asks.waiting}</span>
    </button>
  )
}
