import { useId } from 'react'
import type { Bot } from '../../../shared/bot'
import type { LibraryItem, PanelData, RoutineView } from '../../../shared/bridge'
import { tierOf } from '../../../shared/trust'
import { nextRoutineOf } from '../../nextRoutineOf'
import { clockOf, type DeskState, furnitureOf, isWorking, plantStageOf, type TimeOfDay } from '../deskState'
import { BOT_BOX, DeskBot } from './DeskBot'
import { DeskComputer, screenCornerOf } from './DeskComputer'
import { binderBoxOf, DeskWall, noteBoxOf } from './DeskWall'
import { DESK_COLORS } from './deskColors'
import { strings } from '../../../shared/strings'

export const SCENE_WIDTH = 340
export const SCENE_HEIGHT = 290

/** What can be pressed on the desk. */
export type DeskTarget =
  | { kind: 'bot' }
  | { kind: 'flow'; flowId: string | null }
  | { kind: 'routines' }
  | { kind: 'library' }
  | { kind: 'plant' }
  | { kind: 'lamp' }

interface Props {
  bot: Bot
  state: DeskState
  level: number
  days: number
  panel: PanelData
  now: number
  isLampOn: boolean
  waterings: number // how many times it was watered: each one replays the splash
  reaction: { kind: string; at: number } | undefined
  onPress: (target: DeskTarget) => void
}

/** The bot's desk, drawn from what it has: a binder per flow, a note per routine, paper for its library, a plant as old as
 * its time on the team, furniture by tier. The pressable parts are buttons laid over the drawing. */
export function DeskScene({ bot, state, level, days, panel, now, isLampOn, waterings, reaction, onPress }: Props) {
  const words = strings().desk.scene
  const furniture = furnitureOf(level)
  const { timeOfDay } = clockOf(now)
  const corner = screenCornerOf(furniture.hasMonitor)
  const routines = panel.routines.slice(0, 3)
  const shelved = panel.flows.slice(0, furniture.hasTrophy ? 4 : 6)
  const plantTop = PLANT_TOPS[plantStageOf(days)]
  const nextRunAt = nextRoutineOf(panel.routines)?.nextRunAt ?? null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
        data-state={state.kind}
        className="desk-scene block w-full"
        aria-hidden="true"
      >
        <rect width={SCENE_WIDTH} height={242} style={{ fill: wallOf(bot.color, timeOfDay) }} />
        <rect y={242} width={SCENE_WIDTH} height={48} style={{ fill: DESK_COLORS.floor }} />
        <rect y={238} width={SCENE_WIDTH} height={5} style={{ fill: DESK_COLORS.baseboard }} />
        <DeskWall
          bot={bot}
          level={level}
          days={days}
          now={now}
          nextRunAt={nextRunAt}
          flows={panel.flows}
          shelved={shelved}
          hasTrophy={furniture.hasTrophy}
        />
        {furniture.hasTrophy && (
          <ellipse
            cx={190}
            cy={270}
            rx={124}
            ry={12}
            style={{ fill: `color-mix(in srgb, ${tierOf(level).color} 28%, ${DESK_COLORS.floor})` }}
          />
        )}
        <Seat hasChair={furniture.hasMonitor} isTall={furniture.hasTrophy} />
        <DeskBot bot={bot} state={state.kind} reaction={reaction} />
        <Desk />
        <Plant stage={plantStageOf(days)} top={plantTop} waterings={waterings} />
        <DeskComputer bot={bot} state={state} hasMonitor={furniture.hasMonitor} />
        {routines.map((routine, index) => (
          <StickyNote key={routine.id} routine={routine} index={index} corner={corner} />
        ))}
        <Keyboard color={bot.color} />
        <Mug color={bot.color} isWarm={isWorking(state)} />
        <Papers count={panel.library.length} />
        {furniture.hasLamp && <Lamp color={bot.color} isOn={isLampOn} />}
        {state.kind === 'nap' && <Snores />}
        {state.kind === 'window' && <ThoughtOfFish />}
      </svg>
      <Spot
        box={[BOT_BOX.x, BOT_BOX.y, 100 * BOT_BOX.scale, 194 - BOT_BOX.y]}
        label={words.poke(bot.name)}
        onPress={() => onPress({ kind: 'bot' })}
      />
      {shelved.map((flow, index) => (
        <Spot
          key={flow.id}
          box={binderBoxOf(index)}
          label={words.flow(flow.name)}
          onPress={() => onPress({ kind: 'flow', flowId: flow.id })}
        />
      ))}
      {shelved.length < panel.flows.length && (
        <Spot
          box={[234 + shelved.length * 12.5, 90, 16, 14]}
          label={words.moreFlows(panel.flows.length - shelved.length)}
          onPress={() => onPress({ kind: 'flow', flowId: null })}
        />
      )}
      {panel.flows.length === 0 && (
        <Spot box={[234, 72, 14, 32]} label={words.noFlows} onPress={() => onPress({ kind: 'flow', flowId: null })} />
      )}
      {routines.map((routine, index) => (
        <Spot
          key={routine.id}
          box={noteBoxOf(corner, index)}
          label={routine.isEnabled ? words.routine(routine.name) : words.pausedRoutine(routine.name)}
          onPress={() => onPress({ kind: 'routines' })}
        />
      ))}
      <Spot box={[264, 164, 32, 30]} label={libraryLabel(panel.library)} onPress={() => onPress({ kind: 'library' })} />
      <Spot
        box={[24, plantTop - 4, 34, 194 - plantTop + 4]}
        label={words.plant(days, strings().desk.plants[plantStageOf(days)])}
        onPress={() => onPress({ kind: 'plant' })}
      />
      {furniture.hasLamp && (
        <Spot
          box={[276, 132, 46, 26]}
          label={isLampOn ? words.lampOff : words.lampOn}
          onPress={() => onPress({ kind: 'lamp' })}
        />
      )}
    </div>
  )
}

