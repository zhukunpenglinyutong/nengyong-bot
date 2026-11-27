import type { ReactNode } from 'react'
import { isUnfinished, type TaskView } from '../../shared/bridge'
import type { Flow } from '../../shared/flow'
import { TIMEZONE } from '../../shared/timezone'
import { ELAPSED_REFRESH_MS } from '../elapsedLabel'
import { taskProgressLabel } from '../taskProgressLabel'
import { BackButton } from '../ui/BackButton'
import { useNow } from '../ui/useNow'
import { PanelAddRow, PanelCard, PanelSectionTitle } from './PanelCard'
import { ModelTag } from './PanelModels'
import { locale } from '../../shared/language'
import { strings } from '../../shared/strings'

const TEACH_TEXT = strings().bot.flows.teachStarter

interface Props {
  flows: Flow[]
  tasks: TaskView[] // its recent tasks, unfinished first: the runs of each flow
  openFlowId: string | null
  onOpen: (flowId: string | null) => void // null: back to the list
  onFill: (text: string) => void // puts a message in the box for the user to finish and send
}

/** The panel's 流程 tab: the flows the bot saved, or one of them with its steps and its recent runs. */
export function FlowsTab({ flows, tasks, openFlowId, onOpen, onFill }: Props) {
  const words = strings().bot.flows
  const flow = flows.find((candidate) => candidate.id === openFlowId)
  const runsOf = (flowId: string) => tasks.filter((task) => task.flowId === flowId)
  if (flow) return <FlowDetail flow={flow} runs={runsOf(flow.id)} onBack={() => onOpen(null)} onFill={onFill} />
  return (
    <>
      <p className="pt-3.5 pb-2.5 text-sm text-muted">{words.intro}</p>
      {flows.length > 0 && (
        <PanelCard>
          <ul aria-label={words.title}>
            {flows.map((each) => (
              <li key={each.id}>
                <FlowRow flow={each} runs={runsOf(each.id)} onOpen={() => onOpen(each.id)} />
              </li>
            ))}
          </ul>
        </PanelCard>
      )}
      <PanelAddRow title={words.teach} hint={words.teachHint} onClick={() => onFill(TEACH_TEXT)} />
    </>
  )
}

function FlowRow({ flow, runs, onOpen }: { flow: Flow; runs: TaskView[]; onOpen: () => void }) {
  const words = strings().bot.flows
  const last = runs[0]
  return (
    <button type="button" onClick={onOpen} className="flex w-full flex-col p-3 text-left leading-[1.35]">
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-md text-ink">{flow.name}</span>
        {runs.some(isUnfinished) && <span className="shrink-0 text-xs text-accent">{words.inUse}</span>}
      </span>
      <small className="truncate text-sm text-soft">{flow.when}</small>
      <small className="mt-1 text-xs text-muted">
        {words.steps(flow.steps.length)} · {last ? words.lastUsed(timeOf(last.createdAt)) : words.notUsedLately}
      </small>
      {flow.model && <ModelTag model={flow.model.model} />}
    </button>
  )
}

interface DetailProps {
  flow: Flow
  runs: TaskView[]
  onBack: () => void
  onFill: (text: string) => void
}

function FlowDetail({ flow, runs, onBack, onFill }: DetailProps) {
  const words = strings().bot.flows
  const now = useNow(ELAPSED_REFRESH_MS)
  return (
    <div className="pt-3 text-soft">
      <BackButton label={words.back} onClick={onBack}>
        {words.title}
      </BackButton>
      <h4 className="mt-2 text-xl leading-snug font-semibold text-ink">{flow.name}</h4>
      <p className="mt-1 text-sm text-muted">{words.stepsUpdated(flow.steps.length, timeOf(flow.updatedAt))}</p>
      {flow.model && <ModelTag model={flow.model.model} />}
      <PanelSectionTitle>{words.when}</PanelSectionTitle>
      <p className="text-md text-ink">{flow.when}</p>
      <PanelSectionTitle>{words.stepsTitle}</PanelSectionTitle>
      <ol aria-label={words.stepsTitle} className="flex flex-col gap-2.5">
        {flow.steps.map((step, index) => (
          <li key={`${index}-${step}`} className="flex gap-2.5 text-md leading-normal text-ink">
            <span className="grid size-5 shrink-0 translate-y-0.5 place-items-center rounded-full bg-bubble text-xs font-semibold text-soft tabular-nums">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      {flow.notes.length > 0 && (
        <>
          <PanelSectionTitle>{words.cautions}</PanelSectionTitle>
          <PanelCard>
            <ul aria-label={words.cautions}>
              {flow.notes.map((note, index) => (
                <li key={`${index}-${note}`} className="p-3 text-md leading-normal text-ink">
                  {note}
                </li>
              ))}
            </ul>
          </PanelCard>
        </>
      )}
      <PanelSectionTitle>{words.recentRuns}</PanelSectionTitle>
      {runs.length ? (
        <PanelCard>
          <ul aria-label={words.recentRuns}>
            {runs.map((task) => (
              <li key={task.id} className="flex flex-col p-3 leading-[1.35]">
                <span className="truncate text-md text-ink">{task.title}</span>
                <small
                  data-status={task.status}
                  className="truncate text-sm text-muted data-[status=failed]:text-danger"
                >
                  {isUnfinished(task)
                    ? taskProgressLabel(task, now)
                    : `${strings().common.taskStatus[task.status]} · ${timeOf(task.endedAt ?? task.createdAt)}`}
                </small>
              </li>
            ))}
          </ul>
        </PanelCard>
      ) : (
        <p className="text-sm text-muted">{words.noRuns}</p>
      )}
      <div className="mt-5 flex gap-2">
        <FillButton onClick={() => onFill(words.runStarter(flow.name))}>{words.useInChat}</FillButton>
        <FillButton onClick={() => onFill(words.editStarter(flow.name))}>{words.editInChat}</FillButton>
      </div>
    </div>
  )
}

function FillButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full bg-bubble px-3.5 py-1.5 text-md text-ink">
      {children}
    </button>
  )
}

const timeOf = (at: number) =>
  new Date(at).toLocaleString(locale(), {
    timeZone: TIMEZONE,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
