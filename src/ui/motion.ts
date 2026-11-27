// Easings and timings for motion/react. CSS animations take theirs from @theme in index.css.
export const EASE_PANEL = [0.23, 1, 0.32, 1] as const
export const EASE_SHARP = [0.165, 0.84, 0.44, 1] as const
export const EASE_SWIFT = [0.2, 0, 0, 1] as const // menus popping in, the avatar's happy spin
export const PANEL_TRANSITION = { duration: 0.3, ease: EASE_PANEL } as const // the sidebar and the right panel changing width
// a message or a row joining a list: slides up a little as it fades in
export const ENTER = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: EASE_SHARP },
} as const
// a menu or popover: pops in, fades back out; its owner renders it inside an AnimatePresence
export const POP = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { duration: 0.12, ease: EASE_SWIFT },
} as const
export const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0.2 } as const
