import { motion } from 'motion/react'
import { type Bot, MAIN_BOT_ID, PALETTE } from '../../shared/bot'
import { isUnlocked, unlockedBetween } from '../../shared/outfit'
import { strings } from '../../shared/strings'
import { BotAvatar } from '../bot/BotAvatar'
import { EASE_SHARP } from '../ui/motion'
import { TIERS, tierOf } from '../../shared/trust'
import { TrustRing } from './TrustRing'

const ROLL_DELAY_S = 0.75
const SPARK_COUNT = 16
const SPARK_COLORS = PALETTE.filter((color) => !['ink', 'cocoa', 'slate'].includes(color.id)).map(
  (color) => color.value,
)
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, index) => {
  const angle = (index / SPARK_COUNT) * 2 * Math.PI
  const distance = 52 + (index % 3) * 16
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    color: SPARK_COLORS[index % SPARK_COLORS.length],
  }
})

/** The bot reached a new level: confetti, the number rolling over, what the new level means and the outfits it unlocked. */
export function LevelUpCard({ bot, from, level }: { bot: Bot; from: number; level: number }) {
  return (
    <div className="relative flex w-[280px] flex-col items-center px-5 pt-[22px] pb-5 text-center">
      <span aria-hidden="true" className="absolute top-[54px] left-1/2">
        {SPARKS.map((spark, index) => (
          <motion.span
            key={index}
            className="absolute -mt-[3px] -ml-[3px] size-1.5 rounded-sm"
            style={{ backgroundColor: spark.color }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
            animate={{ x: spark.x, y: spark.y, opacity: [1, 0], scale: 0.3 }}
            transition={{ duration: 0.9, delay: 0.3, ease: EASE_SHARP }}
          />
        ))}
      </span>
      <TrustRing trust={{ level, points: 1, needed: 1 }} size={64}>
        <BotAvatar bot={bot} size={40} />
      </TrustRing>
      <div className="mt-3 text-sm font-semibold tracking-[2px] text-white/60">{strings().island.levelUp.title}</div>
      <div className="mt-1 flex items-center gap-2.5 text-xl leading-[1.25] font-extrabold tabular-nums">
        <span className="sr-only">{strings().island.levelUp.upTo(level)}</span>
        <span aria-hidden="true" className="font-semibold text-white/40">
          Lv.{from}
        </span>
        <span aria-hidden="true">→</span>
        <span aria-hidden="true" className="flex">
          Lv.
          <span className="block h-[1.25em] overflow-hidden">
            <motion.span
              className="block"
              initial={{ y: 0 }}
              animate={{ y: '-50%' }}
              transition={{ delay: ROLL_DELAY_S, type: 'spring', bounce: 0.4, visualDuration: 0.4 }}
            >
              <span className="block">{from}</span>
              <span className="block">{level}</span>
            </motion.span>
          </span>
        </span>
      </div>
      <div className="mt-3 rounded-md bg-white/10 px-3 py-1.5 text-xs text-white/60">{tierLine(from, level)}</div>
      <NewOutfits bot={bot} from={from} level={level} />
    </div>
  )
}

function NewOutfits({ bot, from, level }: { bot: Bot; from: number; level: number }) {
  const outfits = unlockedBetween(from, level).filter((id) => !isUnlocked(id, from, bot.id === MAIN_BOT_ID))
  if (outfits.length === 0) return null
  return (
    <section className="mt-3 w-full rounded-lg bg-white/8 px-3 pt-2.5 pb-3">
      <h4 className="mb-2 text-xs font-semibold text-white/60">{strings().island.levelUp.newOutfits}</h4>
      <ul className="flex justify-center gap-3.5">
        {outfits.map((id) => (
          <li key={id} className="flex flex-col items-center gap-1 text-xs text-white/80">
            <span className="grid size-12 place-items-center rounded-full bg-white">
              <BotAvatar bot={{ ...bot, avatar: undefined, outfit: [id] }} size={36} animated={false} />
            </span>
            {strings().bot.outfit.items[id]}
          </li>
        ))}
      </ul>
    </section>
  )
}

function tierLine(from: number, level: number) {
  const words = strings().island.levelUp
  const tier = tierOf(level)
  if (tier !== tierOf(from)) return words.reachedRank(tier.name)
  const next = TIERS.find((candidate) => candidate.from > level)
  if (!next) return strings().island.maxedOut
  return words.toRank(next.from - level, next.name)
}
