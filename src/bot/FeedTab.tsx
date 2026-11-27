import type { Bot } from '../../shared/bot'
import {
  type Entry,
  isUnfinished,
  type PanelData,
  type RoutineView,
  type TaskStatus,
  type TaskView,
} from '../../shared/bridge'
import type { Flow } from '../../shared/flow'
import { locale } from '../../shared/language'
import { strings } from '../../shared/strings'
import { calendarDay, TIMEZONE } from '../../shared/timezone'
import { ELAPSED_REFRESH_MS } from '../elapsedLabel'
import { useNavigation } from '../NavigationContext'
import { taskProgressLabel } from '../taskProgressLabel'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Switch } from '../ui/Switch'
import { useNow } from '../ui/useNow'
import { PanelCard, PanelEmpty, PanelSectionTitle } from './PanelCard'
import { ModelTag, PanelModels } from './PanelModels'

interface FeedTabProps {
  panel: PanelData
  entries: Entry[]
  bots: Bot[]
  isDebug: boolean
  onToggleRoutine: (routineId: string, isEnabled: boolean) => void
  onStopTask: (taskId: string) => void
}

export function FeedTab({ panel, entries, bots, isDebug, onToggleRoutine, onStopTask }: FeedTabProps) {
  const unfinished = panel.tasks.filter(isUnfinished)
  const ended = isDebug ? panel.tasks.filter((task) => !isUnfinished(task)) : []
  return (
    <>
      <PanelModels models={panel.models} entries={entries} />
      {unfinished.length + panel.routines.length + ended.length === 0 && (
        <PanelEmpty>{strings().bot.panel.noActivity}</PanelEmpty>
      )}
      {unfinished.length > 0 && <RunningTasks tasks={unfinished} flows={panel.flows} onStop={onStopTask} />}
      {panel.routines.length > 0 && (
        <Routines routines={panel.routines} flows={panel.flows} onToggle={onToggleRoutine} />
      )}
      {ended.length > 0 && <RecentTasks tasks={ended} bots={bots} />}
    </>
  )
}

interface RunningTasksProps {
  tasks: TaskView[]
  flows: Flow[]
  onStop: (taskId: string) => void
}

function RunningTasks({ tasks, flows, onStop }: RunningTasksProps) {
  const words = strings().bot.panel
  const now = useNow(ELAPSED_REFRESH_MS)
  return (
    <>
      <PanelSectionTitle>{words.inProgress}</PanelSectionTitle>
      <PanelCard>
        <ul aria-label={words.inProgress}>
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 p-3 leading-[1.35]">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-md text-ink">{task.title}</span>
                <small className="truncate text-sm text-muted">{taskProgressLabel(task, now)}</small>
                <span className="flex flex-wrap gap-x-1">
                  <FlowLink flow={flows.find((flow) => flow.id === task.flowId)} />
                  {task.model && <ModelTag model={task.model} />}
                </span>
              </span>
              <IconButton icon="stop" label={words.stopTask(task.title)} onClick={() => onStop(task.id)} />
            </li>
          ))}
        </ul>
      </PanelCard>
    </>
  )
}

const STATUS_ICON: Record<TaskStatus, IconName> = {
  waiting: 'clock',
  running: 'clock',
  done: 'check',
  failed: 'close',
  stopped: 'stop',
  interrupted: 'stop',
}