function wallOf(color: string, timeOfDay: TimeOfDay): string {
  const tinted = `color-mix(in srgb, ${color} 12%, var(--color-surface))`
  switch (timeOfDay) {
    case 'day':
      return tinted
    case 'dusk':
      return `color-mix(in srgb, #ff9a6b 12%, ${tinted})`
    case 'night':
      return `color-mix(in srgb, ${color} 12%, light-dark(#c3c6d6, #1b1c24))`
    default:
      return timeOfDay satisfies never
  }
}

const libraryLabel = (library: LibraryItem[]) =>
  library.length
    ? strings().desk.scene.library(library.length, library[0].path.split('/').at(-1) ?? '')
    : strings().desk.scene.emptyLibrary

/** A pressable part of the drawing, placed in the scene's own units so it scales with it. */
function Spot({ box: [x, y, width, height], label, onPress }: SpotProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onPress}
      className="absolute rounded-sm"
      style={{
        left: `${(x / SCENE_WIDTH) * 100}%`,
        top: `${(y / SCENE_HEIGHT) * 100}%`,
        width: `${(width / SCENE_WIDTH) * 100}%`,
        height: `${(height / SCENE_HEIGHT) * 100}%`,
      }}
    />
  )
}

interface SpotProps {
  box: [x: number, y: number, width: number, height: number]
  label: string
  onPress: () => void
}

/** 初识 sits on a stool, only its legs showing under the desk; a chair from 熟络, a taller one from 信赖. */
function Seat({ hasChair, isTall }: { hasChair: boolean; isTall: boolean }) {
  if (!hasChair) {
    return (
      <path
        d="M196 224 L190 262 M220 224 L226 262"
        strokeWidth={3}
        strokeLinecap="round"
        style={{ stroke: DESK_COLORS.metal }}
      />
    )
  }
  return (
    <>
      {isTall ? (
        <>
          <rect x={174} y={104} width={68} height={100} rx={18} style={{ fill: DESK_COLORS.chair }} />
          <rect x={182} y={113} width={52} height={88} rx={13} style={{ fill: DESK_COLORS.cushion }} />
        </>
      ) : (
        <rect x={178} y={120} width={60} height={84} rx={14} style={{ fill: DESK_COLORS.chair }} />
      )}
      <rect x={205} y={224} width={6} height={30} style={{ fill: DESK_COLORS.metal }} />
      <path d="M182 256 H234" strokeWidth={4} strokeLinecap="round" style={{ stroke: DESK_COLORS.chair }} />
      {[184, 208, 232].map((cx) => (
        <circle key={cx} cx={cx} cy={260} r={3} style={{ fill: DESK_COLORS.chair }} />
      ))}
    </>
  )
}

