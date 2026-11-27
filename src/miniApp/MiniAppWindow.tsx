import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { type RefObject, useRef, useState } from 'react'
import type { NengyongBotBridge } from '../../shared/bridge'
import { latestVersion, type MiniApp, MiniAppMessage } from '../../shared/miniApp'
import { dateLabel } from '../timeLabel'
import type { MiniAppData } from '../harnessState'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Icon, type IconName } from '../ui/Icon'
import { EASE_SHARP } from '../ui/motion'
import { saveFile } from '../ui/saveFile'
import { useFlash } from '../ui/useFlash'
import { useFrameMessages, usePostToFrame } from '../ui/useFrameMessages'
import { type Phase, type Rect, type Run, type RunEvent, runKey } from './miniAppRuns'
import { MenuSheet, VersionsSheet } from './MiniAppSheets'
import { MiniAppTile } from './MiniAppTile'
import { strings } from '../../shared/strings'

interface Props {
  run: Run
  app: MiniApp
  phase: Phase // never destroyed: a destroyed run has no window
  botName: string
  bridge: NengyongBotBridge
  isEditing: boolean // a task of its bot is changing it
  pushed: MiniAppData | undefined // the latest data a task put in
  dragArea: RefObject<HTMLElement | null>
  dockSlot: () => Rect | null // where minimizing shrinks it to
  dispatch: (event: RunEvent) => void
  onEditInChat: () => void
}

type Sheet = 'menu' | 'versions'

/**
 * One mini app's phone-sized window, kept mounted while it is minimized or closed so its page comes back as it was.
 * Its page is the bot's HTML in a sandboxed frame: it talks to the app only through the messages miniAppPage sets up.
 */
