import { AnimatePresence } from 'motion/react'
import { z } from 'zod'
import { Dialog } from '../ui/Dialog'
import { usePersistentState } from '../ui/usePersistentState'
import { strings } from '../../shared/strings'

const Seen = z.boolean().catch(false)

export function DemoDisclaimer() {
  const [isSeen, setIsSeen] = usePersistentState('demoDisclaimerSeen', Seen)
  const words = strings().demo.disclaimer
  return (
    <>
      <p className="shrink-0 bg-warning px-4 py-1.5 text-center text-sm font-medium text-black">{words.banner}</p>
      <AnimatePresence>
        {!isSeen && (
          <Dialog
            labelledBy="demo-disclaimer-title"
            onClose={() => setIsSeen(true)}
            className="w-[400px] rounded-xl bg-surface p-6"
          >
            <h2 id="demo-disclaimer-title" className="text-lg font-semibold">
              {words.title}
            </h2>
            <p className="mt-2 text-md leading-relaxed text-soft">{words.body}</p>
            <div className="mt-5 flex justify-end">
              <button
                autoFocus
                onClick={() => setIsSeen(true)}
                className="h-9 rounded-full bg-ink px-4 text-md text-canvas"
              >
                {words.understood}
              </button>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  )
}
