import { type ReactNode, useId } from 'react'
import type { Bot } from '../../../shared/bot'
import { bodyOf } from '../BotAvatar'
import type { DeskState } from '../deskState'
import { DESK_COLORS } from './deskColors'
import { strings } from '../../../shared/strings'

const SCREEN_WIDTH = 92 // every screen is drawn 92 wide and scaled to the laptop or the monitor

const SCREEN_BACKGROUND: Record<DeskState['kind'], string> = {
  replying: '#f4f4f6',
  replied: '#0f3a2a',
  task: '#15203b',
  failed: '#3a1416',
  caught: '#fff',
  video: '#0e1116',
  game: '#2e5e35',
  window: '#1f2638',
  nap: '#0b0b0e',
}

/** The top right corner of the computer, where the routines' sticky notes go. */
export const screenCornerOf = (hasMonitor: boolean) => (hasMonitor ? { x: 162, y: 108 } : { x: 147, y: 151 })

interface Props {
  bot: Bot
  state: DeskState
  hasMonitor: boolean
}

/** A laptop before 熟络, a monitor after, its screen showing what the bot is up to. */
export function DeskComputer({ bot, state, hasMonitor }: Props) {
  const screen = hasMonitor ? { x: 66, y: 112, width: 92, height: 58 } : { x: 88, y: 154, width: 56, height: 32 }
  const height = (SCREEN_WIDTH * screen.height) / screen.width
  return (
    <>
      {hasMonitor ? (
        <>
          <rect x={62} y={108} width={100} height={66} rx={5} fill="#2a2a2e" />
          <rect x={106} y={174} width={12} height={15} style={{ fill: DESK_COLORS.metal }} />
          <rect x={92} y={188} width={40} height={6} rx={2} style={{ fill: DESK_COLORS.metal }} />
          <circle cx={112} cy={171.5} r={1} fill={state.kind === 'nap' ? '#f5a524' : '#34c759'} />
        </>
      ) : (
        <>
          <rect x={85} y={151} width={62} height={38} rx={3} fill="#2a2a2e" />
          <rect x={76} y={189} width={80} height={5} rx={2} style={{ fill: DESK_COLORS.metal }} />
        </>
      )}
      <svg {...screen} viewBox={`0 0 ${SCREEN_WIDTH} ${height}`} aria-hidden="true">
        <rect width={SCREEN_WIDTH} height={height} fill={SCREEN_BACKGROUND[state.kind]} />
        <ScreenContent bot={bot} state={state} height={height} />
      </svg>
    </>
  )
}

function ScreenContent({ bot, state, height }: { bot: Bot; state: DeskState; height: number }): ReactNode {
  const middle = height / 2
  switch (state.kind) {
    case 'replying':
      return (
        <>
          <rect x={50} y={7} width={34} height={8} rx={4} fill="#dcdce0" />
          <circle cx={11} cy={24} r={3.5} fill={bot.color} />
          {[56, 48, 30].map((width, row) => (
            <rect
              key={width}
              className="desk-type-line"
              x={18}
              y={21 + row * 8}
              width={width}
              height={4}
              rx={2}
              fill="#c4c4cc"
              style={{ animationDelay: `${row * 0.5}s` }}
            />
          ))}
          <rect className="desk-cursor" x={50} y={36} width={1.6} height={6} fill={bot.color} />
        </>
      )
    case 'replied':
      return (
        <Verdict middle={middle} color="#2bc48a" label={strings().desk.computer.replied} labelColor="#9ee8c7" isDone />
      )
    case 'task':
      return (
        <>
          <text x={8} y={15} fontSize={7.5} fill="#fff">
            {clip(state.task.title, 9)}
          </text>
          <text x={8} y={26} fontSize={6} fill="#9fb3d9">
            {clip(state.task.statusText || strings().common.taskStatus[state.task.status], 13)}
          </text>
          <circle
            className="desk-spin"
            cx={83}
            cy={12}
            r={3.5}
            fill="none"
            stroke={bot.color}
            strokeWidth={1.4}
            strokeDasharray="12 10"
          />
          <rect x={8} y={height - 13} width={76} height={4} rx={2} fill="#2a3a5e" />
          <rect className="desk-indeterminate" x={8} y={height - 13} width={25} height={4} rx={2} fill={bot.color} />
        </>
      )
    case 'failed':
      return (
        <Verdict
          middle={middle}
          color="#e5242a"
          label={strings().desk.computer.failed}
          labelColor="#ffb3b5"
          isDone={false}
        />
      )
    case 'caught':
      return <Spreadsheet height={height} />
    case 'video':
      return <ShortDrama height={height} />
    case 'game':
      return <Moba bot={bot} height={height} />
    case 'window':
      return (
        <g className="desk-dvd-x">
          <g className="desk-dvd-y">
            <path d={bodyOf(bot.shape).path} transform="scale(0.16)" fill={bot.color} />
          </g>
        </g>
      )
    case 'nap':
      return null
    default:
      return state satisfies never
  }
}

