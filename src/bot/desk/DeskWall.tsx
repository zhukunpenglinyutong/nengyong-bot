import { useId } from 'react'
import type { Bot } from '../../../shared/bot'
import type { Flow } from '../../../shared/flow'
import { clockLabel } from '../../../shared/timezone'
import { tierOf } from '../../../shared/trust'
import { bodyOf } from '../BotAvatar'
import { clockOf, furnitureOf, type TimeOfDay } from '../deskState'
import { DESK_COLORS } from './deskColors'
import { strings } from '../../../shared/strings'

interface Props {
  bot: Bot
  level: number
  days: number
  now: number
  nextRunAt: number | null // of its next routine, dotted on the clock
  flows: Flow[]
  shelved: Flow[] // the flows whose binders fit; the rest is a count
  hasTrophy: boolean
}

/** The wall behind the desk: the window, what hangs above the desk, the clock and the shelf of flows. */
export function DeskWall({ bot, level, days, now, nextRunAt, flows, shelved, hasTrophy }: Props) {
  return (
    <>
      <Window timeOfDay={clockOf(now).timeOfDay} />
      <WallArt bot={bot} level={level} days={days} />
      <Clock now={now} nextRunAt={nextRunAt} color={bot.color} />
      <Shelf flows={flows} shelved={shelved} color={bot.color} hasTrophy={hasTrophy} />
    </>
  )
}

const BINDER_HEIGHTS = [32, 28, 34, 30, 33, 29]
const BINDER_SHADES = [100, 72, 86, 60, 94, 78]

/** Where binder `index` stands on the shelf, in scene units: its drawing and its button share it. */
export const binderBoxOf = (index: number): [x: number, y: number, width: number, height: number] => [
  234 + index * 12.5,
  104 - BINDER_HEIGHTS[index],
  10,
  BINDER_HEIGHTS[index],
]

/** Where the note of routine `index` sticks on the screen's corner, in scene units: its drawing and its button share it. */
export const noteBoxOf = (
  corner: { x: number; y: number },
  index: number,
): [x: number, y: number, width: number, height: number] => [corner.x - 8, corner.y - 3 + index * 15, 12, 12]

const SKY: Record<TimeOfDay, [string, string]> = {
  day: ['#a9d8ff', '#e6f4ff'],
  dusk: ['#ff9a6b', '#ffd6a5'],
  night: ['#121c40', '#2c3672'],
}
const SKYLINE: Record<TimeOfDay, string> = { day: '#b9d4ec', dusk: '#c98a96', night: '#0b1230' }
const LIT_WINDOWS = [
  [36, 90],
  [38, 95],
  [53, 88],
  [55, 96],
  [63, 95],
  [87, 90],
  [89, 98],
  [98, 100],
]
const STARS = [
  [32, 40],
  [46, 52],
  [60, 37],
  [76, 56],
  [40, 66],
  [70, 44],
]

