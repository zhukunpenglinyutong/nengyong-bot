import { plainText } from '../../shared/plainText'
import { type BotStatus, statusLineOf } from './botStatus'
import { UnreadBadge } from './UnreadBadge'

interface Props {
  status: BotStatus
  preview: string // its last reply, shown while it is idle
  unread: number
  now: number
}

/** The line under a bot's name: what it is up to, or else its last reply, and the replies waiting unread. */
export function StatusLine({ status, preview, unread, now }: Props) {
  const line = statusLineOf(status, now)
  return (
    <span className="flex min-w-0 items-center gap-2">
      <small
        data-live={(line !== null && status.kind !== 'failed') || undefined}
        data-failed={status.kind === 'failed' || undefined}
        data-deciding={status.kind === 'deciding' || undefined}
        className="min-w-0 flex-1 truncate text-sm text-muted data-deciding:text-accent data-failed:text-danger data-live:text-soft"
      >
        {line ?? plainText(preview)}
      </small>
      <UnreadBadge count={unread} />
    </span>
  )
}
