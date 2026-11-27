import type { ComponentProps, ReactNode } from 'react'
import { Icon } from '../ui/Icon'
import { MenuButton } from '../ui/MenuButton'

interface Props extends Pick<ComponentProps<typeof MenuButton>, 'menuLabel' | 'items' | 'onOpen'> {
  children: ReactNode // the value it is set to
}

/** The value at the right end of a settings row; pressing it opens a menu of what else it can be. */
export function PickerButton({ children, ...menu }: Props) {
  return (
    <MenuButton
      {...menu}
      className="flex h-9 max-w-[260px] shrink-0 items-center gap-2 rounded-md border border-line bg-surface pr-2.5 pl-2 text-sm"
    >
      {children}
      <span className="text-muted">
        <Icon name="down" size={14} />
      </span>
    </MenuButton>
  )
}
