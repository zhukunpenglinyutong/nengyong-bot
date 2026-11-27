import type { TaskView } from '../../shared/bridge'
import { isBeingChanged, latestVersion, type MiniApp } from '../../shared/miniApp'
import { dateLabel } from '../timeLabel'
import { PanelAddRow } from '../bot/PanelCard'
import { useNavigation } from '../NavigationContext'
import { useNow } from '../ui/useNow'
import type { Run } from './miniAppRuns'
import { MiniAppThumb } from './MiniAppThumb'
import { MiniAppTile } from './MiniAppTile'
import { runStatus } from './runStatus'
import { strings } from '../../shared/strings'

const MAKE_TEXT = strings().miniApp.tab.makeStarter
const STATUS_REFRESH_MS = 15_000

interface Props {
  miniApps: MiniApp[]
  runs: Run[] // of this bot's mini apps that have been opened
  tasks: TaskView[] // its recent tasks: an unfinished one with a mini app is changing it
  thumbUrl: (app: MiniApp) => string
  onFill: (text: string) => void // puts a message in the box for the user to finish and send
}

/** The panel's 小程序 tab: the bot's mini apps as cards showing what each looks like now, its version and how it is doing. */
export function MiniAppsTab({ miniApps, runs, tasks, thumbUrl, onFill }: Props) {
  const words = strings().miniApp.tab
  const { openMiniApp } = useNavigation()
  const now = useNow(STATUS_REFRESH_MS)
  return (
    <>
      <p className="pt-3.5 pb-2.5 text-sm text-muted">{words.intro}</p>
      {miniApps.length > 0 && (
        <ul aria-label={words.list} className="grid grid-cols-2 gap-2.5">
          {miniApps.map((app) => {
            const latest = latestVersion(app)
            const run = runs.find((candidate) => candidate.miniAppId === app.id)
            const status = run && runStatus(run, latest.version, now)
            const isEditing = isBeingChanged(app.id, tasks)
            return (
              <li key={app.id} className="relative overflow-hidden rounded-lg bg-surface shadow-ring">
                <MiniAppThumb src={thumbUrl(app)} height={100} />
                <button
                  type="button"
                  onClick={(event) => openMiniApp(app.id, event.currentTarget)}
                  className="flex w-full flex-col gap-0.5 border-t border-line px-2.5 pt-2 pb-2.5 text-left after:absolute after:inset-0"
                >
                  <span className="flex items-center gap-1.5">
                    <MiniAppTile app={app} size={20} />
                    <span className="min-w-0 flex-1 truncate text-md font-semibold">{app.name}</span>
                    <span className="shrink-0 rounded-sm bg-bubble px-1 text-xs font-semibold text-soft tabular-nums">
                      v{latest.version}
                    </span>
                  </span>
                  <small
                    data-status={isEditing ? 'editing' : status?.kind}
                    className="truncate text-xs text-muted data-[status=editing]:text-accent data-[status=update]:text-accent"
                  >
                    {isEditing
                      ? words.changing
                      : (status?.text ?? words.updated(dateLabel(Math.max(app.dataAt ?? 0, latest.at))))}
                  </small>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <PanelAddRow title={words.make} hint={words.makeHint} onClick={() => onFill(MAKE_TEXT)} />
    </>
  )
}
