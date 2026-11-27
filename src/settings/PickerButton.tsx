import { AnimatePresence } from 'motion/react'
import { type MouseEvent, type ReactNode, useState } from 'react'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'
import { Icon } from '../ui/Icon'
import { strings } from '../../shared/strings'

interface Props {
  menuLabel: string
  items: MenuEntry[] // what the open menu lists; it follows them as they change
  onOpen?: () => void // starts reading what the menu lists, which then fills in as each part arrives
  children: ReactNode // the value it is set to
}

/** The value at the right end of a settings row; pressing it opens a menu of what else it can be. */
export function PickerButton({ menuLabel, items, onOpen, children }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const open = (event: MouseEvent<HTMLButtonElement>) => {
    const { left, bottom } = event.currentTarget.getBoundingClientRect()
    onOpen?.()
    setMenu({ x: left, y: bottom + 4 })
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={open}
        className="flex h-9 max-w-[260px] shrink-0 items-center gap-2 rounded-md border border-line bg-surface pr-2.5 pl-2 text-sm"
      >
        {children}
        <span className="text-muted">
          <Icon name="down" size={14} />
        </span>
      </button>
      <AnimatePresence>
        {menu && (
          <ContextMenu
            key={`${menu.x},${menu.y}`}
            x={menu.x}
            y={menu.y}
            items={items}
            label={menuLabel}
            onClose={() => setMenu(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

/** The menu of a setting that is not built yet: pressing its picker says so. */
export const COMING_SOON: MenuEntry[] = [{ label: strings().models.picker.comingSoon, icon: 'clock' }]
