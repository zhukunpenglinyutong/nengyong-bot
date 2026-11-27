import { motion, useIsPresent } from 'motion/react'
import type { ReactNode } from 'react'
import { BYTES_PER_MB } from '../../shared/limits'
import { strings } from '../../shared/strings'
import { dateLabel } from '../chat/chatMessages'
import { IconButton } from '../ui/IconButton'
import { POP } from '../ui/motion'
import appIcon from './appIcon.webp'
import { BusyWarning } from './BusyWarning'
import { RELEASES } from './releases'
import { SettingsButton, SettingsPrimaryButton } from './SettingsSection'
import type { Popup } from './updateState'
import { WhatsNewLink } from './WhatsNewLink'

const MAX_HIGHLIGHTS = 3

interface Props {
  popup: Popup
  busyBots: string[] // names of the bots at work, which the restart stops
  onInstall: () => void
  onClose: () => void
  onOpenNotes: () => void // the 更新记录 page, after the first run of a new version
}

/** The corner where 检查更新 speaks up: a newer version found, its download, and the first run of the one installed. */
export function UpdatePopup(props: Props) {
  return (
    <motion.section
      {...POP}
      inert={!useIsPresent()}
      aria-labelledby="update-title"
      className="fixed right-4 bottom-4 z-30 w-80 origin-bottom-right rounded-xl bg-surface p-4 text-ink shadow-pop"
    >
      <PopupBody {...props} />
    </motion.section>
  )
}

function PopupBody({ popup, busyBots, onInstall, onClose, onOpenNotes }: Props) {
  const words = strings().settings.update
  switch (popup.kind) {
    case 'available':
      return (
        <>
          <Head
            title={words.found(popup.check.version)}
            detail={words.foundDetail(RELEASES[0].version, dateLabel(Date.parse(popup.check.date)))}
            onClose={onClose}
          />
          <div className="mt-1 ml-12">
            <WhatsNewLink version={popup.check.version} />
          </div>
          <BusyWarning names={busyBots} />
          <Actions>
            <SettingsButton onClick={onClose}>{words.later}</SettingsButton>
            <SettingsPrimaryButton onClick={onInstall}>{words.install}</SettingsPrimaryButton>
          </Actions>
        </>
      )
    case 'downloading':
      return (
        <>
          <Head
            title={words.downloading(popup.check.version, Math.floor(popup.percent))}
            detail={words.downloadingHint}
          />
          <div
            role="progressbar"
            aria-labelledby="update-title"
            aria-valuenow={Math.floor(popup.percent)}
            className="mt-3 ml-12 h-1 overflow-hidden rounded-full bg-bubble"
          >
            <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${popup.percent}%` }} />
          </div>
          <p className="mt-1.5 ml-12 text-xs text-muted">
            {words.size(megabytes(popup.transferredBytes), megabytes(popup.totalBytes))}
          </p>
        </>
      )
    case 'restarting':
      return <Head title={words.restarting} detail={words.restartingHint} />
    case 'installFailed':
      return (
        <>
          <Head title={words.installFailed} detail={popup.message} isFailure onClose={onClose} />
          <BusyWarning names={busyBots} />
          <Actions>
            <SettingsButton onClick={onClose}>{words.close}</SettingsButton>
            <SettingsPrimaryButton onClick={onInstall}>{words.retry}</SettingsPrimaryButton>
          </Actions>
        </>
      )
    case 'updated':
      return (
        <>
          <Head title={words.updated(popup.version)} detail={RELEASES[0].title} />
          <ul className="mt-2 ml-12 list-disc space-y-0.5 pl-4 text-sm text-soft">
            {RELEASES[0].highlights.slice(0, MAX_HIGHLIGHTS).map((highlight) => (
              <li key={highlight.title}>{highlight.title}</li>
            ))}
          </ul>
          <Actions>
            <SettingsButton onClick={onClose}>{words.gotIt}</SettingsButton>
            <SettingsPrimaryButton onClick={onOpenNotes}>{words.openNotes}</SettingsPrimaryButton>
          </Actions>
        </>
      )
    default:
      return popup satisfies never
  }
}

interface HeadProps {
  title: string
  detail: string
  isFailure?: boolean
  onClose?: () => void
}

function Head({ title, detail, isFailure = false, onClose }: HeadProps) {
  return (
    <div className="flex items-start gap-3">
      <img src={appIcon} alt="" className="size-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <h2
          id="update-title"
          data-failure={isFailure || undefined}
          className="text-md font-semibold data-failure:text-danger"
        >
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-muted">{detail}</p>
      </div>
      {onClose && (
        <IconButton
          icon="close"
          label={strings().settings.update.close}
          iconSize={16}
          onClick={onClose}
          className="-mt-1.5 -mr-1.5"
        />
      )}
    </div>
  )
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>
}

const megabytes = (bytes: number) => Math.round(bytes / BYTES_PER_MB)
