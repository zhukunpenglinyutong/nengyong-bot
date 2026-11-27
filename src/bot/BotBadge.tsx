import { motion, useAnimate, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import { type ReactNode, type RefObject, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { type Bot, botCreatedAt, type Shape, workNumberOf } from '../../shared/bot'
import type { Entry, PanelData } from '../../shared/bridge'
import type { OutfitId } from '../../shared/outfit'
import { calendarDay, TIMEZONE } from '../../shared/timezone'
import { levelEffectOf, type Trust, tierOf, trustOf } from '../../shared/trust'
import { ELAPSED_REFRESH_MS } from '../elapsedLabel'
import { TrustRing } from '../island/TrustRing'
import { useNow } from '../ui/useNow'
import { AvatarEditor } from './AvatarEditor'
import { BotAvatar } from './BotAvatar'
import { BotDesk } from './BotDesk'
import { BotNameField } from './BotNameField'
import type { PanelTab } from './BotPanel'
import type { Look } from './LookPicker'
import { ShapePattern } from './ShapePattern'
import { locale } from '../../shared/language'
import { strings } from '../../shared/strings'

const SWING_FROM_DEG = 3.5
const SWING = { type: 'spring', stiffness: 120, damping: 6 } as const
const TWIST_FROM_DEG = -2.6 // turning over tugs the lanyard the other way
const FLIP = { type: 'spring', stiffness: 90, damping: 14 } as const
const MAX_LEAN_DEG = 1.5
const LEAN = { stiffness: 150, damping: 14 } as const
const SCAN_S = 0.5
const BAR_SLOT = 4

interface Props {
  bot: Bot
  entries: Entry[] // its chat: the level, the conversations, and the joining day of a built-in bot
  panel: PanelData // what its desk on the back is drawn from
  // absent on a paired device: the computer keeps the sidebar, so the name and the look are shown, not changed
  onRename?: (name: string) => void
  onPickLook?: (look: Look) => void
  onPickAvatar?: (avatar: string | undefined) => void
  onPickOutfit?: (outfit: OutfitId[]) => void
  onOpenTab: (tab: PanelTab) => void
  onOpenFlow: (flowId: string | null) => void
}

/** The top of the panel: the bot's staff badge on a lanyard, its band in the colour of the tier. It swings in and leans after
 * the pointer; swiping its barcode turns it over to the bot's desk, and it always starts on its front. */
export function BotBadge({
  bot,
  entries,
  panel,
  onRename,
  onPickLook,
  onPickAvatar,
  onPickOutfit,
  onOpenTab,
  onOpenFlow,
}: Props) {
  const words = strings().bot.badge
  const trust = useMemo(() => trustOf(entries), [entries])
  const now = useNow(ELAPSED_REFRESH_MS)
  const joinedAt = botCreatedAt(bot.id) ?? entries[0]?.at ?? now
  const days = calendarDay(now) - calendarDay(joinedAt) + 1
  const isReducedMotion = useReducedMotion()
  const lean = useMotionValue(0)
  const leanRotate = useSpring(lean, LEAN)
  const [isFlipped, setIsFlipped] = useState(false)
  const [hasDesk, setHasDesk] = useState(false) // the back is drawn from the first time it turns over
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)

  const turn = (toBack: boolean) => {
    const [from, to] = toBack ? [frontRef, backRef] : [backRef, frontRef]
    const hadFocus = from.current?.contains(document.activeElement)
    // an inert face drops its focus: hand it to the other face, once that one is live
    flushSync(() => {
      setIsFlipped(toBack)
      if (toBack) setHasDesk(true)
    })
    if (hadFocus) to.current?.focus({ preventScroll: true })
    animate(scope.current, { rotate: [TWIST_FROM_DEG, 0] }, SWING)
  }

  return (
    <motion.div
      ref={scope}
      initial={{ rotate: SWING_FROM_DEG }}
      animate={{ rotate: 0 }}
      transition={SWING}
      style={{ originY: 0 }}
      className="mx-auto max-w-[340px]"
    >
      <motion.div
        style={{ rotate: leanRotate, originY: 0 }}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const isPicking = event.target instanceof Element && event.target.closest('[role="dialog"]') !== null
          const offset = (event.clientX - box.left) / box.width - 0.5
          lean.set(isReducedMotion || isPicking ? 0 : offset * 2 * MAX_LEAN_DEG)
        }}
        onPointerLeave={() => lean.set(0)}
        className="relative pt-[54px] perspective-distant"
      >
        <Lanyard color={bot.color} />
        <motion.div
          initial={false}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ ...FLIP, delay: isFlipped ? SCAN_S : 0 }}
          className="grid transform-3d"
        >
          <Face faceRef={frontRef} isShown={!isFlipped} className="text-center">
            <Band shape={bot.shape} level={trust.level} />
            <div className="relative mx-auto -mt-12 w-fit rounded-full bg-surface p-1">
              <TrustRing trust={trust} size={88}>
                {onPickLook && onPickAvatar && onPickOutfit ? (
                  <AvatarEditor
                    bot={bot}
                    level={trust.level}
                    onPick={onPickLook}
                    onPickAvatar={onPickAvatar}
                    onPickOutfit={onPickOutfit}
                  />
                ) : (
                  <BotAvatar bot={bot} size={64} />
                )}
              </TrustRing>
            </div>
            {onRename ? (
              <BotNameField key={bot.name} name={bot.name} onRename={onRename} />
            ) : (
              <p className="mx-auto mt-1 max-w-full px-2.5 py-0.5 text-center text-xl font-medium break-words">
                {bot.name}
              </p>
            )}
            <Rank trust={trust} />
            <dl className="mx-4 mt-3.5 grid grid-cols-3 divide-x divide-line border-t border-dashed border-line pt-3">
              <Field label={words.onTheJob} title={words.joinedOn(dateLabel(joinedAt))}>
                {words.day(days)}
              </Field>
              <Field label={words.chats}>{words.chatCount(trust.messages)}</Field>
              <Field label={words.abilities}>
                {words.abilityCount(panel.flows.length + panel.skills.filter((skill) => skill.botId === bot.id).length)}
              </Field>
            </dl>
            <SwipeCode id={bot.id} isSwiped={isFlipped} onSwipe={() => turn(true)} />
          </Face>
          <Face faceRef={backRef} isShown={isFlipped} className="rotate-y-180 overflow-hidden">
            {hasDesk && (
              <BotDesk
                bot={bot}
                trust={trust}
                days={days}
                panel={panel}
                now={now}
                onOpenTab={onOpenTab}
                onOpenFlow={onOpenFlow}
                onLeave={() => turn(false)}
              />
            )}
            <Slot />
          </Face>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

