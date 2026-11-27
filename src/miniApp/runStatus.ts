import { KEPT_AFTER_CLOSE_MS, phaseOf, RUNNING_AFTER_MINIMIZE_MS, type Run } from './miniAppRuns'
import { strings } from '../../shared/strings'

type RunStatus = { kind: 'update' | 'running' | 'suspended'; text: string }

const minutesLeft = (ms: number) => Math.max(1, Math.ceil(ms / 60_000))

/** How a mini app that has been opened is doing, in words; null in front or once destroyed. */
export function runStatus(run: Run, latestVersion: number, now: number): RunStatus | null {
  const words = strings().miniApp.runStatus
  const idle = Math.max(0, now - run.leftAt) // `now` is read every few seconds: it can be older than leftAt
  const phase = phaseOf(run, now)
  if (phase === 'front' || phase === 'destroyed') return null
  // seenVersion 0: minimized before its page finished loading, so there is nothing older it showed
  if (run.status === 'docked' && run.seenVersion > 0 && latestVersion > run.seenVersion)
    return {
      kind: 'update',
      text: words.newVersion(latestVersion),
    }
  if (phase === 'running') {
    const minutes = minutesLeft(RUNNING_AFTER_MINIMIZE_MS - idle)
    return {
      kind: 'running',
      text: words.minimized(minutes),
    }
  }
  if (run.status === 'docked') {
    const minutes = Math.floor(idle / 60_000)
    return {
      kind: 'suspended',
      text: words.paused(minutes),
    }
  }
  const minutes = minutesLeft(KEPT_AFTER_CLOSE_MS - idle)
  return {
    kind: 'suspended',
    text: words.closed(minutes),
  }
}
