import type { Bot } from '../../shared/bot'
import { strings } from '../../shared/strings'
import { Icon } from '../ui/Icon'
import { IslandCard } from './IslandCard'
import { type Trust, tierOf } from '../../shared/trust'
import { TrustProgress } from './TrustProgress'

interface Props {
  bot: Bot
  trust: Trust
  flowCount: number
  onOpenFlows: () => void
  onDebugChange: (isDebug: boolean) => void
}

/** The island opened up: the bot's level, how far to the next one, and the flows it has learned. */
export function DetailCard({ bot, trust, flowCount, onOpenFlows, onDebugChange }: Props) {
  return (
    <IslandCard
      bot={bot}
      trust={trust}
      isDebug={false}
      onDebugChange={onDebugChange}
      subtitle={tierOf(trust.level).name}
      className="w-[360px] p-4"
    >
      <TrustProgress trust={trust} className="mt-4" />
      {flowCount > 0 && (
        <button
          type="button"
          onClick={onOpenFlows}
          className="mt-4 flex w-full items-center gap-2.5 rounded-xl bg-white/8 px-3 py-2.5 text-left text-md"
        >
          <Icon name="flow" size={18} />
          <span className="flex-1">{strings().island.detail.knowsFlows(flowCount)}</span>
          <Icon name="chevron" size={16} />
        </button>
      )}
    </IslandCard>
  )
}
