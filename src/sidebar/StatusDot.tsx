import { DOT_LABELS, type DotKind } from './botStatus'

interface Props {
  kind: DotKind
  size: number // px across
  className?: string // where it sits
}

/** A disc in the status colour with a white mark: an arc turning while the bot works, dots while it waits, ! when a task failed, ? while it waits on the user. */
export function StatusDot({ kind, size, className = '' }: Props) {
  return (
    <span
      role="img"
      aria-label={DOT_LABELS[kind]}
      data-kind={kind}
      style={{ width: size, height: size }}
      className={`grid shrink-0 place-items-center rounded-full text-white data-[kind=busy]:bg-working data-[kind=deciding]:bg-accent data-[kind=failed]:bg-danger data-[kind=waiting]:bg-muted ${className}`}
    >
      <Mark kind={kind} />
    </span>
  )
}

function Mark({ kind }: { kind: DotKind }) {
  switch (kind) {
    case 'busy':
      return (
        <svg
          viewBox="0 0 16 16"
          className="size-full motion-safe:animate-spin"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="4.2" strokeOpacity={0.35} />
          <path d="M8 3.8a4.2 4.2 0 0 1 4.2 4.2" />
        </svg>
      )
    case 'waiting':
      return (
        <svg viewBox="0 0 16 16" className="size-full" fill="currentColor" aria-hidden="true">
          <circle cx="4.7" cy="8" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="11.3" cy="8" r="1.3" />
        </svg>
      )
    case 'failed':
      return (
        <svg viewBox="0 0 16 16" className="size-full" aria-hidden="true">
          <path d="M8 4.3v4.4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          <circle cx="8" cy="11.6" r="1.15" fill="currentColor" />
        </svg>
      )
    case 'deciding':
      return (
        <svg viewBox="0 0 16 16" className="size-full" fill="none" aria-hidden="true">
          <path
            d="M6.3 6.4a1.8 1.8 0 1 1 2.5 1.6c-.5.2-.8.6-.8 1.1v.4"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.7" r="1.05" fill="currentColor" />
        </svg>
      )
    default:
      return kind satisfies never
  }
}
