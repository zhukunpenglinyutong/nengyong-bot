import { useRef } from 'react'
import type { NengyongBotBridge } from '../../shared/bridge'
import { isBeingChanged, type MiniApp } from '../../shared/miniApp'
import type { Thread } from '../harnessState'
import { useNow } from '../ui/useNow'
import { type Rect, type Run, type RunEvent, type Runs, phaseOf, rectOf, runKey } from './miniAppRuns'
import { MiniAppDock } from './MiniAppDock'
import { MiniAppWindow } from './MiniAppWindow'

const PHASE_REFRESH_MS = 15_000 // "4 分钟后挂起" ages, and a minimized page stops taking data on time

interface Props {
  runs: Runs
  dispatch: (event: RunEvent) => void
  bridge: NengyongBotBridge
  threadOf: (botId: string) => Thread
  botName: (botId: string) => string
  onEditInChat: (run: Run, app: MiniApp) => void
}

/** Every mini app window that is not destroyed, and the dock of the minimized ones, over the whole app. */
export function MiniAppHost({ runs, dispatch, bridge, threadOf, botName, onEditInChat }: Props) {
  const now = useNow(PHASE_REFRESH_MS)
  const areaRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const live = runs.runs.flatMap((run) => {
    const app = threadOf(run.botId).panel.miniApps.find((candidate) => candidate.id === run.miniAppId)
    const phase = phaseOf(run, now)
    return app && phase !== 'destroyed' ? [{ run, app, phase }] : []
  })
  const docked = runs.dock.flatMap((key) => live.filter((each) => runKey(each.run) === key))
  const dockSlot = (): Rect | null => {
    const box = dockRef.current?.getBoundingClientRect()
    return box ? { x: box.right - 48, y: box.top + 8, width: 38, height: 38 } : null
  }

  return (
    <>
      <div ref={areaRef} className="pointer-events-none fixed inset-0 z-40">
        {live.map(({ run, app, phase }) => {
          const thread = threadOf(run.botId)
          return (
            <MiniAppWindow
              key={runKey(run)}
              run={run}
              app={app}
              phase={phase}
              botName={botName(run.botId)}
              bridge={bridge}
              isEditing={isBeingChanged(app.id, thread.panel.tasks)}
              pushed={thread.miniAppData[app.id]}
              dragArea={areaRef}
              dockSlot={dockSlot}
              dispatch={dispatch}
              onEditInChat={() => onEditInChat(run, app)}
            />
          )
        })}
      </div>
      <MiniAppDock
        docked={docked}
        now={now}
        dockRef={dockRef}
        onOpen={(run, from) =>
          dispatch({ kind: 'open', botId: run.botId, miniAppId: run.miniAppId, at: Date.now(), origin: rectOf(from) })
        }
        onClose={(run) => dispatch({ kind: 'close', key: runKey(run), at: Date.now() })}
      />
    </>
  )
}
