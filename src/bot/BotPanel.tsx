import { LayoutGroup, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { z } from 'zod'
import type { Bot } from '../../shared/bot'
import type { OutfitId } from '../../shared/outfit'
import {
  type Entry,
  isUnfinished,
  type LibraryItem,
  type PanelData,
  type RoutineView,
  type TaskStatus,
  type TaskView,
} from '../../shared/bridge'
import type { Flow } from '../../shared/flow'
import type { MiniApp } from '../../shared/miniApp'
import { calendarDay, TIMEZONE } from '../../shared/timezone'
import { ELAPSED_REFRESH_MS } from '../elapsedLabel'
import type { Run } from '../miniApp/miniAppRuns'
import { MiniAppsTab } from '../miniApp/MiniAppsTab'
import { taskProgressLabel } from '../taskProgressLabel'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { SPRING } from '../ui/motion'
import { Segmented } from '../ui/Segmented'
import { Switch } from '../ui/Switch'
import { useNow } from '../ui/useNow'
import { BotBadge } from './BotBadge'
import type { SkillFilesTarget, SkillReader } from '../skills/SkillFilesDialog'
import type { SkillUploads } from '../skills/useSkillUpload'
import { type Ability, AbilitiesTab } from './AbilitiesTab'
import type { Look } from './LookPicker'
import { PanelCard, PanelEmpty, PanelSectionTitle } from './PanelCard'
import { ModelTag, PanelModels } from './PanelModels'
import { ShareButton } from './ShareButton'
import { locale } from '../../shared/language'
import { strings } from '../../shared/strings'

interface Props {
  bot: Bot
  bots: Bot[]
  entries: Entry[] // its chat, for the badge
  panel: PanelData
  isDebug: boolean // recent tasks are for whoever debugs the bot, hidden otherwise
  tab: PanelTab
  ability: Ability // what the 能力 tab shows
  onTab: (tab: PanelTab) => void
  onAbility: (ability: Ability) => void
  onOpenFlow: (flowId: string | null) => void // also switches to the 能力 tab
  onFill: (text: string) => void // puts a message in the box for the user to finish and send
  skillReader: SkillReader
  onOpenSkillFiles: (target: SkillFilesTarget) => void
  onRemoveSkill?: (botId: string, names: string[]) => Promise<void> // absent on a device: skills are removed on the computer
  skillUploads?: SkillUploads // absent on a device: skills are uploaded on the computer
  miniAppRuns: Run[] // of its mini apps that have been opened: how each is doing
  thumbUrl: (app: MiniApp) => string
  onOpenMiniApp: (miniAppId: string, from: Element) => void
  onToggleRoutine: (routineId: string, isEnabled: boolean) => void
  onStopTask: (taskId: string) => void
  onOpenLibraryItem: (path: string) => void
  onRename?: (name: string) => void // absent: shown, not changed
  onPickLook?: (look: Look) => void
  onPickAvatar?: (avatar: string | undefined) => void
  onPickOutfit?: (outfit: OutfitId[]) => void
}

export const PanelTab = z.enum(['feed', 'abilities', 'miniApps', 'library']).catch('feed')
export type PanelTab = z.infer<typeof PanelTab>

const TABS = [
  { id: 'feed', label: strings().bot.panel.tabs.feed, icon: 'pulse' },
  { id: 'abilities', label: strings().bot.panel.tabs.abilities, icon: 'skill' },
  { id: 'miniApps', label: strings().bot.panel.tabs.miniApps, icon: 'cube' },
  { id: 'library', label: strings().bot.panel.tabs.library, icon: 'folder' },
] as const satisfies readonly { id: PanelTab; label: string; icon: IconName }[]

export function BotPanel({
  bot,
  bots,
  entries,
  panel,
  isDebug,
  tab,
  ability,
  onTab,
  onAbility,
  onOpenFlow,
  onFill,
  skillReader,
  onOpenSkillFiles,
  onRemoveSkill,
  skillUploads,
  miniAppRuns,
  thumbUrl,
  onOpenMiniApp,
  onToggleRoutine,
  onStopTask,
  onOpenLibraryItem,
  onRename,
  onPickLook,
  onPickAvatar,
  onPickOutfit,
}: Props) {
  const content = () => {
    switch (tab) {
      case 'feed':
        return (
          <FeedTab
            panel={panel}
            entries={entries}
            bots={bots}
            isDebug={isDebug}
            onToggleRoutine={onToggleRoutine}
            onStopTask={onStopTask}
            onOpenFlow={onOpenFlow}
          />
        )
      case 'abilities':
        return (
          <AbilitiesTab
            bot={bot}
            bots={bots}
            panel={panel}
            ability={ability}
            onAbility={onAbility}
            onFill={onFill}
            reader={skillReader}
            onOpenSkillFiles={onOpenSkillFiles}
            onRemoveSkill={onRemoveSkill}
            skillUploads={skillUploads}
          />
        )
      case 'miniApps':
        return (
          <MiniAppsTab
            miniApps={panel.miniApps}
            runs={miniAppRuns}
            tasks={panel.tasks}
            thumbUrl={thumbUrl}
            onOpen={onOpenMiniApp}
            onFill={onFill}
          />
        )
      case 'library':
        return <LibraryTab library={panel.library} onOpen={onOpenLibraryItem} />
      default:
        return tab satisfies never
    }
  }

  return (
    <aside
      aria-label={strings().bot.panel.details}
      className="@container relative h-full overflow-x-hidden overflow-y-auto bg-canvas"
    >
      <header className="relative z-20 px-[18px] pb-7">
        <ShareButton className="absolute top-3 right-[18px] z-10" />
        <BotBadge
          bot={bot}
          entries={entries}
          panel={panel}
          onRename={onRename}
          onPickLook={onPickLook}
          onPickAvatar={onPickAvatar}
          onPickOutfit={onPickOutfit}
          onOpenTab={onTab}
          onOpenFlow={onOpenFlow}
        />
      </header>
      <nav className="sticky top-0 z-10 flex justify-center bg-canvas py-1">
        <Segmented label={strings().bot.panel.content} options={TABS} value={tab} onChange={onTab} />
      </nav>
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="px-[18px] pb-6"
      >
        {content()}
      </motion.div>
    </aside>
  )
}

interface FeedTabProps {
  panel: PanelData
  entries: Entry[]
  bots: Bot[]
  isDebug: boolean
  onToggleRoutine: (routineId: string, isEnabled: boolean) => void
  onStopTask: (taskId: string) => void
  onOpenFlow: (flowId: string) => void
}

function FeedTab({ panel, entries, bots, isDebug, onToggleRoutine, onStopTask, onOpenFlow }: FeedTabProps) {
  const unfinished = panel.tasks.filter(isUnfinished)
  const ended = isDebug ? panel.tasks.filter((task) => !isUnfinished(task)) : []
  return (
    <>
      <PanelModels models={panel.models} entries={entries} />
      {unfinished.length + panel.routines.length + ended.length === 0 && (
        <PanelEmpty>{strings().bot.panel.noActivity}</PanelEmpty>
      )}
      {unfinished.length > 0 && (
        <RunningTasks tasks={unfinished} flows={panel.flows} onStop={onStopTask} onOpenFlow={onOpenFlow} />
      )}
      {panel.routines.length > 0 && (
        <Routines routines={panel.routines} flows={panel.flows} onToggle={onToggleRoutine} onOpenFlow={onOpenFlow} />
      )}
      {ended.length > 0 && <RecentTasks tasks={ended} bots={bots} />}
    </>
  )
}

interface RunningTasksProps {
  tasks: TaskView[]
  flows: Flow[]
  onStop: (taskId: string) => void
  onOpenFlow: (flowId: string) => void
}

function RunningTasks({ tasks, flows, onStop, onOpenFlow }: RunningTasksProps) {
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
                  <FlowLink flow={flows.find((flow) => flow.id === task.flowId)} onOpen={onOpenFlow} />
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
  onOpenFlow: (flowId: string) => void
}

function Routines({ routines, flows, onToggle, onOpenFlow }: RoutinesProps) {
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
                <FlowLink flow={flows.find((flow) => flow.id === routine.flowId)} onOpen={onOpenFlow} />
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
function FlowLink({ flow, onOpen }: { flow: Flow | undefined; onOpen: (flowId: string) => void }) {
  if (!flow) return null
  return (
    <button
      type="button"
      onClick={() => onOpen(flow.id)}
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

const FILTERS: { id: string; label: string; accepts: (item: LibraryItem) => boolean }[] = [
  { id: 'all', label: strings().bot.panel.filters.all, accepts: () => true },
  { id: 'media', label: strings().bot.panel.filters.media, accepts: (item) => item.kind === 'media' },
  { id: 'file', label: strings().bot.panel.filters.file, accepts: (item) => item.kind !== 'media' },
]

function LibraryTab({ library, onOpen }: { library: LibraryItem[]; onOpen: (path: string) => void }) {
  const [filter, setFilter] = useState(FILTERS[0])
  const items = library.filter(filter.accepts)

  return (
    <>
      <LayoutGroup id="library-filter">
        <div className="flex gap-1.5 pt-3.5 pb-1">
          {FILTERS.map((option) => (
            <Pill key={option.id} on={filter === option} onClick={() => setFilter(option)}>
              {option.label}
            </Pill>
          ))}
        </div>
      </LayoutGroup>
      {items.length === 0 ? (
        <PanelEmpty>{strings().bot.panel.noFiles}</PanelEmpty>
      ) : (
        <PanelCard className="mt-3 px-1.5 py-1">
          {items.map((item) => (
            <button
              key={item.path}
              onClick={() => onOpen(item.path)}
              className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-2 text-left text-sm text-muted/70"
            >
              {item.kind === 'media' ? (
                <span className="size-[22px] shrink-0 rounded-sm bg-ink" />
              ) : (
                <Icon name={item.kind} size={16} />
              )}
              <span className="min-w-0 flex-1 truncate text-ink">{item.path}</span>
              <small className="shrink-0 text-sm text-muted">
                {new Date(item.writtenAt).toLocaleDateString(locale(), {
                  timeZone: TIMEZONE,
                  month: 'numeric',
                  day: 'numeric',
                })}
              </small>
            </button>
          ))}
        </PanelCard>
      )}
    </>
  )
}

interface PillProps {
  on: boolean
  onClick: () => void
  children: ReactNode
}

// Active background is a shared-layout element, so it slides between pills of the same LayoutGroup.
function Pill({ on, onClick, children }: PillProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="relative rounded-full bg-bubble px-2.5 py-0.5 text-md text-ink transition-colors duration-150 aria-pressed:text-canvas"
    >
      {on && <motion.span layoutId="pill-bg" transition={SPRING} className="absolute inset-0 rounded-full bg-ink" />}
      <span className="relative">{children}</span>
    </button>
  )
}
