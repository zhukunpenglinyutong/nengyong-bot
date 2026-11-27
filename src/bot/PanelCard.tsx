import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Icon } from '../ui/Icon'
import { SPRING } from '../ui/motion'

/** The white box the panel groups its rows in. */
export const PanelCard = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-lg bg-surface shadow-ring ${className}`}>{children}</div>
)

export const PanelEmpty = ({ children }: { children: ReactNode }) => (
  <p className="py-10 text-center text-sm text-muted">{children}</p>
)

export const PanelSectionTitle = ({ children }: { children: ReactNode }) => (
  <h5 className="pt-[18px] pb-2 text-md text-soft">{children}</h5>
)

/** The row under a list that starts a new one in the chat: a plus, what it makes and how. */
export function PanelAddRow({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2.5 flex w-full items-center gap-3 rounded-lg p-3 text-left leading-[1.35] text-soft shadow-ring"
    >
      <Icon name="plus" size={20} />
      <span className="flex flex-col">
        <span className="text-md">{title}</span>
        <small className="text-sm text-muted">{hint}</small>
      </span>
    </button>
  )
}

interface PillProps {
  isOn: boolean
  onClick: () => void
  children: ReactNode
}

/** One of a row of choices; the dark background slides to the one picked, within the row's LayoutGroup. */
export function Pill({ isOn, onClick, children }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isOn}
      className="relative inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full bg-bubble px-3 text-sm text-soft transition-colors duration-150 aria-pressed:text-canvas"
    >
      {isOn && <motion.span layoutId="pill-bg" transition={SPRING} className="absolute inset-0 rounded-full bg-ink" />}
      <span className="relative inline-flex items-center gap-1.5">{children}</span>
    </button>
  )
}
