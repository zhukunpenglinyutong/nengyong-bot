import { type ReactNode, useState } from 'react'
import type { Bot } from '../../shared/bot'
import { strings } from '../../shared/strings'
import type { Trust } from '../../shared/trust'
import { BotAvatar } from '../bot/BotAvatar'
import { DebugToggle } from './DebugToggle'
import { LevelBadge } from './LevelBadge'
import { LevelGuide } from './LevelGuide'
import { TrustRing } from './TrustRing'

interface Props {
  bot: Bot
  trust: Trust
  isDebug: boolean
  onDebugChange: (isDebug: boolean) => void
  subtitle: ReactNode // under the name
  className: string
  children: ReactNode // the body; the level guide takes its place while it is open
}

/** The island opened up: the bot and its level on top, its debug switch, and a body that turns to the level guide. */
export function IslandCard({ bot, trust, isDebug, onDebugChange, subtitle, className, children }: Props) {
  const [isGuideOpen, setIsGuideOpen] = useState(false)

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <TrustRing trust={trust} size={48}>
          <BotAvatar bot={bot} size={30} />
        </TrustRing>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-lg font-semibold">
            <span className="truncate">{bot.name}</span>
            <button
              type="button"
              aria-label={strings().island.detail.levelGuide(trust.level)}
              aria-expanded={isGuideOpen}
              onClick={() => setIsGuideOpen(!isGuideOpen)}
              className="rounded-full"
            >
              <LevelBadge level={trust.level} />
            </button>
          </div>
          <div className="mt-0.5 truncate text-sm text-white/60">{subtitle}</div>
        </div>
        <DebugToggle isDebug={isDebug} onChange={onDebugChange} />
      </div>
      {isGuideOpen ? <LevelGuide trust={trust} onBack={() => setIsGuideOpen(false)} className="mt-4" /> : children}
    </div>
  )
}