function Desk() {
  return (
    <g style={{ fill: DESK_COLORS.wood }}>
      <rect x={14} y={194} width={312} height={8} rx={3} style={{ fill: DESK_COLORS.deskTop }} />
      <rect x={22} y={202} width={62} height={64} rx={2} />
      {[208, 230, 252].map((y) => (
        <rect key={y} x={45} y={y} width={16} height={2.4} rx={1.2} style={{ fill: DESK_COLORS.handle }} />
      ))}
      {[222, 244].map((y) => (
        <rect key={y} x={26} y={y} width={54} height={1} opacity={0.5} style={{ fill: DESK_COLORS.handle }} />
      ))}
      <rect x={84} y={202} width={226} height={22} />
      <rect x={306} y={202} width={10} height={64} rx={2} />
    </g>
  )
}

const LEAVES: [x: number, y: number, rx: number, ry: number, angle: number][][] = [
  [
    [36, 168, 4.5, 2.4, -25],
    [44, 167, 4.5, 2.4, 25],
  ],
  [
    [34, 162, 7, 3.5, -35],
    [47, 158, 7, 3.5, 35],
    [36, 150, 6, 3, -20],
    [46, 146, 6, 3, 25],
    [41, 140, 5, 2.6, 0],
  ],
  [
    [30, 160, 10, 4.5, -40],
    [51, 156, 10, 4.5, 40],
    [31, 140, 9, 4, -30],
    [51, 134, 9, 4, 30],
    [35, 122, 8, 3.6, -15],
    [47, 116, 8, 3.6, 20],
    [41, 106, 6, 3, 0],
  ],
]
const PLANT_TOPS = [164, 136, 102, 100]
const FLOWERS = [
  [30, 136],
  [52, 124],
  [41, 102],
]

function Plant({ stage, top, waterings }: { stage: number; top: number; waterings: number }) {
  return (
    <g key={waterings} className={waterings > 0 ? 'desk-watered' : undefined}>
      <g className="desk-leaves">
        <path d={`M40 177 V${top + 6}`} stroke="#3a9a5a" strokeWidth={1.6} />
        {LEAVES[Math.min(stage, 2)].map(([cx, cy, rx, ry, angle], index) => (
          <ellipse
            key={`${cx},${cy}`}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill={index % 2 ? '#4caf6a' : '#5cc27a'}
            transform={`rotate(${angle} ${cx} ${cy})`}
          />
        ))}
        {stage === 3 &&
          FLOWERS.map(([cx, cy]) => (
            <g key={cx}>
              <circle cx={cx} cy={cy} r={3.2} fill="#ff8fb3" />
              <circle cx={cx} cy={cy} r={1.2} fill="#ffd45c" />
            </g>
          ))}
      </g>
      <path d="M29 180 h22 l-2.5 14 h-17z" fill="#e07b52" />
      <rect x={27.5} y={177} width={25} height={5} rx={1.5} fill="#ea8d66" />
      <g className="desk-drops">
        {[34, 40, 46].map((cx, index) => (
          <ellipse
            key={cx}
            cx={cx}
            cy={top - 10}
            rx={1.3}
            ry={2}
            fill="#6cc4ff"
            style={{ animationDelay: `${index * 0.12}s` }}
          />
        ))}
      </g>
    </g>
  )
}

function StickyNote({
  routine,
  index,
  corner,
}: {
  routine: RoutineView
  index: number
  corner: { x: number; y: number }
}) {
  const [x, y, width, height] = noteBoxOf(corner, index)
  return (
    <g transform={`rotate(${index % 2 ? 7 : -6} ${x + width / 2} ${y + height / 2})`}>
      <rect x={x} y={y} width={width} height={height} rx={1} fill={routine.isEnabled ? '#ffd65c' : '#d6d6d9'} />
      <rect x={x + 2.5} y={y + 4} width={7} height={1.2} fill="#000" opacity={0.25} />
      <rect x={x + 2.5} y={y + 7} width={5} height={1.2} fill="#000" opacity={0.25} />
    </g>
  )
}

