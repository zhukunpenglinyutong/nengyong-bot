import type { RoutineView } from '../../shared/bridge'
import type { Duty, KeyResult, Objective } from '../../shared/duty'
import { strings } from '../../shared/strings'
import { Icon } from '../ui/Icon'
import { Switch } from '../ui/Switch'
import { PanelAddRow, PanelCard, PanelSectionTitle } from './PanelCard'

interface Props {
  duty: Duty
  routines: RoutineView[] // its weekly review is one of them
  onFill: (text: string) => void // puts a message in the box for the user to finish and send
  onReview?: (isOn: boolean) => void // absent on a device: the review is switched on the computer
}

/** The panel's 职责 list: why the bot is there, its objectives and their key results, and whether it reviews them weekly. */
export function DutyTab({ duty, routines, onFill, onReview }: Props) {
  const words = strings().bot.duty
  if (!duty.objectives.length) return <NotSet purpose={duty.purpose} onFill={onFill} />
  const isReviewOn = routines.some((routine) => routine.id === duty.reviewRoutineId && routine.isEnabled)
  return (
    <>
      <p className="pt-3.5 pb-2.5 text-sm text-muted">{words.intro}</p>
      <PanelCard className="px-3.5 py-3">
        <small className="text-xs text-muted">{words.purpose}</small>
        <p className="mt-0.5 text-lg leading-normal font-medium text-ink">{duty.purpose}</p>
        <small className="mt-1.5 block text-xs text-muted">{words.version(duty.version)}</small>
      </PanelCard>
      <PanelSectionTitle>{words.objectives}</PanelSectionTitle>
      <ol aria-label={words.objectives} className="flex flex-col gap-2.5">
        {duty.objectives.map((objective, index) => (
          <li key={objective.id}>
            <ObjectiveCard objective={objective} index={index + 1} />
          </li>
        ))}
      </ol>
      <PanelCard className="mt-2.5 flex items-center gap-3 p-3 leading-[1.4]">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-md text-ink">{words.review}</span>
          <small className="text-sm text-soft">{isReviewOn ? words.reviewOn : words.reviewOff}</small>
        </span>
        {onReview && <Switch label={words.review} isOn={isReviewOn} onChange={onReview} />}
      </PanelCard>
      {duty.outOfScope.length > 0 && (
        <>
          <PanelSectionTitle>{words.outOfScope}</PanelSectionTitle>
          <PanelCard>
            <ul aria-label={words.outOfScope} className="divide-y divide-line">
              {duty.outOfScope.map((line) => (
                <li key={line} className="p-3 text-sm text-soft">
                  {line}
                </li>
              ))}
            </ul>
          </PanelCard>
        </>
      )}
      <PanelAddRow title={words.adjust} hint={words.adjustHint} onClick={() => onFill(words.adjustStarter)} />
    </>
  )
}

function ObjectiveCard({ objective, index }: { objective: Objective; index: number }) {
  const words = strings().bot.duty
  const met = objective.keyResults.filter((keyResult) => keyResult.progress?.verdict === 'met').length
  return (
    <PanelCard className="divide-y divide-line">
      <h6 className="flex items-baseline gap-2 px-3 py-2.5 leading-[1.35]">
        <span className="shrink-0 text-xs text-muted">{words.objective(index)}</span>
        <span className="min-w-0 flex-1 text-md font-medium text-ink">{objective.name}</span>
        <span className="shrink-0 text-xs text-muted">{words.met(met, objective.keyResults.length)}</span>
      </h6>
      <ul aria-label={objective.name} className="divide-y divide-line">
        {objective.keyResults.map((keyResult) => (
          <li key={keyResult.text}>
            <KeyResultRow keyResult={keyResult} />
          </li>
        ))}
      </ul>
    </PanelCard>
  )
}

function KeyResultRow({ keyResult: { text, window, source, progress } }: { keyResult: KeyResult }) {
  const words = strings().bot.duty
  return (
    <div className="px-3 pt-2.5 pb-3 text-sm leading-[1.4]">
      <span className="block text-ink">{text}</span>
      <span className="mt-1 block text-xs text-soft tabular-nums">{progress?.text ?? words.noProgress}</span>
      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-bubble">
        <span
          data-verdict={progress?.verdict}
          style={{ width: `${Math.round((progress?.ratio ?? 0) * 100)}%` }}
          className="block h-full rounded-full bg-ink data-[verdict=behind]:bg-warning"
        />
      </span>
      <small className="mt-1 block text-xs text-muted">
        {[window, source, progress && words.verdicts[progress.verdict]].filter(Boolean).join(' · ')}
      </small>
    </div>
  )
}

function NotSet({ purpose, onFill }: { purpose: string; onFill: (text: string) => void }) {
  const words = strings().bot.duty
  return (
    <>
      <p className="pt-3.5 pb-2.5 text-sm text-muted">{words.intro}</p>
      {purpose && (
        <PanelCard className="px-3.5 py-3">
          <small className="text-xs text-muted">{words.onlyPurpose}</small>
          <div className="mt-1 flex flex-col gap-2 text-md leading-normal text-ink">
            {purpose
              .split('\n')
              .filter((line) => line.trim())
              .map((line) => (
                <p key={line}>{line}</p>
              ))}
          </div>
        </PanelCard>
      )}
      <p className="mt-2.5 flex items-start gap-2.5 rounded-lg bg-bubble p-3 text-sm leading-normal text-soft">
        <Icon name="warning" size={17} />
        <span className="flex flex-col">
          <span className="text-md text-ink">{words.notSet}</span>
          {words.notSetHint}
        </span>
      </p>
      <PanelAddRow title={words.plan} hint={words.planHint} onClick={() => onFill(words.planStarter)} />
    </>
  )
}