function RecentTasks({ tasks, bots }: { tasks: TaskView[]; bots: Bot[] }) {
  const words = strings().bot.panel
  const today = calendarDay(useNow(ELAPSED_REFRESH_MS))
  return (
    <>
      <PanelSectionTitle>{words.recentTasks}</PanelSectionTitle>
      <PanelCard className="pb-1.5">
        <ul aria-label={words.recentTasks}>
          {byDay(tasks).map(({ day, tasks: ofDay }) => (
            <li key={day}>
              <h6 className="px-3 pt-2.5 pb-0.5 text-xs text-muted">
                {day === today ? words.today : timeLabel(endedAt(ofDay[0]), { month: 'numeric', day: 'numeric' })}
              </h6>
              <ul>
                {ofDay.map((task) => (
                  <li key={task.id} className="flex items-center gap-2.5 px-3 py-1.5 text-md leading-[1.35]">
                    <span
                      role="img"
                      aria-label={strings().common.taskStatus[task.status]}
                      data-status={task.status}
                      className="shrink-0 text-muted data-[status=failed]:text-danger"
                    >
                      <Icon name={STATUS_ICON[task.status]} size={16} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-ink">{task.title}</span>
                      <small className="truncate text-xs text-muted empty:hidden">{originLabel(task, bots)}</small>
                    </span>
                    <time className="w-[38px] shrink-0 text-right text-sm text-muted tabular-nums">
                      {timeLabel(endedAt(task), { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </time>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </PanelCard>
    </>
  )
}

const endedAt = (task: TaskView) => task.endedAt ?? task.createdAt

/** Tasks by when they ended, latest first, cut where the day on TIMEZONE's calendar changes. */
function byDay(tasks: TaskView[]): { day: number; tasks: TaskView[] }[] {
  // listed by when they started: one interrupted by a restart ends days later, among older ones
  return tasks
    .toSorted((a, b) => endedAt(b) - endedAt(a))
    .reduce<{ day: number; tasks: TaskView[] }[]>((groups, task) => {
      const day = calendarDay(endedAt(task))
      const last = groups.at(-1)
      if (last?.day !== day) return [...groups, { day, tasks: [task] }]
      return [...groups.slice(0, -1), { day, tasks: [...last.tasks, task] }]
    }, [])
}

function originLabel(task: TaskView, bots: Bot[]): string {
  const requester = task.requestedBy && (bots.find((bot) => bot.id === task.requestedBy)?.name ?? task.requestedBy)
  return [task.isRoutine && strings().bot.panel.routine, requester && strings().bot.panel.from(requester)]
    .filter(Boolean)
    .join(' · ')
}

const timeLabel = (at: number, format: Intl.DateTimeFormatOptions) =>
  new Date(at).toLocaleString(locale(), { timeZone: TIMEZONE, ...format })

interface RoutinesProps {
  routines: RoutineView[]
  flows: Flow[]
  onToggle: (id: string, isEnabled: boolean) => void
}

function Routines({ routines, flows, onToggle }: RoutinesProps) {
  return (
    <>
      <PanelSectionTitle>{strings().bot.panel.comingUp}</PanelSectionTitle>
      <PanelCard>
        {routines.map((routine) => (
          <div key={routine.id} className="flex w-full items-center gap-3 p-3 text-left leading-[1.35] text-soft">
            <Icon name="clock" size={20} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-md text-ink">{routine.name}</span>
              <small className="truncate text-sm text-muted">{scheduleLabel(routine)}</small>
              <span className="flex flex-wrap gap-x-1">
                <FlowLink flow={flows.find((flow) => flow.id === routine.flowId)} />
                {routine.model && <ModelTag model={routine.model} />}
              </span>
            </span>
            <Switch
              label={routine.name}
              isOn={routine.isEnabled}
              onChange={(isEnabled) => onToggle(routine.id, isEnabled)}
            />
          </div>
        ))}
      </PanelCard>
    </>
  )
}

/** The flow a task or routine follows, opened in the 流程 tab; nothing once the flow is deleted. */
function FlowLink({ flow }: { flow: Flow | undefined }) {
  const { openFlow } = useNavigation()
  if (!flow) return null
  return (
    <button
      type="button"
      onClick={() => openFlow(flow.id)}
      className="mt-1 flex max-w-full items-center gap-1 self-start rounded-sm bg-bubble py-0.5 pr-1.5 pl-1 text-xs text-soft"
    >
      <Icon name="flow" size={13} />
      <span className="truncate">{strings().bot.panel.follows(flow.name)}</span>
    </button>
  )
}

function scheduleLabel(routine: RoutineView): string {
  const words = strings().bot.panel
  if (!routine.isEnabled) return words.paused
  if (routine.nextRunAt === null) return words.willNotRun
  const at = new Date(routine.nextRunAt).toLocaleString(locale(), {
    timeZone: routine.timezone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return routine.timezone === TIMEZONE ? words.next(at) : words.nextIn(at, routine.timezone)
}