const clip = (text: string, length: number) =>
  [...text].length > length ? `${[...text].slice(0, length).join('')}…` : text

interface VerdictProps {
  middle: number
  color: string
  label: string
  labelColor: string
  isDone: boolean
}

function Verdict({ middle, color, label, labelColor, isDone }: VerdictProps) {
  return (
    <>
      <circle cx={46} cy={middle - 5} r={9} fill={color} />
      {isDone ? (
        <path
          d={`M41.5 ${middle - 5} l3 3 l5.5 -6`}
          stroke="#fff"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <>
          <rect x={45} y={middle - 11} width={2} height={8} rx={1} fill="#fff" />
          <circle cx={46} cy={middle} r={1.2} fill="#fff" />
        </>
      )}
      <text x={46} y={middle + 15} textAnchor="middle" fontSize={7} fill={labelColor}>
        {label}
      </text>
    </>
  )
}

/** The screen flipped to a spreadsheet the moment it is caught slacking. */
function Spreadsheet({ height }: { height: number }) {
  const rows = Array.from({ length: Math.floor((height - 9) / 7) }, (_, index) => 9 + index * 7)
  return (
    <>
      <rect width={SCREEN_WIDTH} height={8} fill="#1f9d55" />
      <text x={4} y={5.8} fontSize={5} fill="#fff">
        {strings().desk.computer.report}
      </text>
      {rows.map((rowY) => (
        <g key={rowY}>
          <rect y={rowY + 6.6} width={SCREEN_WIDTH} height={0.4} fill="#d9dde3" />
          {[3, 25, 49, 73].map((cellX, column) => (
            <rect
              key={cellX}
              x={cellX}
              y={rowY + 2.5}
              width={column ? 10 + ((rowY + column * 5) % 7) : 14}
              height={1.8}
              rx={0.9}
              fill={column ? '#c3c8d0' : '#8a93a0'}
            />
          ))}
        </g>
      ))}
      {[22, 46, 70].map((lineX) => (
        <rect key={lineX} x={lineX} y={8} width={0.4} height={height - 8} fill="#d9dde3" />
      ))}
    </>
  )
}

