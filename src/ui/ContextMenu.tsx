import { type KeyboardEvent, type ReactNode, useEffect, useEffectEvent, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useIsPresent } from 'motion/react'
import { Icon, type IconName } from './Icon'
import { POP } from './motion'
import { useAutoDismiss } from './useAutoDismiss'
import { type ElementSize, useElementSize } from './useElementSize'
import { COPIED_LABEL, useCopy } from './useCopy'

export interface MenuItem {
  label: string
  icon?: IconName // a list of plain choices, such as model names, goes without
  onSelect?: () => void
  copy?: string // copied instead of onSelect; the item says 已复制 before the menu closes
  disabled?: boolean
  danger?: boolean
  checked?: boolean
  detail?: string
  submenu?: MenuEntry[]
}

/** Lines of plain text between the items, such as when a message was written: never focused or pressed. */
interface MenuNote {
  note: string[]
}

export type MenuEntry = MenuItem | MenuNote | 'separator'

export const isItem = (entry: MenuEntry): entry is MenuItem => entry !== 'separator' && !('note' in entry)

const EDGE = 8
const COPIED_LINGER_MS = 700

interface PanelProps {
  items: MenuEntry[]
  label: string
  /** Where to open: a point (right-click) or the item a submenu hangs off. */
  at: { kind: 'point'; x: number; y: number; aboveY?: number } | { kind: 'anchor'; rect: DOMRect }
  onCloseAll: () => void
  onBack?: () => void
  header?: ReactNode
  /** Shown as a row of tiles above the items; arrow keys walk them before the items. */
  tiles?: MenuItem[]
}

function MenuPanel({ items, label, at, onCloseAll, onBack, header, tiles = [] }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [open, setOpen] = useState<{ index: number; rect: DOMRect } | null>(null)
  const [copied, copy] = useCopy()
  const [copiedIndex, setCopiedIndex] = useState<number>()
  useAutoDismiss(copiedIndex, COPIED_LINGER_MS, onCloseAll)
  const isClosing = !useIsPresent()
  const entries = [...tiles, ...items]
  const enabled = entries.flatMap((item, i) => (isItem(item) && !item.disabled ? [i] : []))

  const pos = placeOf(at, useElementSize(ref))

  const firstEnabled = enabled[0]
  useEffect(() => itemRefs.current[firstEnabled]?.focus(), [firstEnabled])

  const openSub = (i: number) => {
    const item = entries[i]
    const el = itemRefs.current[i]
    if (el && isItem(item) && item.submenu) setOpen({ index: i, rect: el.getBoundingClientRect() })
  }
  const activate = (i: number) => {
    const item = entries[i]
    if (!isItem(item) || item.disabled) return
    if (item.submenu) return openSub(i)
    if (item.copy !== undefined) {
      setCopiedIndex(i)
      return copy(item.copy)
    }
    onCloseAll()
    item.onSelect?.()
  }
  const focusStep = (from: number, step: number) => {
    const at = enabled.indexOf(from)
    const next = enabled[(at + step + enabled.length) % enabled.length]
    itemRefs.current[next]?.focus()
  }
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const isTile = i < tiles.length
    const keys: Record<string, () => void> = {
      ArrowDown: () => focusStep(i, 1),
      ArrowUp: () => focusStep(i, -1),
      Home: () => itemRefs.current[enabled[0]]?.focus(),
      End: () => focusStep(enabled[0], -1), // one step back from the first wraps to the last
      Enter: () => activate(i),
      ' ': () => activate(i),
      ArrowRight: () => (isTile ? focusStep(i, 1) : openSub(i)),
      ArrowLeft: () => (isTile ? focusStep(i, -1) : onBack?.()),
      Escape: () => (onBack ?? onCloseAll)(),
      Tab: onCloseAll,
    }
    const run = keys[e.key]
    if (!run) return
    e.preventDefault()
    e.stopPropagation()
    run()
  }

  const copiedAt = (i: number) => (i === copiedIndex ? copied : undefined)
  const labelOf = (item: MenuItem, i: number) => {
    const result = copiedAt(i)
    return result ? COPIED_LABEL[result] : item.label
  }
  const iconOf = (item: MenuItem, i: number) => (copiedAt(i) === 'done' ? 'check' : item.icon)
  const iconAt = (item: MenuItem, i: number) => {
    const name = iconOf(item, i)
    return name && <Icon name={name} />
  }

  const itemProps = (item: MenuItem, i: number) => ({
    ref: (el: HTMLButtonElement | null) => {
      itemRefs.current[i] = el
    },
    role: item.checked === undefined ? 'menuitem' : 'menuitemcheckbox',
    'aria-checked': item.checked,
    'aria-disabled': item.disabled || undefined,
    'data-danger': item.danger || undefined,
    'data-copied': copiedAt(i),
    'aria-haspopup': item.submenu ? ('menu' as const) : undefined,
    'aria-expanded': item.submenu ? open?.index === i : undefined,
    tabIndex: -1,
    onClick: () => activate(i),
    onKeyDown: (e: KeyboardEvent) => onKeyDown(e, i),
    onPointerEnter: () => {
      if (item.disabled) return
      itemRefs.current[i]?.focus()
      if (item.submenu) openSub(i)
      else setOpen(null)
    },
  })

  const opened = open && entries[open.index]
  return (
    <>
      <motion.div
        ref={ref}
        role="menu"
        aria-label={label}
        data-menu=""
        {...POP}
        inert={isClosing}
        style={{ ...pos, transformOrigin: 'top left' }}
        className="fixed z-50 max-h-[calc(100vh-16px)] min-w-[180px] overflow-y-auto rounded-xl bg-surface p-1.5 shadow-pop"
        onContextMenu={(e) => e.preventDefault()}
      >
        {header}
        {tiles.length > 0 && (
          <div role="group" className="mb-1.5 grid w-[250px] grid-cols-4 gap-1.5">
            {tiles.map((tile, i) => (
              <button
                key={tile.label}
                {...itemProps(tile, i)}
                className="flex h-[58px] flex-col items-center justify-center gap-0.5 rounded-md bg-bubble text-xs text-soft outline-none aria-checked:bg-accent/12 aria-checked:text-accent aria-disabled:opacity-35 data-[copied=done]:text-accent data-[copied=failed]:text-danger"
              >
                {iconAt(tile, i)}
                {labelOf(tile, i)}
              </button>
            ))}
          </div>
        )}
        {items.map((item, index) => {
          if (item === 'separator')
            return <div key={`sep${index}`} role="separator" className="mx-3 my-1.5 h-px bg-line" />
          if (!isItem(item))
            return (
              <div key={`note${index}`} className="max-w-60 px-3 py-1 text-xs text-muted">
                {item.note.map((line) => (
                  <p key={line} className="truncate">
                    {line}
                  </p>
                ))}
              </div>
            )
          return (
            <button
              key={`${index}:${item.label}`}
              {...itemProps(item, tiles.length + index)}
              className="group flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-md whitespace-nowrap text-ink outline-none aria-disabled:opacity-35 aria-expanded:bg-bubble data-danger:text-danger data-[copied=done]:text-accent data-[copied=failed]:text-danger"
            >
              {iconOf(item, tiles.length + index) && (
                <span className="text-soft group-data-danger:text-danger group-data-[copied=done]:text-accent group-data-[copied=failed]:text-danger">
                  {iconAt(item, tiles.length + index)}
                </span>
              )}
              <span className="flex-1">{labelOf(item, tiles.length + index)}</span>
              {item.detail && (
                <span aria-hidden="true" className="max-w-28 truncate text-sm text-muted">
                  {item.detail}
                </span>
              )}
              {item.checked && <Icon name="check" size={16} />}
              {item.submenu && (
                <span className="text-muted">
                  <Icon name="chevron" size={16} />
                </span>
              )}
            </button>
          )
        })}
      </motion.div>
      {open && opened && isItem(opened) && opened.submenu && (
        <MenuPanel
          items={opened.submenu}
          label={opened.label}
          at={{ kind: 'anchor', rect: open.rect }}
          onCloseAll={onCloseAll}
          onBack={() => {
            const index = open.index
            setOpen(null)
            itemRefs.current[index]?.focus()
          }}
        />
      )}
    </>
  )
}

