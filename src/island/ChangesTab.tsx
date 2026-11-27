import { useState } from 'react'
import { strings } from '../../shared/strings'
import { locale } from '../../shared/language'
import { calendarDay, TIMEZONE } from '../../shared/timezone'
import type { Change } from './changes'

interface Props {
  botId: string
  changes: Change[] // newest first
}

/** Every lasting change the bot's chat made, with the record it came from; a rewritten duty shows before and after. */
export function ChangesTab({ botId, changes }: Props) {
  const [openSeq, setOpenSeq] = useState<number>()

  return (
    <div>
      <ul>
        {changes.map((change) => {
          const canOpen = change.before !== undefined
          const isOpen = canOpen && openSeq === change.seq
          return (
            <li key={change.seq}>
              <button
                type="button"
                disabled={!canOpen}
                aria-expanded={canOpen ? isOpen : undefined}
                onClick={() => setOpenSeq(isOpen ? undefined : change.seq)}
                className="flex w-full items-start gap-2.5 rounded-md p-2 text-left"
              >
                <span className="w-10 shrink-0 pt-0.5 font-mono text-xs text-white/40 tabular-nums">
                  {compactWhen(change.at)}
                </span>
                <span className="min-w-14 shrink-0 rounded-sm bg-white/12 px-1.5 text-center text-xs leading-5 font-semibold">
                  {change.label}
                </span>
                <span className="min-w-0 flex-1 text-sm leading-snug">
                  <span className="line-clamp-2 break-all">{change.text}</span>
                  {canOpen && (
                    <span className="text-xs text-white/40">
                      {isOpen ? strings().debug.changes.hide : strings().debug.changes.beforeAfter}
                    </span>
                  )}
                  <span className="block font-mono text-xs text-white/40">
                    {change.tool} · {botId}#{change.seq}
                  </span>
                </span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-1 pr-2 pb-2 pl-[124px] text-xs">
                  <p className="rounded-md bg-danger/15 px-2 py-1.5 text-white/60 line-through">{change.before}</p>
                  <p className="rounded-md bg-accent/15 px-2 py-1.5">{change.text}</p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mx-2 mt-2 text-xs text-white/40">{strings().debug.changes.footnote}</p>
    </div>
  )
}

/** 08:05 today, 11/1 before: short enough for the narrow column. */
function compactWhen(at: number): string {
  const date = new Date(at)
  return calendarDay(at) === calendarDay(Date.now())
    ? date.toLocaleTimeString(locale(), { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false })
    : date.toLocaleDateString(locale(), { timeZone: TIMEZONE, month: 'numeric', day: 'numeric' })
}