/** A portrait short drama in 红果's red: just enough to be recognised, not the app itself. */
function ShortDrama({ height }: { height: number }) {
  const words = strings().desk.computer
  const id = useId()
  const floor = height - 7
  const heartY = floor - 30
  return (
    <>
      <circle cx={6} cy={6.5} r={2.4} fill="#ff3b30" />
      <path d="M6 4.2 q.6 -1.8 2.4 -1.8" stroke="#3fbf5f" strokeWidth={0.9} fill="none" strokeLinecap="round" />
      <text x={10.5} y={8.3} fontSize={5} fontWeight={700} fill="#ff3b30">
        {words.dramaApp}
      </text>
      <clipPath id={`${id}drama`}>
        <rect x={31} y={3} width={30} height={floor - 3} rx={2} />
      </clipPath>
      <g clipPath={`url(#${id}drama)`}>
        <rect x={31} y={3} width={30} height={floor - 3} fill="#4a2230" />
        <path d={`M33 ${floor} v-9 a7 7 0 0 1 14 0 v9z`} fill="#1d1d24" />
        <circle cx={40} cy={floor - 21} r={4.4} fill="#f5cdb5" />
        <path d={`M35.6 ${floor - 22} a4.4 4.4 0 0 1 8.8 0z`} fill="#2a1d1d" />
        <path d={`M45 ${floor} v-8 a7 7 0 0 1 14 0 v8z`} fill="#ff5a6e" />
        <circle cx={52} cy={floor - 20} r={5.2} fill="#2a1d1d" />
        <circle cx={52} cy={floor - 19.4} r={4.2} fill="#f5cdb5" />
        <path
          className="desk-bob"
          d={`M46 ${heartY + 1.6} c-2.6 -1.9 -3.3 -3.6 -1.7 -4.4 c.8 -.4 1.5 0 1.7 .6 c.2 -.6 .9 -1 1.7 -.6 c1.6 .8 .9 2.5 -1.7 4.4z`}
          fill="#ff4d6d"
        />
        <text x={33.5} y={8.5} fontSize={3.6} fill="#fff" opacity={0.8}>
          {words.episode}
        </text>
        <text
          x={46}
          y={floor - 3}
          textAnchor="middle"
          fontSize={4}
          fill="#fff"
          stroke="#000"
          strokeWidth={0.7}
          paintOrder="stroke"
        >
          {words.subtitle}
        </text>
      </g>
      <rect x={31} y={height - 4.5} width={30} height={1.2} rx={0.6} fill="#fff" opacity={0.2} />
      <rect className="desk-progress" x={31} y={height - 4.5} width={30} height={1.2} rx={0.6} fill="#ff3b30" />
    </>
  )
}

/** A MOBA in a few marks: lane, minimap, score, joystick and skill buttons; the bot's own shape is the hero. */
function Moba({ bot, height }: { bot: Bot; height: number }) {
  const middle = height / 2
  return (
    <>
      <path d={`M-6 ${height + 6} L98 -6`} stroke="#4f8a4a" strokeWidth={16} />
      <rect x={3} y={3} width={14} height={14} rx={1.5} fill="#1d3b22" stroke="#9ccf8f" strokeWidth={0.5} />
      <path d="M4 16 L16 4" stroke="#4f8a4a" strokeWidth={2} />
      <circle cx={7} cy={13} r={1.3} fill="#4a8cff" />
      <circle cx={13} cy={7} r={1.3} fill="#e5484d" />
      <text x={89} y={7.5} textAnchor="end" fontSize={4.5} fontWeight={700} fill="#fff">
        8/0/3
      </text>
      <g className="desk-bob">
        <rect x={37} y={middle - 12} width={16} height={1.8} rx={0.9} fill="#000" opacity={0.35} />
        <rect x={37} y={middle - 12} width={13} height={1.8} rx={0.9} fill="#3fdc5a" />
        <path d={bodyOf(bot.shape).path} transform={`translate(37 ${middle - 9}) scale(0.16)`} fill={bot.color} />
      </g>
      <path
        className="desk-flicker"
        d={`M54 ${middle - 2} L63 ${middle - 5}`}
        stroke="#ffe066"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <rect x={62} y={middle - 13} width={12} height={1.8} rx={0.9} fill="#000" opacity={0.35} />
      <rect className="desk-enemy-hp" x={62} y={middle - 13} width={12} height={1.8} rx={0.9} fill="#e5484d" />
      <circle cx={68} cy={middle - 5} r={5} fill="#e5484d" />
      <circle cx={66.5} cy={middle - 6} r={1} fill="#fff" />
      <circle cx={69.5} cy={middle - 6} r={1} fill="#fff" />
      <circle cx={11} cy={height - 10} r={6.5} fill="none" stroke="#fff" strokeOpacity={0.5} />
      <circle cx={12.5} cy={height - 11} r={2.6} fill="#fff" opacity={0.6} />
      <circle cx={82} cy={height - 9} r={6} fill="#fff" opacity={0.35} />
      <circle className="desk-flicker desk-flicker-late" cx={82} cy={height - 9} r={6} fill="#ffe066" opacity={0.5} />
      {[
        [70, height - 6],
        [71, height - 16],
        [80, height - 21],
      ].map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r={3} fill="#fff" opacity={0.3} />
      ))}
    </>
  )
}
