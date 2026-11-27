import { motion, useIsPresent } from 'motion/react'
import type { ReactNode } from 'react'
import { latestVersion, type MiniApp } from '../../shared/miniApp'
import { dateLabel } from '../timeLabel'
import { Icon, type IconName } from '../ui/Icon'
import { EASE_SHARP } from '../ui/motion'
import { MiniAppTile } from './MiniAppTile'
import { strings } from '../../shared/strings'

interface SheetProps {
  label: string
  onClose: () => void
  children: ReactNode
}

/** A sheet rising from the bottom of a mini app's window over a dimmed page, as a phone shows one. */
function Sheet({ label, onClose, children }: SheetProps) {
  const words = strings().miniApp.sheet
  const isPresent = useIsPresent()
  return (
    <div inert={!isPresent} className="absolute inset-0 z-20">
      <motion.button
        type="button"
        aria-label={words.close}
        tabIndex={-1}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <motion.div
        role="dialog"
        aria-label={label}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.28, ease: EASE_SHARP }}
        className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-xl bg-side"
      >
        {children}
        <button
          type="button"
          onClick={onClose}
          className="block h-[54px] w-full border-t-8 border-line bg-surface text-lg"
        >
          {words.cancel}
        </button>
      </motion.div>
    </div>
  )
}

interface MenuProps {
  app: MiniApp
  botName: string
  onEditInChat: () => void
  onVersions: () => void
  onRestart: () => void
  onExport: () => void
  onDelete: () => void
  onClose: () => void
}

/** The capsule's ···: what can be done with this mini app. */
export function MenuSheet({
  app,
  botName,
  onEditInChat,
  onVersions,
  onRestart,
  onExport,
  onDelete,
  onClose,
}: MenuProps) {
  const words = strings().miniApp.sheet
  const actions: { icon: IconName; label: string; onClick: () => void; isDanger?: boolean }[] = [
    { icon: 'pencil', label: words.editInChat, onClick: onEditInChat },
    { icon: 'clock', label: words.versions, onClick: onVersions },
    { icon: 'refresh', label: words.restart, onClick: onRestart },
    { icon: 'download', label: words.exportHtml, onClick: onExport },
    { icon: 'trash', label: words.delete, onClick: onDelete, isDanger: true },
  ]
  return (
    <Sheet label={words.menu} onClose={onClose}>
      <header className="flex items-center gap-2.5 px-[18px] pt-4 pb-3">
        <MiniAppTile app={app} size={40} />
        <span className="flex min-w-0 flex-col leading-snug">
          <b className="truncate text-md font-semibold">{app.name}</b>
          <small className="truncate text-xs text-muted">
            {words.about(latestVersion(app).version, botName, app.versions.length)}
          </small>
        </span>
      </header>
      <div className="flex gap-3 px-[18px] pb-[18px]">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            data-danger={action.isDanger || undefined}
            className="flex w-[58px] shrink-0 flex-col items-center gap-1.5 text-xs leading-tight text-soft data-danger:text-danger"
          >
            <span className="grid size-[52px] place-items-center rounded-lg bg-surface text-ink">
              <Icon name={action.icon} size={22} />
            </span>
            {action.label}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

interface VersionsProps {
  app: MiniApp
  shown: number
  onPick: (version: number) => void
  onClose: () => void
}

/** Every version, newest first; picking an older one shows it until it is restored or left. */
export function VersionsSheet({ app, shown, onPick, onClose }: VersionsProps) {
  const words = strings().miniApp.sheet
  const latest = latestVersion(app).version
  return (
    <Sheet label={words.versions} onClose={onClose}>
      <h5 className="px-[18px] pt-3.5 pb-1.5 text-center text-sm text-muted">{words.versionsTitle}</h5>
      <ul className="mx-2.5 max-h-[330px] overflow-y-auto rounded-lg bg-surface">
        {app.versions.toReversed().map((each) => (
          <li key={each.version} className="border-line [&+&]:border-t">
            <button
              type="button"
              aria-current={each.version === shown}
              onClick={() => onPick(each.version)}
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left leading-snug aria-current:bg-bubble"
            >
              <span className="w-[26px] shrink-0 pt-px text-sm font-semibold text-soft tabular-nums">
                v{each.version}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-md">{each.change}</span>
                <small className="text-xs text-muted">{dateLabel(each.at)}</small>
              </span>
              {each.version === latest && <em className="shrink-0 text-xs text-accent not-italic">{words.current}</em>}
            </button>
          </li>
        ))}
      </ul>
      <p className="px-[18px] pt-2 pb-3 text-center text-xs text-muted">{words.versionsNote}</p>
    </Sheet>
  )
}
