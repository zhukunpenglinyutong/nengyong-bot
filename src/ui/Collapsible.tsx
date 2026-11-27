import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { EASE_PANEL } from './motion'

/** Content that grows open and folds shut, pushing what is below it along. */
export function Collapsible({ isOpen, children }: { isOpen: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_PANEL }}
          className="overflow-clip"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