/** The window follows Beijing time: sun and cloud, a low sun at dusk, moon and stars with lit windows at night. */
function Window({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const id = useId()
  return (
    <>
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset={0} stopColor={SKY[timeOfDay][0]} />
          <stop offset={1} stopColor={SKY[timeOfDay][1]} />
        </linearGradient>
        <clipPath id={`${id}pane`}>
          <rect x={24} y={32} width={84} height={78} rx={2} />
        </clipPath>
      </defs>
      <rect x={18} y={26} width={96} height={90} rx={5} style={{ fill: DESK_COLORS.frame }} />
      <g clipPath={`url(#${id}pane)`}>
        <rect x={24} y={32} width={84} height={78} fill={`url(#${id}sky)`} />
        {timeOfDay === 'day' && (
          <>
            <circle cx={92} cy={48} r={8} fill="#ffd45c" />
            <path d="M33 62 a6 6 0 0 1 11 -3 a5 5 0 0 1 9 3 z" fill="#fff" opacity={0.9} />
          </>
        )}
        {timeOfDay === 'dusk' && <circle cx={56} cy={98} r={13} fill="#ff7046" opacity={0.85} />}
        {timeOfDay === 'night' && (
          <>
            <circle cx={90} cy={46} r={7} fill="#fff4c8" />
            <circle cx={94} cy={43} r={6} fill="#15204a" />
            {STARS.map(([cx, cy], index) => (
              <circle
                key={cx}
                className="desk-twinkle"
                cx={cx}
                cy={cy}
                r={0.9}
                fill="#fff"
                style={{ animationDelay: `${index * 0.4}s` }}
              />
            ))}
          </>
        )}
        <path
          d="M24 110 V94 H33 V86 H43 V98 H50 V82 H60 V92 H68 V88 H77 V100 H84 V84 H95 V96 H108 V110Z"
          fill={SKYLINE[timeOfDay]}
        />
        {timeOfDay === 'night' &&
          LIT_WINDOWS.map(([x, y]) => <rect key={`${x},${y}`} x={x} y={y} width={2} height={2} fill="#ffd76a" />)}
      </g>
      <rect x={65} y={32} width={2} height={78} style={{ fill: DESK_COLORS.frame }} />
      <rect x={24} y={70} width={84} height={2} style={{ fill: DESK_COLORS.frame }} />
      <rect x={14} y={114} width={104} height={5} rx={2} style={{ fill: DESK_COLORS.frame }} />
    </>
  )
}

const FLAG_COLORS = ['#FF5A5F', '#F2B705', '#2BC48A', '#4A8CFF', '#7B5CF5', '#F0468C', '#FF8A1F']

/** Above the desk: a neon sign with its name from 知己, a welcome banner in its first week, otherwise a print of its shape. */
function WallArt({ bot, level, days }: { bot: Bot; level: number; days: number }) {
  const words = strings().desk.wall
  const id = useId()
  const { hasNeon, isRainbow } = furnitureOf(level)
  if (hasNeon) {
    const tierColor = tierOf(level).color
    return (
      <g className="level-effect" data-effect={isRainbow ? 'rainbow' : undefined}>
        <title>{isRainbow ? words.rainbowSign : words.neonSign}</title>
        <defs>
          <filter id={`${id}glow`} x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur stdDeviation={2.4} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <text
          x={172}
          y={54}
          textAnchor="middle"
          fontSize={19}
          fontWeight={700}
          letterSpacing={1}
          strokeWidth={1.2}
          filter={`url(#${id}glow)`}
          style={{ fill: `color-mix(in srgb, ${tierColor} 35%, #fff)`, stroke: tierColor }}
        >
          {[...bot.name].slice(0, 6).join('')}
        </text>
      </g>
    )
  }
  if (days <= 7) {
    return (
      <>
        <path d="M126 30 Q172 46 218 30" fill="none" strokeWidth={0.8} style={{ stroke: 'var(--color-soft)' }} />
        {FLAG_COLORS.map((color, index) => {
          const t = (index + 0.5) / FLAG_COLORS.length
          const x = (1 - t) ** 2 * 126 + 2 * (1 - t) * t * 172 + t ** 2 * 218
          const y = (1 - t) ** 2 * 30 + 2 * (1 - t) * t * 46 + t ** 2 * 30
          return <path key={color} d={`M${x - 5} ${y} h10 l-5 9z`} fill={color} />
        })}
        <text x={172} y={64} textAnchor="middle" fontSize={11} letterSpacing={2} style={{ fill: 'var(--color-soft)' }}>
          {words.welcome}
        </text>
      </>
    )
  }
  return (
    <>
      <defs>
        <pattern id={`${id}print`} width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
          <path d={bodyOf(bot.shape).path} transform="translate(2 2) scale(0.1)" fill={bot.color} />
        </pattern>
      </defs>
      <rect x={148} y={28} width={48} height={38} rx={3} style={{ fill: DESK_COLORS.frame }} />
      <rect x={151} y={31} width={42} height={32} style={{ fill: `color-mix(in srgb, ${bot.color} 12%, #fff)` }} />
      <rect x={151} y={31} width={42} height={32} fill={`url(#${id}print)`} opacity={0.55} />
    </>
  )
}

/** Beijing time, with a dot in the bot's colour at the hour of its next routine. */
function Clock({ now, nextRunAt, color }: { now: number; nextRunAt: number | null; color: string }) {
  const angleOf = (at: number) => {
    const { hour, minute } = clockOf(at)
    return ((hour % 12) + minute / 60) * 30
  }
  const { minute } = clockOf(now)
  const dotAngle = nextRunAt === null ? null : ((angleOf(nextRunAt) - 90) * Math.PI) / 180
  return (
    <g>
      <title>
        {strings().desk.wall.clock(clockLabel(now))}
        {nextRunAt !== null && strings().desk.wall.nextRoutine(clockLabel(nextRunAt))}
      </title>
      <circle
        cx={296}
        cy={46}
        r={16}
        strokeWidth={2}
        style={{ fill: DESK_COLORS.frame, stroke: 'var(--color-line)' }}
      />
      {Array.from({ length: 12 }, (_, index) => (
        <line
          key={index}
          x1={296}
          y1={33}
          x2={296}
          y2={index % 3 ? 34.5 : 35.8}
          strokeWidth={1}
          transform={`rotate(${index * 30} 296 46)`}
          style={{ stroke: 'var(--color-muted)' }}
        />
      ))}
      {dotAngle !== null && (
        <circle cx={296 + 9.5 * Math.cos(dotAngle)} cy={46 + 9.5 * Math.sin(dotAngle)} r={2.3} fill={color} />
      )}
      <Hand angle={angleOf(now)} length={7} width={2.2} />
      <Hand angle={minute * 6} length={10.5} width={1.4} />
      <circle cx={296} cy={46} r={1.6} fill={color} />
    </g>
  )
}

function Hand({ angle, length, width }: { angle: number; length: number; width: number }) {
  return (
    <line
      x1={296}
      y1={46}
      x2={296}
      y2={46 - length}
      strokeWidth={width}
      strokeLinecap="round"
      transform={`rotate(${angle} 296 46)`}
      style={{ stroke: 'var(--color-ink)' }}
    />
  )
}

interface ShelfProps {
  flows: Flow[]
  shelved: Flow[]
  color: string
  hasTrophy: boolean
}

/** A binder per flow, with a count for the ones that do not fit; a dashed empty one before the first. */
function Shelf({ flows, shelved, color, hasTrophy }: ShelfProps) {
  return (
    <>
      {shelved.map((flow, index) => {
        const [x, y, width, height] = binderBoxOf(index)
        return (
          <g key={flow.id}>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={1.5}
              style={{ fill: `color-mix(in srgb, ${color} ${BINDER_SHADES[index]}%, #fff)` }}
            />
            <rect x={x + 2} y={y + 5} width={6} height={7} rx={1} fill="#fff" opacity={0.75} />
            <circle cx={x + 5} cy={98} r={1.5} fill="#fff" opacity={0.6} />
          </g>
        )
      })}
      {shelved.length < flows.length && (
        <text x={236 + shelved.length * 12.5} y={101} fontSize={9} style={{ fill: 'var(--color-soft)' }}>
          +{flows.length - shelved.length}
        </text>
      )}
      {flows.length === 0 && (
        <rect
          x={236}
          y={74}
          width={10}
          height={30}
          rx={1.5}
          fill="none"
          strokeDasharray="2 2"
          style={{ stroke: 'var(--color-muted)' }}
        />
      )}
      {hasTrophy && (
        <g>
          <title>{strings().desk.wall.trophy}</title>
          <path d="M305 80 h14 v5 a7 7 0 0 1 -14 0z" fill="#f5c542" />
          <path
            d="M305 82 h-3 a3 3 0 0 0 3 5 M319 82 h3 a3 3 0 0 1 -3 5"
            fill="none"
            stroke="#e0a92a"
            strokeWidth={1.4}
          />
          <rect x={310} y={91} width={4} height={7} fill="#e0a92a" />
          <rect x={306} y={98} width={12} height={6} rx={1} fill="#d39a1c" />
        </g>
      )}
      <rect x={226} y={104} width={104} height={4} rx={1.5} style={{ fill: DESK_COLORS.wood }} />
      <path d="M236 108 v8 l6 -8z M314 108 v8 l6 -8z" style={{ fill: DESK_COLORS.wood }} />
    </>
  )
}