function Keyboard({ color }: { color: string }) {
  return (
    <g style={{ color }}>
      <rect x={176} y={189} width={62} height={5} rx={2} fill="#3a3a40" />
      {Array.from({ length: 8 }, (_, index) => (
        <rect
          key={index}
          className="desk-key"
          x={179 + index * 7}
          y={190}
          width={5}
          height={1.6}
          rx={0.6}
          fill="#6b6b73"
          style={{ animationDelay: `-${(index * 0.37) % 0.6}s` }}
        />
      ))}
    </g>
  )
}

function Mug({ color, isWarm }: { color: string; isWarm: boolean }) {
  return (
    <>
      <rect x={246} y={181} width={13} height={13} rx={2.5} fill="#fff" style={{ stroke: 'var(--color-line)' }} />
      <rect x={246} y={185} width={13} height={3} fill={color} />
      <path d="M259 184 a3.5 3.5 0 0 1 0 7" fill="none" stroke="#ddd" strokeWidth={2} />
      {isWarm &&
        [250, 255].map((x, index) => (
          <path
            key={x}
            className="desk-steam"
            d={`M${x} 178 q-2 -3 0 -6 q2 -3 0 -6`}
            fill="none"
            strokeWidth={1.2}
            strokeLinecap="round"
            style={{ stroke: 'var(--color-muted)', animationDelay: `${index * 1.1}s` }}
          />
        ))}
    </>
  )
}

/** The library as a pile of paper on a tray: higher with more files. */
function Papers({ count }: { count: number }) {
  return (
    <>
      <rect x={264} y={191.6} width={32} height={2.4} rx={1} style={{ fill: DESK_COLORS.metal }} />
      {Array.from({ length: Math.min(12, Math.ceil(count / 8)) }, (_, index) => (
        <rect
          key={index}
          x={267 + (index % 2 ? 1.2 : -0.6)}
          y={191.6 - (index + 1) * 2.3}
          width={26}
          height={2.3}
          fill="#fff"
          stroke="#d8d8dc"
          strokeWidth={0.5}
        />
      ))}
    </>
  )
}

function Lamp({ color, isOn }: { color: string; isOn: boolean }) {
  const id = useId()
  return (
    <>
      {isOn && (
        <>
          <defs>
            <linearGradient id={`${id}light`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="#ffd36b" stopOpacity={0.55} />
              <stop offset={1} stopColor="#ffd36b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d="M278 146 L292 154 L302 194 L234 194 Z" fill={`url(#${id}light)`} />
        </>
      )}
      <ellipse cx={312} cy={193} rx={9} ry={2.5} fill="#3a3a40" />
      <path
        d="M312 192 L318 156 L293 140"
        fill="none"
        stroke="#3a3a40"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={318} cy={156} r={2.2} fill="#3a3a40" />
      <path d="M290 136 L298 142 L292 154 L278 146 Z" fill={color} />
      {isOn && <circle cx={285} cy={150} r={2.4} fill="#fff6c8" />}
    </>
  )
}

function Snores() {
  return (
    <g className="desk-snores" fontWeight={600} style={{ fill: 'var(--color-soft)' }}>
      {[
        [238, 142, 9, 'z'],
        [246, 133, 11, 'z'],
        [255, 123, 13, 'Z'],
      ].map(([x, y, size, letter], index) => (
        <text key={x} x={x} y={y} fontSize={size} style={{ animationDelay: `${index * 0.9}s` }}>
          {letter}
        </text>
      ))}
    </g>
  )
}

/** Daydreaming at the window: a fish in its thought bubble, for 摸鱼. */
function ThoughtOfFish() {
  return (
    <g className="desk-thought">
      <circle cx={239} cy={136} r={1.5} style={{ fill: 'var(--color-surface)' }} />
      <circle cx={244.5} cy={129.5} r={2.2} style={{ fill: 'var(--color-surface)' }} />
      <ellipse cx={259} cy={118} rx={14} ry={9.5} style={{ fill: 'var(--color-surface)' }} />
      <ellipse cx={256.5} cy={118} rx={5.5} ry={3.2} fill="#4a8cff" />
      <path d="M261.5 118 l5 -3.5 v7z" fill="#4a8cff" />
      <circle cx={254} cy={117.2} r={0.8} fill="#fff" />
    </g>
  )
}
