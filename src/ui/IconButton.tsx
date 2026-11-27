import type { MouseEvent } from 'react'
import { Icon, type IconName } from './Icon'

interface Props {
  icon: IconName
  label: string
  variant?: 'ghost' | 'raised' | 'solid'
  iconSize?: number
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  className?: string // where it sits, never how it looks
}

/** A round button holding one icon; `label` is what assistive tech reads. */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  iconSize,
  type = 'button',
  disabled,
  onClick,
  className = '',
}: Props) {
  return (
    <button
      type={type}
      aria-label={label}
      data-variant={variant}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-150 data-[variant=ghost]:text-soft data-[variant=ghost]:hover:text-ink data-[variant=raised]:bg-surface data-[variant=raised]:shadow-card data-[variant=solid]:bg-ink data-[variant=solid]:text-canvas data-[variant=solid]:disabled:bg-line data-[variant=solid]:disabled:text-muted/70 ${className}`}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  )
}