interface FaceProps {
  faceRef: RefObject<HTMLDivElement | null>
  isShown: boolean
  className: string
  children: ReactNode
}

/** One side of the card, stacked on the other; the side turned away stays out of reach. */
function Face({ faceRef, isShown, className, children }: FaceProps) {
  return (
    <div
      ref={faceRef}
      inert={!isShown}
      tabIndex={-1}
      className={`relative col-start-1 row-start-1 flex flex-col rounded-xl bg-surface shadow-pop backface-hidden ${className}`}
    >
      {children}
    </div>
  )
}

/** The barcode: pressing it swipes the card; a scan line runs across while the badge waits to turn over. */
function SwipeCode({ id, isSwiped, onSwipe }: { id: string; isSwiped: boolean; onSwipe: () => void }) {
  const words = strings().bot.badge
  return (
    <button
      type="button"
      aria-label={words.swipe}
      onClick={onSwipe}
      className="group/code badge-swipe-hint relative mx-3 mt-auto mb-2 overflow-hidden rounded-lg px-1.5 pt-3 pb-1"
    >
      <Barcode id={id} />
      {isSwiped ? (
        <p className="mt-1 text-xs tracking-[0.28em] text-ink">{words.swiped}</p>
      ) : (
        <p className="mt-1 font-mono text-xs tracking-[0.28em] text-muted">
          <span className="group-hover/code:hidden group-focus-visible/code:hidden">
            {words.staffNumber(workNumberOf(id))}
          </span>
          <span className="hidden text-ink group-hover/code:inline group-focus-visible/code:inline">
            {words.swipeHint}
          </span>
        </p>
      )}
      {isSwiped && (
        <motion.span
          initial={{ left: '0%' }}
          animate={{ left: '100%' }}
          transition={{ duration: SCAN_S, ease: 'linear' }}
          className="absolute top-2 bottom-7 w-0.5 bg-danger"
        />
      )}
    </button>
  )
}

