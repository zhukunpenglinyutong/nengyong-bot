import { motion, useIsPresent } from 'motion/react'
import type { ReactNode } from 'react'
import { BotAvatar } from '../bot/BotAvatar'
import { Icon } from '../ui/Icon'
import { POP } from '../ui/motion'
import type { MentionCandidate } from './mentionCandidates'
import { strings } from '../../shared/strings'

interface Props {
  id: string
  candidates: MentionCandidate[]
  activeIndex: number
  onHover: (index: number) => void
  onPick: (candidate: MentionCandidate) => void
}

/** What an @ offers, above the message box: the bots, name on the left and sidebar group on the right, then the plus menu's actions; the pointer moves the highlight. */
export function MentionMenu({ id, candidates, activeIndex, onHover, onPick }: Props) {
  const isClosing = !useIsPresent()
  return (
    <motion.div
      id={id}
      role="listbox"
      aria-label={strings().chat.mention.menu}
      {...POP}
      inert={isClosing}
      style={{ transformOrigin: 'bottom left' }}
      className="absolute bottom-full left-9 z-10 mb-2 max-h-[320px] w-[300px] overflow-y-auto rounded-xl bg-surface p-1.5 text-md shadow-pop"
    >
      {candidates.length === 0 && <div className="px-3 py-2 text-muted">{strings().chat.mention.noMatch}</div>}
      {candidates.map(rowOf).map((row, index) => (
        <button
          key={row.key}
          id={mentionOptionId(id, index)}
          type="button"
          role="option"
          tabIndex={-1}
          aria-selected={index === activeIndex}
          onPointerMove={() => onHover(index)}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            // the default would move focus to the button, and the message box would lose its caret
            event.preventDefault()
            onPick(row.candidate)
          }}
          className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-left"
        >
          {row.picture}
          <span className="min-w-0 flex-1 truncate">{row.name}</span>
          {row.side && <span className="max-w-[40%] shrink-0 truncate text-muted">{row.side}</span>}
        </button>
      ))}
    </motion.div>
  )
}

function rowOf(candidate: MentionCandidate): {
  candidate: MentionCandidate
  key: string
  picture: ReactNode
  name: string
  side?: string
} {
  switch (candidate.kind) {
    case 'bot':
      return {
        candidate,
        key: candidate.bot.id,
        picture: <BotAvatar bot={candidate.bot} size={20} />,
        name: candidate.bot.name,
        side: candidate.group,
      }
    case 'action':
      return {
        candidate,
        key: `${candidate.label}/${candidate.detail ?? ''}`,
        picture: (
          <span className="grid size-5 shrink-0 place-items-center text-soft">
            {candidate.icon && <Icon name={candidate.icon} />}
          </span>
        ),
        name: candidate.label,
        side: candidate.detail,
      }
    default:
      return candidate satisfies never
  }
}

export const mentionOptionId = (menuId: string, index: number) => `${menuId}-${index}`
