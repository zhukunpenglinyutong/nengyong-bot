import { animate, useReducedMotion } from 'motion/react'
import { type Bot, MAIN_BOT_ID } from '../../shared/bot'
import { locale } from '../../shared/language'
import {
  isUnlocked,
  OUTFIT_SLOTS,
  OUTFITS,
  OutfitId,
  type OutfitSlot,
  takeOff,
  toggleOutfit,
  wornOn,
} from '../../shared/outfit'
import { strings } from '../../shared/strings'
import { tierOf } from '../../shared/trust'
import { useFlash } from '../ui/useFlash'
import { BotAvatar } from './BotAvatar'

const SHAKE = { x: [0, -3, 3, -2, 1, 0] }
const SHAKE_S = 0.35

interface Props {
  bot: Bot
  level: number
  onPick: (outfit: OutfitId[]) => void
}

/** The avatar editor's outfit page: one piece per slot, applied the moment it is picked. A piece the bot's trust has not
 * unlocked yet stays grey; pressing it says how many levels are left instead. One already worn always comes off. */
export function OutfitPicker({ bot, level, onPick }: Props) {
  const words = strings().bot.outfit
  const outfit = bot.outfit ?? []
  const isMainBot = bot.id === MAIN_BOT_ID
  const [refused, refuse] = useFlash<OutfitId>()
  const isReducedMotion = useReducedMotion()
  const shownLevel = refused ? OUTFITS[refused].from : nextOutfitLevelOf(level, isMainBot)

  return (
    <div className="flex flex-col gap-2">
      {bot.avatar && <p className="rounded-md bg-bubble px-2.5 py-1.5 text-xs text-soft">{words.onPicture}</p>}
      {OUTFIT_SLOTS.map((slot) => (
        <section key={slot}>
          <div className="flex h-5 items-center justify-between text-xs text-muted">
            {words.slots[slot]}
            {wornOn(outfit, slot) && (
              <button
                type="button"
                aria-label={words.takeOffFrom(words.slots[slot])}
                onClick={() => onPick(takeOff(outfit, slot))}
                className="rounded-sm px-1.5 text-soft"
              >
                {words.takeOff}
              </button>
            )}
          </div>
          <div role="group" aria-label={words.slots[slot]} className="grid grid-cols-6 justify-items-center">
            {piecesOn(slot).map((id) => {
              const isLocked = !outfit.includes(id) && !isUnlocked(id, level, isMainBot)
              const label = isLocked ? words.unlocksAt(words.items[id], OUTFITS[id].from) : words.items[id]
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={outfit.includes(id)}
                  aria-label={label}
                  title={label}
                  data-locked={isLocked || undefined}
                  onClick={(event) => {
                    if (!isLocked) return onPick(toggleOutfit(outfit, id))
                    refuse(id)
                    if (!isReducedMotion) animate(event.currentTarget, SHAKE, { duration: SHAKE_S })
                  }}
                  className="group/piece relative grid place-items-center rounded-xl p-1 aria-pressed:ring-2 aria-pressed:ring-ink/20"
                >
                  <span className="flex group-data-locked/piece:opacity-40 group-data-locked/piece:grayscale">
                    <BotAvatar bot={{ ...bot, avatar: undefined, outfit: [id] }} size={36} animated={false} />
                  </span>
                  {isLocked && (
                    <span
                      style={{ backgroundColor: tierOf(OUTFITS[id].from).color }}
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1 text-xs leading-4 font-semibold text-white tabular-nums ring-2 ring-surface"
                    >
                      Lv.{OUTFITS[id].from}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </section>
      ))}
      <p
        role="status"
        data-refused={refused !== undefined || undefined}
        className="flex min-h-[30px] items-center gap-1.5 rounded-md bg-side px-2.5 py-1 text-xs text-soft data-refused:text-ink"
      >
        {shownLevel !== undefined && (
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: tierOf(shownLevel).color }} />
        )}
        {refused ? refusalLine(refused, level) : nextLine(level, isMainBot)}
      </p>
    </div>
  )
}

const piecesOn = (slot: OutfitSlot) => OutfitId.options.filter((id) => OUTFITS[id].slot === slot)

function nextOutfitLevelOf(level: number, isMainBot: boolean) {
  const levels = OutfitId.options.filter((id) => !isUnlocked(id, level, isMainBot)).map((id) => OUTFITS[id].from)
  return levels.length ? Math.min(...levels) : undefined
}

function nextLine(level: number, isMainBot: boolean) {
  const words = strings().bot.outfit
  const from = nextOutfitLevelOf(level, isMainBot)
  if (from === undefined) return words.allUnlocked
  const names = OutfitId.options
    .filter((id) => OUTFITS[id].from === from && !isUnlocked(id, level, isMainBot))
    .map((id) => words.items[id])
  return words.next(from - level, tierOf(from).name, new Intl.ListFormat(locale()).format(names))
}

function refusalLine(id: OutfitId, level: number) {
  const words = strings().bot.outfit
  const from = OUTFITS[id].from
  return words.needs(words.items[id], from, tierOf(from).name, from - level)
}
