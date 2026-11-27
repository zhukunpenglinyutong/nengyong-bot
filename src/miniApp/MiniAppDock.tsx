import { AnimatePresence, motion } from 'motion/react'
import type { RefObject } from 'react'
import { latestVersion, type MiniApp } from '../../shared/miniApp'
import { IconButton } from '../ui/IconButton'
import { type Run, runKey } from './miniAppRuns'
import { MiniAppTile } from './MiniAppTile'
import { runStatus } from './runStatus'
import { strings } from '../../shared/strings'

interface Props {
  docked: { run: Run; app: MiniApp }[] // the latest minimized first
  now: number
  dockRef: RefObject<HTMLDivElement | null>
  onOpen: (run: Run, from: Element) => void
  onClose: (run: Run) => void
}

/** 浮窗: one icon per minimized mini app on the window's right edge; greyed once suspended, a dot when a new version waits. */
export function MiniAppDock({ docked, now, dockRef, onOpen, onClose }: Props) {
  const words = strings().miniApp.dock
  return (
    <div
      ref={dockRef}
      role="toolbar"
      aria-label={words.title}
      aria-orientation="vertical"
      data-empty={docked.length === 0 || undefined}
      className="fixed top-[34%] right-0 z-50 flex flex-col gap-1.5 rounded-l-2xl bg-surface/90 py-2 pr-2 pl-2.5 shadow-pop backdrop-blur-md data-empty:invisible"
    >
      <AnimatePresence initial={false}>
        {docked.map(({ run, app }) => {
          const latest = latestVersion(app).version
          const status = runStatus(run, latest, now)
          return (
            <motion.div
              key={runKey(run)}
              layout
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.3 }}
              data-status={status?.kind}
              className="group relative flex"
            >
              <button
                type="button"
                aria-label={words.app(app.name, latest, status?.text ?? '')}
                onClick={(event) => onOpen(run, event.currentTarget)}
                className="relative flex rounded-lg"
              >
                <span className="flex transition-[filter] group-data-[status=suspended]:grayscale">
                  <MiniAppTile app={app} size={38} />
                </span>
                {status?.kind === 'update' && (
                  <span className="absolute -right-0.5 -bottom-0.5 size-[11px] rounded-full bg-accent ring-2 ring-surface" />
                )}
              </button>
              <div className="pointer-events-none absolute top-1/2 right-full translate-x-1.5 -translate-y-1/2 pr-2.5 opacity-0 transition group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100">
                <div className="flex items-center gap-2.5 rounded-lg bg-surface py-1.5 pr-1.5 pl-3 whitespace-nowrap shadow-pop">
                  <span className="flex flex-col leading-snug">
                    <b className="text-md font-semibold">
                      {app.name}
                      <span className="ml-1 text-xs font-semibold text-muted">v{latest}</span>
                    </b>
                    <small data-status={status?.kind} className="text-xs text-muted data-[status=update]:text-accent">
                      {status?.text}
                    </small>
                  </span>
                  <IconButton
                    icon="close"
                    label={words.closeApp(app.name)}
                    iconSize={14}
                    onClick={() => onClose(run)}
                  />
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
