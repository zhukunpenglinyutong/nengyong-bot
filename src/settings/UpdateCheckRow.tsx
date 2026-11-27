import type { ReactNode } from 'react'
import { strings } from '../../shared/strings'
import { dateLabel } from '../timeLabel'
import appIcon from './appIcon.webp'
import { BusyWarning } from './BusyWarning'
import { RELEASES } from './releases'
import { Button, PrimaryButton } from '../ui/Button'
import type { UpdateState } from './updateState'
import { WhatsNewLink } from './WhatsNewLink'

export interface UpdateProps {
  update: UpdateState
  busyBots: string[] // names of the bots at work, which the restart stops
  onCheckUpdate: () => void
  onInstallUpdate: () => void
}

/** The top of 更新记录: the version running, a check of GitHub Releases on demand, and what it found. */
export function UpdateCheckRow({ update, busyBots, onCheckUpdate, onInstallUpdate }: UpdateProps) {
  const words = strings().settings.update
  const isWorking = update.kind === 'checking' || update.kind === 'downloading' || update.kind === 'restarting'
  return (
    <section className="mt-6 rounded-xl border border-line bg-surface px-5 py-4">
      <div className="flex items-center gap-3">
        <img src={appIcon} alt="" className="size-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-md">Nengyong Bot</div>
          <div className="text-xs text-muted">{words.current(RELEASES[0].version)}</div>
        </div>
        <Button disabled={isWorking} onClick={onCheckUpdate}>
          {words.check}
        </Button>
        {update.kind === 'available' && <PrimaryButton onClick={onInstallUpdate}>{words.install}</PrimaryButton>}
        {update.kind === 'installFailed' && <PrimaryButton onClick={onInstallUpdate}>{words.retry}</PrimaryButton>}
      </div>
      <Result update={update} />
      {(update.kind === 'available' || update.kind === 'installFailed') && <BusyWarning names={busyBots} />}
    </section>
  )
}

function Result({ update }: { update: UpdateState }) {
  const words = strings().settings.update
  switch (update.kind) {
    case 'idle':
    case 'updated':
      return <Line>{words.idle}</Line>
    case 'checking':
      return <Line>{words.checking}</Line>
    case 'latest':
      return <Line>{words.latest(update.check.version, dateLabel(Date.parse(update.check.date)))}</Line>
    case 'checkFailed':
      return <Line isFailure>{words.checkFailed(update.message)}</Line>
    case 'available':
      return (
        <Line>
          {words.foundOn(update.check.version, dateLabel(Date.parse(update.check.date)))}{' '}
          <WhatsNewLink version={update.check.version} />
        </Line>
      )
    case 'downloading':
      return <Line>{words.downloading(update.check.version, Math.floor(update.percent))}</Line>
    case 'restarting':
      return <Line>{words.restarting}</Line>
    case 'installFailed':
      return <Line isFailure>{words.installFailedBecause(update.message)}</Line>
    default:
      return update satisfies never
  }
}

function Line({ isFailure = false, children }: { isFailure?: boolean; children: ReactNode }) {
  return (
    <p
      role="status"
      data-failure={isFailure || undefined}
      className="mt-3 ml-12 text-sm text-soft data-failure:text-danger"
    >
      {children}
    </p>
  )
}
