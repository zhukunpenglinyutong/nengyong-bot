import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'
import { IconButton } from '../ui/IconButton'
import { timeLabel } from '../timeLabel'
import { strings } from '../../shared/strings'

interface Props {
  text: string
  model?: string // what wrote a reply
  fallbackFrom?: string // the model the reply was set to, which `model`, the main one, stood in for
  at?: number // when a reply was written
  requestId?: string
  onQuote: () => void
  onStartSelection: () => void
  onDelete: () => void
  className: string // where it sits, never how it looks
}

/**
 * What a message offers while hovered or focused: reply to it; from the menu, copy it or the id of the API call that
 * wrote it, pick it and more in selection mode, read which model wrote a reply and when, or delete it.
 */
export function MessageActions(props: Props) {
  const words = strings().chat.actions
  const { text, model, fallbackFrom, at, requestId, onQuote, onStartSelection, onDelete, className } = props
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const copyId: MenuEntry[] = requestId ? [{ label: words.copyRequestId, icon: 'copy', copy: requestId }] : []
  const writer = fallbackFrom ? [words.unreachable(fallbackFrom), words.writtenBy(model ?? '')] : model ? [model] : []
  const written = [...writer, ...(at === undefined ? [] : [words.writtenAt(timeLabel(at))])]
  const writtenNote: MenuEntry[] = written.length ? ['separator', { note: written }] : []
  const items: MenuEntry[] = [
    { label: words.copy, icon: 'copy', copy: text },
    ...copyId,
    { label: words.select, icon: 'select', onSelect: onStartSelection },
    ...writtenNote,
    'separator',
    { label: words.delete, icon: 'trash', danger: true, onSelect: onDelete },
  ]

  return (
    <div
      role="toolbar"
      aria-label={words.label}
      data-open={menuAt !== null || undefined}
      className={`flex opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 data-open:opacity-100 ${className}`}
    >
      <IconButton icon="reply" label={words.reply} onClick={onQuote} />
      <IconButton
        icon="more"
        label={words.more}
        onClick={(event) => {
          const { left, bottom } = event.currentTarget.getBoundingClientRect()
          setMenuAt({ x: left, y: bottom + 4 })
        }}
      />
      <AnimatePresence>
        {menuAt && (
          <ContextMenu
            key={`${menuAt.x},${menuAt.y}`}
            x={menuAt.x}
            y={menuAt.y}
            items={items}
            label={words.menu}
            onClose={() => setMenuAt(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
