import { strings } from '../../shared/strings'

const MAX_SHOWN_COUNT = 99

/** How many replies wait unseen: a dot for one, the count for more. Nothing when there are none. */
export function UnreadBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count === 0) return null
  if (count === 1)
    return (
      <span
        aria-label={strings().sidebar.status.unread}
        className={`size-2 shrink-0 rounded-full bg-accent ${className}`}
      />
    )
  return (
    <span
      aria-label={strings().sidebar.list.unreadCount(count)}
      className={`min-w-[18px] shrink-0 rounded-full bg-accent px-1 text-center text-xs leading-[18px] font-semibold text-white ${className}`}
    >
      {cappedCount(count)}
    </span>
  )
}

/** A count as a badge shows it: 99+ past 99. */
export function cappedCount(count: number): string {
  return count > MAX_SHOWN_COUNT ? `${MAX_SHOWN_COUNT}+` : String(count)
}
