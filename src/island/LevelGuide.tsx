import { strings } from '../../shared/strings'
import { BackButton } from '../ui/BackButton'
import {
  MAX_LEVEL,
  MESSAGES_PER_POINT,
  POINTS_PER_FIRST_FLOW_RUN,
  POINTS_PER_FLOW_RUN,
  POINTS_PER_FLOW_SAVED,
  POINTS_PER_LEVEL,
  pointsToReach,
  TIERS,
  type Trust,
  tierOf,
} from '../../shared/trust'

const EARNINGS = [
  [strings().island.levelGuide.earnChat(MESSAGES_PER_POINT), 1],
  [strings().island.levelGuide.earnFlowSaved, POINTS_PER_FLOW_SAVED],
  [strings().island.levelGuide.earnFirstFlowRun, POINTS_PER_FIRST_FLOW_RUN],
  [strings().island.levelGuide.earnFlowRun, POINTS_PER_FLOW_RUN],
] as const

interface Props {
  trust: Trust
  onBack: () => void
  className: string
}

/** The opened island turned to the rules of its level: what earns 经验, what each level takes, where the bot stands. */
export function LevelGuide({ trust, onBack, className }: Props) {
  const tier = tierOf(trust.level)

  return (
    <div className={`max-h-[440px] overflow-y-auto text-white/60 ${className}`}>
      <BackButton onClick={onBack}>{strings().island.levelGuide.back}</BackButton>
      <Heading>{strings().island.levelGuide.howToEarn}</Heading>
      <ul className="flex flex-col gap-1">
        {EARNINGS.map(([label, points]) => (
          <li
            key={label}
            className="flex h-9 items-center justify-between rounded-lg bg-white/8 px-3 text-md text-white"
          >
            {label}
            <span className="font-bold tabular-nums">+{points}</span>
          </li>
        ))}
      </ul>
      <Heading>{strings().island.levelGuide.eachLevel}</Heading>
      <p className="text-xs leading-relaxed text-white/60">{stepLine(trust)}</p>
      <ol className="mt-2">
        {TIERS.map((candidate, index) => (
          <li
            key={candidate.name}
            aria-current={candidate === tier}
            className="grid h-[30px] grid-cols-[8px_72px_1fr_auto] items-center gap-2.5 rounded-md px-2.5 text-sm text-white/70 tabular-nums aria-current:bg-white/10 aria-current:font-semibold aria-current:text-white"
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: candidate.color }} />
            {candidate.name}
            <span>
              {rangeOf(candidate.from, TIERS[index + 1]?.from)}
              {candidate === tier && (
                <span className="ml-1.5 text-xs text-white/60">{strings().island.levelGuide.youAreHere}</span>
              )}
            </span>
            <span className="text-xs font-normal text-white/40">
              {candidate.from === 1
                ? strings().island.levelGuide.start
                : strings().island.levelGuide.total(pointsToReach(candidate.from))}
            </span>
          </li>
        ))}
      </ol>
      <Heading>{strings().island.levelGuide.notes}</Heading>
      <p className="text-xs leading-relaxed text-white/60">{strings().island.levelGuide.notesBody}</p>
    </div>
  )
}

function Heading({ children }: { children: string }) {
  return <h4 className="mt-4 mb-1.5 text-xs font-semibold text-white/40">{children}</h4>
}

function stepLine({ level, points, needed }: Trust) {
  const rule = strings().island.levelGuide.rule(POINTS_PER_LEVEL)
  if (level === MAX_LEVEL) return `${rule}${strings().island.levelGuide.maxed}`
  return `${rule}${strings().island.levelGuide.nextLevel(level, needed, needed - points)}`
}

const rangeOf = (from: number, nextFrom: number | undefined) => (nextFrom ? `Lv.${from}–${nextFrom - 1}` : `Lv.${from}`)