/** The hole the lanyard's clip goes through, punched through both sides. */
function Slot() {
  return (
    <span className="absolute top-2.5 left-1/2 h-2 w-[34px] -translate-x-1/2 rounded-full bg-canvas ring-1 ring-black/20 ring-inset" />
  )
}

function Lanyard({ color }: { color: string }) {
  return (
    <>
      <span style={{ backgroundColor: color }} className="absolute top-0 left-1/2 h-11 w-[18px] -translate-x-1/2">
        <span className="absolute inset-0 bg-black/15" />
        <span className="absolute inset-x-[3px] inset-y-0 border-x border-dashed border-white/45" />
      </span>
      <span className="absolute top-9 left-1/2 z-10 h-[13px] w-6 -translate-x-1/2 rounded-sm bg-white bg-linear-to-b from-transparent to-black/35 shadow-card">
        <span className="absolute top-[9px] left-1/2 h-5 w-2.5 -translate-x-1/2 rounded-b-sm border-[2.5px] border-t-0 border-muted" />
      </span>
    </>
  )
}

/** The coloured top of the card: the tier's colour, printed with the bot's own outline, punched with the lanyard's slot. */
function Band({ shape, level }: { shape: Shape; level: number }) {
  return (
    <div
      data-effect={levelEffectOf(level)}
      style={{ backgroundColor: tierOf(level).color }}
      className="level-effect relative h-[92px] overflow-hidden rounded-t-xl text-white"
    >
      <ShapePattern shape={shape} className="opacity-15" />
      <Slot />
      <span className="absolute inset-x-3.5 top-[26px] flex justify-between text-xs font-semibold tracking-[0.14em] opacity-85">
        <span>NENGYONG BOT</span>
        <span>{strings().bot.badge.staffId}</span>
      </span>
    </div>
  )
}

function Rank({ trust }: { trust: Trust }) {
  const tier = tierOf(trust.level)
  return (
    <p className="mx-auto mt-1 flex h-[26px] w-fit items-center gap-1.5 rounded-full bg-bubble px-2.5 text-sm text-soft">
      <span className="size-2 rounded-full" style={{ backgroundColor: tier.color }} />
      {tier.name}
      <b className="font-semibold text-ink tabular-nums">Lv.{trust.level}</b>
      {trust.needed > 0 && (
        <span className="text-muted tabular-nums">
          {trust.points}/{trust.needed}
        </span>
      )}
    </p>
  )
}

function Field({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div title={title}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-md tabular-nums">{children}</dd>
    </div>
  )
}

const dateLabel = (at: number) =>
  new Date(at).toLocaleDateString(locale(), { timeZone: TIMEZONE, year: 'numeric', month: 'long', day: 'numeric' })

/** Bars drawn from the id's characters, so a bot always wears the same code; it does not scan. */
function Barcode({ id }: { id: string }) {
  const widths = [...`*${id.toUpperCase()}*`].flatMap((char) =>
    [0, 2, 4].map((shift) => (((char.charCodeAt(0) >> shift) & 3) % 3) + 1),
  )
  const bars = widths.map((width, index) => `M${index * BAR_SLOT} 0h${width}v1h-${width}z`).join('')
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${widths.length * BAR_SLOT} 1`}
      preserveAspectRatio="none"
      className="block h-[22px] w-full fill-current opacity-80"
    >
      <path d={bars} />
    </svg>
  )
}
