import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { type Bot, workNumberOf } from '../../shared/bot'
import type { PanelData } from '../../shared/bridge'
import type { Trust } from '../../shared/trust'
import { useNavigation } from '../NavigationContext'
import { POP } from '../ui/motion'
import { useFlash } from '../ui/useFlash'
import { bodyOf } from './BotAvatar'
import type { PanelTab } from './BotPanel'
import { useBotActivity } from './botActivity'
import { BOT_BOX } from './desk/DeskBot'
import { DeskScene, type DeskTarget, SCENE_HEIGHT, SCENE_WIDTH } from './desk/DeskScene'
import { clockOf, deskStateOf, isSlacking, isWorking, nextUnlockOf, nowLineOf, pokeLineOf } from './deskState'
import { strings } from '../../shared/strings'

const DIZZY_POKES = 5
const DIZZY_WINDOW_MS = 2500

interface Reaction {
  kind: 'said' | 'caught' | 'dizzy'
  line: string
  at: number
}

interface Props {
  bot: Bot
  trust: Trust
  days: number // on the team
  panel: PanelData
  now: number
  onOpenTab: (tab: PanelTab) => void
  onLeave: () => void // turns the badge back to its front
}

/** The back of the staff badge: the bot at its desk, what it is up to in a line below, and the next piece of furniture. */
export function BotDesk({ bot, trust, days, panel, now, onOpenTab, onLeave }: Props) {
  const words = strings().desk.card
  const { openFlow } = useNavigation()
  const activity = useBotActivity(bot.id)
  const [reaction, react] = useFlash<Reaction>()
  const [pokes, setPokes] = useState<{ count: number; recent: number[] }>({ count: 0, recent: [] })
  const [lampSwitch, setLampSwitch] = useState<boolean>()
  const [waterings, setWaterings] = useState(0)
  const state = deskStateOf({ botId: bot.id, activity, tasks: panel.tasks, isCaught: reaction?.kind === 'caught', now })
  const isLampOn = lampSwitch ?? (clockOf(now).timeOfDay !== 'day' && state.kind !== 'nap')
  const line = nowLineOf(state, now)
  const unlock = nextUnlockOf(trust.level)
  const headY = BOT_BOX.y + bodyOf(bot.shape).top * BOT_BOX.scale

  const poke = () => {
    const at = Date.now()
    const recent = [...pokes.recent.filter((time) => at - time < DIZZY_WINDOW_MS), at]
    const isDizzy = recent.length >= DIZZY_POKES
    setPokes({ count: pokes.count + 1, recent: isDizzy ? [] : recent })
    if (isDizzy) return react({ kind: 'dizzy', line: strings().desk.poke.dizzy, at })
    const facts = { messages: trust.messages, flowCount: panel.flows.length, level: trust.level }
    const isCaught = isSlacking(state) || state.kind === 'caught'
    react({ kind: isCaught ? 'caught' : 'said', line: pokeLineOf(state, facts, pokes.count), at })
  }

  const press = (target: DeskTarget) => {
    switch (target.kind) {
      case 'bot':
        return poke()
      case 'flow':
        return openFlow(target.flowId)
      case 'routines':
        return onOpenTab('feed')
      case 'library':
        return onOpenTab('library')
      case 'plant':
        return setWaterings(waterings + 1)
      case 'lamp':
        return setLampSwitch(!isLampOn)
      default:
        return target satisfies never
    }
  }

  return (
    <>
      <div className="relative">
        <DeskScene
          bot={bot}
          state={state}
          level={trust.level}
          days={days}
          panel={panel}
          now={now}
          isLampOn={isLampOn}
          waterings={waterings}
          reaction={reaction}
          onPress={press}
        />
        <AnimatePresence>
          {reaction && (
            <motion.p
              key={reaction.at}
              {...POP}
              role="status"
              style={{
                left: `${((BOT_BOX.x + 50 * BOT_BOX.scale) / SCENE_WIDTH) * 100}%`,
                bottom: `${((SCENE_HEIGHT - headY + 6) / SCENE_HEIGHT) * 100}%`,
                transformOrigin: 'bottom center',
              }}
              className="pointer-events-none absolute w-max max-w-[210px] -translate-x-1/2 rounded-lg bg-surface px-2.5 py-1 text-center text-xs text-ink shadow-pop"
            >
              {reaction.line}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-0.5 px-4 py-2 text-left">
        <p className="flex items-center gap-2 text-sm text-soft">
          <span
            data-state={state.kind}
            className="size-2 shrink-0 rounded-full bg-muted data-[state=failed]:bg-danger data-[state=replying]:bg-accent data-[state=task]:bg-accent"
          />
          {isWorking(state) ? (
            <span className="shimmer-text min-w-0 flex-1 truncate">{line.text}</span>
          ) : (
            <span className="min-w-0 flex-1 truncate">{line.text}</span>
          )}
          {line.aside && <small className="shrink-0 text-sm text-muted tabular-nums">{line.aside}</small>}
        </p>
        <p className="truncate pl-4 text-xs text-muted">
          {unlock ? words.nextUnlock(unlock.level, unlock.name) : words.allUnlocked}
        </p>
      </div>
      <footer className="mx-3.5 flex items-center justify-between gap-2 border-t border-dashed border-line py-2 text-xs text-muted">
        <span className="min-w-0 truncate font-mono">{words.deskNumber(workNumberOf(bot.id))}</span>
        <button type="button" onClick={onLeave} className="h-6 shrink-0 rounded-sm px-2 text-soft">
          {words.backToBadge}
        </button>
      </footer>
    </>
  )
}
