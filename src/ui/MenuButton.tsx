import { AnimatePresence } from 'motion/react'
import { type ComponentProps, useState } from 'react'
import { ContextMenu, type MenuEntry } from './ContextMenu'

const MENU_GAP_PX = 4

interface Props extends Omit<ComponentProps<'button'>, 'onClick'> {
  menuLabel: string
  items: MenuEntry[] // what the open menu lists; it follows them as they change
  onOpen?: () => void // starts reading what the menu lists, which then fills in as each part arrives
}

/** A button that opens a menu just under itself. */
export function MenuButton({ menuLabel, items, onOpen, ...button }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        {...button}
        onClick={(event) => {
          const { left, bottom } = event.currentTarget.getBoundingClientRect()
          onOpen?.()
          setMenu({ x: left, y: bottom + MENU_GAP_PX })
        }}
      />
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
