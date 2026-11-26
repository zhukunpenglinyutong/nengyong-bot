import { motion } from 'motion/react'
import type { MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import type { Theme } from '../preferences'
import { Icon } from './Icon'
import { SPRING } from './motion'
import { strings } from '../../shared/strings'

const REVEAL_MS = 560
const REVEAL_EASE = 'cubic-bezier(0.165, 0.84, 0.44, 1)'
const SHOWN = { opacity: 1, rotate: 0, scale: 1 }
const SUN_GONE = { opacity: 0, rotate: 90, scale: 0.4 }
const MOON_GONE = { opacity: 0, rotate: -90, scale: 0.4 }

interface Props {
  theme: Theme
  onChange: (theme: Theme) => void
}

/** A sun in light mode, a moon in dark: one click flips the theme, the new colours spreading out from the button. */
export function ThemeToggle({ theme, onChange }: Props) {
  const isDark = theme === 'dark'

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    revealFrom(event.currentTarget, () => onChange(isDark ? 'light' : 'dark'))
  }

  return (
    <button
      type="button"
      aria-label={strings().ui.darkMode}
      aria-pressed={isDark}
      title={isDark ? strings().ui.switchToLight : strings().ui.switchToDark}
      onClick={toggle}
      className="grid size-[30px] place-items-center rounded-full text-soft transition-colors duration-150 hover:text-ink"
    >
      <motion.span
        initial={false}
        animate={isDark ? SUN_GONE : SHOWN}
        transition={SPRING}
        className="col-start-1 row-start-1"
      >
        <Icon name="sun" />
      </motion.span>
      <motion.span
        initial={false}
        animate={isDark ? SHOWN : MOON_GONE}
        transition={SPRING}
        className="col-start-1 row-start-1"
      >
        <Icon name="moon" />
      </motion.span>
    </button>
  )
}

function revealFrom(button: HTMLElement, apply: () => void) {
  if (!('startViewTransition' in document) || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply()
  const box = button.getBoundingClientRect()
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  // flushSync: the browser snapshots the new look as soon as this callback returns, so the theme must be on <html> by then
  const transition = document.startViewTransition(() => flushSync(apply))
  transition.ready
    .then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_MS, easing: REVEAL_EASE, pseudoElement: '::view-transition-new(root)' },
      ),
    )
    .catch(() => {}) // skipped, e.g. by a second click mid-reveal: the theme is already applied, only the animation is lost
}
