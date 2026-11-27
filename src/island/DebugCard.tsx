import { type ReactNode, useMemo } from 'react'
import type { Bot } from '../../shared/bot'
import type { Entry } from '../../shared/bridge'
import type { ContextView, Trace } from '../../shared/debug'
import { strings } from '../../shared/strings'
import { ChangesTab } from './ChangesTab'
import { changesOf } from './changes'
import { ContextTab } from './ContextTab'
import { tokensLabel } from './contextTokens'
import { IslandCard } from './IslandCard'
import { TraceTab } from './TraceTab'
import type { Trust } from '../../shared/trust'
import { TrustProgress } from './TrustProgress'

export type DebugTab = 'context' | 'trace' | 'changes' | 'trust'

const TABS: [DebugTab, string][] = [
  ['context', strings().debug.tabs.context],
  ['trace', strings().debug.tabs.trace],
  ['changes', strings().debug.tabs.changes],
  ['trust', strings().debug.tabs.trust],
]

interface Props {
  bot: Bot
  trust: Trust
  entries: Entry[]
  context: ContextView | null
  traces: Trace[]
  tab: DebugTab
  onTab: (tab: DebugTab) => void
  onDebugChange: (isDebug: boolean) => void
}

/** The island opened in debug mode: what the bot sends the model, how its last runs went, what it changed. */
export function DebugCard({ bot, trust, entries, context, traces, tab, onTab, onDebugChange }: Props) {
  const changes = useMemo(() => changesOf(entries), [entries])

  const content = (): ReactNode => {
    switch (tab) {
      case 'context':
        return context ? <ContextTab context={context} /> : <Empty>{strings().debug.noContext}</Empty>
      case 'trace':
        return traces.length ? (
          <TraceTab botId={bot.id} traces={traces} windowTokens={context?.windowTokens} />
        ) : (
          <Empty>{strings().debug.noRuns}</Empty>
        )
      case 'changes':
        return changes.length ? (
          <ChangesTab botId={bot.id} changes={changes} />
        ) : (
          <Empty>{strings().debug.noChanges}</Empty>
        )
      case 'trust':
        return <TrustProgress trust={trust} className="px-0.5 pb-1" />
      default:
        return tab satisfies never
    }
  }

  return (
    <IslandCard
      bot={bot}
      trust={trust}
      isDebug
      onDebugChange={onDebugChange}
      subtitle={
        context && (
          <span className="font-mono text-xs">
            {context.model} · {strings().debug.window(tokensLabel(context.windowTokens))}
          </span>
        )
      }
      className="w-[452px] p-3.5 pb-3"
    >
      <div
        role="tablist"
        aria-label={strings().debug.label}
        className="mt-3 flex gap-0.5 rounded-lg bg-white/10 p-[3px]"
      >
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className="h-7 flex-1 rounded-md text-sm text-white/60 aria-selected:bg-white/20 aria-selected:font-semibold aria-selected:text-white"
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-3 max-h-[400px] overflow-y-auto">
        {content()}
      </div>
    </IslandCard>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-white/60">{children}</p>
}