export function MiniAppWindow(props: Props) {
  const { run, app, phase, bridge, dispatch } = props
  const key = runKey(run)
  const isFront = phase === 'front'
  const latest = latestVersion(app).version
  // in the background a page stays on what it showed; it moves to the latest only when it comes to the front
  const shown = run.preview ?? (isFront || run.seenVersion === 0 ? latest : run.seenVersion)
  const src = bridge.miniAppUrl(run.botId, run.miniAppId, shown, null)
  const [loadedStart, setLoadedStart] = useState<number | null>(null)
  const [pageError, setPageError] = useState<{ src: string; message: string } | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [toast, flash] = useFlash<string>()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useDragControls()
  const words = strings().miniApp.window
  const fail = (message: (reason: string) => string) => (error: unknown) => flash(message(ipcErrorMessage(error)))
  const isLoading = loadedStart !== run.startedAt

  useFrameMessages(frameRef, (raw) => {
    const parsed = MiniAppMessage.safeParse(raw)
    if (!parsed.success) return
    const message = parsed.data
    switch (message.kind) {
      case 'save':
        return void bridge.saveMiniAppData(run.botId, run.miniAppId, message.data).catch(fail(words.saveFailed))
      case 'ask':
        // a page in the background cannot speak for the user
        if (!isFront) return
        return void bridge
          .askFromMiniApp(run.botId, run.miniAppId, message.text)
          .then(() => flash(words.sent), fail(words.sendFailed))
      case 'error':
        return setPageError({ src, message: message.message })
      default:
        return message satisfies never
    }
  })
  const isTakingData = phase === 'front' || phase === 'running'
  usePostToFrame(frameRef, isTakingData ? props.pushed?.dataAt : undefined, { kind: 'data', data: props.pushed?.data })

  const leave = (event: RunEvent) => {
    setSheet(null)
    dispatch(event)
  }
  const error = pageError?.src === src ? pageError.message : null

  return (
    <motion.div
      drag
      dragControls={drag}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={props.dragArea}
      ref={boxRef}
      data-hidden={!isFront || undefined}
      className="pointer-events-auto fixed top-[60px] right-[84px] z-40 h-[min(720px,calc(100vh-80px))] w-[375px] data-hidden:pointer-events-none max-sm:inset-0 max-sm:h-auto max-sm:w-auto"
    >
      <motion.section
        aria-label={app.name}
        aria-hidden={!isFront}
        inert={!isFront}
        custom={run.origin}
        variants={windowVariants(boxRef)}
        animate={isFront ? 'front' : run.status}
        className="relative flex size-full flex-col overflow-hidden rounded-xl bg-canvas shadow-modal max-sm:rounded-none"
      >
        <header
          onPointerDown={(event) => drag.start(event)}
          className="flex h-[52px] shrink-0 touch-none items-center gap-2 border-b border-line bg-surface pr-2.5 pl-3.5 select-none"
        >
          <MiniAppTile app={app} size={26} />
          <b className="min-w-0 truncate text-lg font-semibold">{app.name}</b>
          <span
            data-old={run.preview !== null || undefined}
            className="shrink-0 rounded-sm bg-bubble px-1.5 text-xs font-semibold text-soft tabular-nums data-old:bg-warning/15 data-old:text-warning"
          >
            v{shown}
          </span>
          {props.isEditing && (
            <span role="status" className="shimmer-text shrink-0 text-sm">
              {words.changing}
            </span>
          )}
          <Capsule
            onMenu={() => setSheet('menu')}
            onMinimize={() => leave({ kind: 'minimize', key, at: Date.now(), origin: props.dockSlot() })}
            onClose={() => leave({ kind: 'close', key, at: Date.now() })}
          />
        </header>
        {run.preview !== null && (
          <div className="flex shrink-0 items-center gap-1.5 border-b border-line bg-warning/10 py-1.5 pr-2 pl-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-soft">
              {words.previewing(shown, dateLabel(app.versions.find((each) => each.version === shown)?.at ?? 0))}
            </span>
            <button
              type="button"
              onClick={() =>
                bridge
                  .restoreMiniApp(run.botId, run.miniAppId, shown)
                  .then(() => dispatch({ kind: 'preview', key, version: null }), fail(words.restoreFailed))
              }
              className="h-[26px] shrink-0 rounded-sm bg-ink px-2 text-canvas"
            >
              {words.restore}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ kind: 'preview', key, version: null })}
              className="h-[26px] shrink-0 rounded-sm px-2"
            >
              {words.backTo(latest)}
            </button>
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          <iframe
            key={run.startedAt}
            ref={frameRef}
            title={app.name}
            src={src}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            onLoad={() => {
              setLoadedStart(run.startedAt)
              if (run.preview === null && run.seenVersion > 0 && shown > run.seenVersion) flash(words.updatedTo(shown))
              dispatch({ kind: 'loaded', key, version: shown })
            }}
            className="size-full bg-surface"
          />
          {error && (
            <div
              role="alert"
              className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-lg bg-ink py-2 pr-1.5 pl-3 text-sm text-canvas shadow-pop"
            >
              <span className="min-w-0 flex-1 truncate">{words.pageError(error)}</span>
              <button
                type="button"
                onClick={() =>
                  bridge
                    .askFromMiniApp(run.botId, run.miniAppId, words.fixRequest(app.name, shown, error))
                    .then(() => setPageError(null), fail(words.sendFailed))
                }
                className="h-7 shrink-0 rounded-sm bg-canvas/15 px-2"
              >
                {words.askFix}
              </button>
              <button
                type="button"
                aria-label={words.dismiss}
                onClick={() => setPageError(null)}
                className="grid size-7 shrink-0 place-items-center rounded-sm"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
        </div>
        <AnimatePresence>
          {isLoading && <LaunchScreen app={app} botName={props.botName} version={shown} />}
        </AnimatePresence>
        <AnimatePresence>
          {sheet === 'menu' && (
            <MenuSheet
              app={app}
              botName={props.botName}
              onEditInChat={() => {
                setSheet(null)
                props.onEditInChat()
              }}
              onVersions={() => setSheet('versions')}
              onRestart={() => leave({ kind: 'restart', key, at: Date.now() })}
              onExport={() => {
                setSheet(null)
                bridge.miniAppHtml(run.botId, run.miniAppId, shown).then(
                  // a page type would let a browser that ignores `download` open it on the app's origin
                  (html) =>
                    saveFile(new Blob([html], { type: 'application/octet-stream' }), `${app.name} v${shown}.html`),
                  fail(words.exportFailed),
                )
              }}
              onDelete={() => {
                setSheet(null)
                setIsDeleting(true)
              }}
              onClose={() => setSheet(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {sheet === 'versions' && (
            <VersionsSheet
              app={app}
              shown={shown}
              onPick={(version) => leave({ kind: 'preview', key, version: version === latest ? null : version })}
              onClose={() => setSheet(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="status"
              className="pointer-events-none absolute top-[42%] left-1/2 z-30 max-w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-md bg-ink/90 px-4 py-3 text-center text-md text-canvas"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
      <AnimatePresence>
        {isDeleting && (
          <ConfirmDialog
            title={words.deleteTitle(app.name)}
            body={words.deleteBody}
            confirmLabel={words.delete}
            onConfirm={() =>
              bridge
                .deleteMiniApp(run.botId, run.miniAppId)
                .then(
                  () => dispatch({ kind: 'forget', botId: run.botId, miniAppId: run.miniAppId }),
                  fail(words.deleteFailed),
                )
            }
            onClose={() => setIsDeleting(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** It grows out of what was clicked, shrinks into the dock when minimized, and fades when closed; hidden, its page lives on. */
function windowVariants(box: RefObject<HTMLDivElement | null>) {
  const towards = (origin: Rect | null) => {
    const frame = box.current?.getBoundingClientRect()
    if (!origin || !frame) return { x: 0, y: 16, scale: 0.94 }
    return {
      x: origin.x + origin.width / 2 - (frame.x + frame.width / 2),
      y: origin.y + origin.height / 2 - (frame.y + frame.height / 2),
      scale: Math.max(0.06, origin.width / frame.width),
    }
  }
  return {
    front: (origin: Rect | null) => {
      const from = towards(origin)
      return {
        visibility: 'visible' as const,
        opacity: [0, 1],
        x: [from.x, 0],
        y: [from.y, 0],
        scale: [from.scale, 1],
        transition: { duration: 0.36, ease: EASE_SHARP },
      }
    },
    docked: (origin: Rect | null) => ({
      ...towards(origin),
      opacity: 0,
      transition: { duration: 0.3, ease: EASE_SHARP },
      transitionEnd: { visibility: 'hidden' as const },
    }),
    closed: {
      opacity: 0,
      scale: 0.92,
      transition: { duration: 0.2 },
      transitionEnd: { visibility: 'hidden' as const },
    },
  }
}

interface CapsuleProps {
  onMenu: () => void
  onMinimize: () => void
  onClose: () => void
}

/** The window's buttons, top right, as a mini program has them: more, minimize to the dock, close. */
function Capsule({ onMenu, onMinimize, onClose }: CapsuleProps) {
  const words = strings().miniApp.window
  const buttons: { icon: IconName; label: string; onClick: () => void }[] = [
    { icon: 'more', label: words.more, onClick: onMenu },
    { icon: 'minimize', label: words.minimize, onClick: onMinimize },
    { icon: 'exit', label: words.close, onClick: onClose },
  ]
  return (
    <div className="ml-auto flex h-8 shrink-0 items-center rounded-full bg-surface shadow-ring">
      {buttons.map((button) => (
        <button
          key={button.icon}
          type="button"
          aria-label={button.label}
          title={button.label}
          onClick={button.onClick}
          className="relative grid h-8 w-10 place-items-center text-ink first:rounded-l-full last:rounded-r-full [&+&]:before:absolute [&+&]:before:inset-y-2 [&+&]:before:left-0 [&+&]:before:w-px [&+&]:before:bg-line"
        >
          <Icon name={button.icon} size={20} />
        </button>
      ))}
    </div>
  )
}

/** While a page starts from scratch: its icon in a spinning ring, its name, and who made it. */
function LaunchScreen({ app, botName, version }: { app: MiniApp; botName: string; version: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2, delay: 0.35 } }}
      className="absolute inset-x-0 top-[52px] bottom-0 z-10 flex flex-col items-center justify-center gap-3.5 bg-surface"
    >
      <span className="relative grid size-[84px] place-items-center">
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-line border-t-ink" />
        <MiniAppTile app={app} size={56} />
      </span>
      <b className="text-lg font-semibold">{app.name}</b>
      <small className="absolute bottom-6 text-xs text-muted">
        {strings().miniApp.window.madeBy(botName, version)}
      </small>
    </motion.div>
  )
}