/** Where a panel of `size` stays inside the viewport; submenus flip to the left of their parent when there is no room. */
function placeOf(at: PanelProps['at'], size: ElementSize | null): { left: number; top: number } {
  const isSub = at.kind === 'anchor'
  const left = isSub ? at.rect.right + 4 : at.x
  const top = isSub ? at.rect.top - 6 : at.y
  if (!size) return { left, top }
  const fitsRight = left + size.width <= window.innerWidth - EDGE
  const flipped = isSub ? at.rect.left - size.width - 4 : window.innerWidth - size.width - EDGE
  const fitsBelow = top + size.height <= window.innerHeight - EDGE
  const above = !isSub && at.aboveY !== undefined && !fitsBelow ? at.aboveY - size.height : top
  return {
    left: Math.max(EDGE, fitsRight ? left : flipped),
    top: Math.max(EDGE, Math.min(above, window.innerHeight - size.height - EDGE)),
  }
}

interface Props {
  x: number
  y: number
  aboveY?: number // where its bottom goes when there is no room under y, as for a button low in the window: its top
  items: MenuEntry[]
  label: string
  header?: ReactNode
  tiles?: MenuItem[]
  onClose: () => void
}

/**
 * Right-click menu: closes on outside press, scroll, resize or window blur, and hands focus back to its trigger.
 * Its owner renders it inside an AnimatePresence, keyed by where it opens, so it fades out while a new one opens.
 */
export function ContextMenu({ x, y, aboveY, items, label, header, tiles, onClose }: Props) {
  const opener = useRef<Element | null>(document.activeElement)
  const [at] = useState({ kind: 'point' as const, x, y, aboveY })
  const closeLatest = useEffectEvent(onClose)
  const isPresent = useIsPresent()

  useEffect(() => {
    if (!isPresent) return
    const trigger = opener.current
    const close = () => closeLatest()
    const outside = (e: Event) => {
      if (!(e.target instanceof Element && e.target.closest('[data-menu]'))) close()
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('scroll', outside, true) // a long menu scrolls itself without closing
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('scroll', outside, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      if (trigger instanceof HTMLElement && document.contains(trigger)) trigger.focus({ preventScroll: true })
    }
  }, [isPresent])

  return createPortal(
    <MenuPanel items={items} label={label} header={header} tiles={tiles} at={at} onCloseAll={onClose} />,
    // a modal <dialog> makes everything outside it inert, so a menu opened from one has to live inside it
    opener.current?.closest('dialog') ?? document.body,
  )
}
