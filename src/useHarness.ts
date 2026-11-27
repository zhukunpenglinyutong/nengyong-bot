import { useEffect, useEffectEvent, useReducer, useRef, useState } from 'react'
import type { Bot, SectionByName } from '../shared/bot'
import type { Trace } from '../shared/debug'
import type { Entry, HarnessEvent, NengyongBotBridge } from '../shared/bridge'
import { BYTES_PER_MB, DEFAULT_LIMITS, type Limits, MESSAGE_MAX_CHARS } from '../shared/limits'
import type { SidebarState } from '../shared/sidebar'
import { EMPTY_THREAD, harnessState } from './harnessState'
import { ipcErrorMessage } from './ipcErrorMessage'
import { strings } from '../shared/strings'

interface Options {
  activeId: string
  sidebar: SidebarState
  canSave: boolean // false until the onboarding has hired: quitting before that brings it back
  isDebug: boolean // the harness reports contexts and runs only while it is on
  onBotCreated: (bot: Bot) => void
  onBotRenamed: (botId: string, name: string) => void
  onBotMoved: (botId: string, section: SectionByName | undefined) => void
  onBotDismissed: (botId: string) => void
  onEntry: (botId: string, entry: Entry, before: Entry[]) => void // before: that bot's entries until this one
  onBusy: (botId: string, busy: boolean) => void
  onTrace: (botId: string, trace: Trace, before: Trace | undefined) => void // before: the last report of the same run
  onOpenBot: (botId: string) => void
}

/** The bots behind the bridge, on the computer and on a device: per-bot threads kept up to date by its events, and saving the sidebar. */
export function useHarness(bridge: NengyongBotBridge, options: Options) {
  const [threads, dispatch] = useReducer(harnessState, {})
  const [limits, setLimits] = useState(DEFAULT_LIMITS)
  const loaded = useRef(new Set<string>())

  // failures with no bot of their own are shown in the conversation that is open
  const reportFailure = (what: string, error: unknown) =>
    dispatch({ kind: 'error', botId: options.activeId, message: failureOf(what, error) })
  const report = useEffectEvent(reportFailure)
  const saveSidebar = useEffectEvent(async (sidebar: SidebarState) =>
    (await bridge.saveSidebar(sidebar)).forEach(options.onBotCreated),
  )
  const onEvent = useEffectEvent((event: HarnessEvent) => {
    switch (event.kind) {
      case 'busy':
        dispatch({ ...event, since: Date.now(), draw: Math.random() })
        return options.onBusy(event.botId, event.busy)
      case 'entry':
        options.onEntry(event.botId, event.entry, threads[event.botId]?.entries ?? [])
        return dispatch(event)
      case 'trace':
        options.onTrace(
          event.botId,
          event.trace,
          threads[event.botId]?.traces.find((known) => known.id === event.trace.id),
        )
        return dispatch(event)
      case 'bot-created':
        return options.onBotCreated(event.bot)
      case 'bot-renamed':
        return options.onBotRenamed(event.botId, event.name)
      case 'bot-moved':
        return options.onBotMoved(event.botId, event.section)
      case 'bot-dismissed':
        return options.onBotDismissed(event.botId)
      case 'open-bot':
        return options.onOpenBot(event.botId)
      case 'error':
      case 'streaming':
      case 'queued':
      case 'activity':
      case 'routines':
      case 'flows':
      case 'skills':
      case 'mini-apps':
      case 'mini-app-data':
      case 'library':
      case 'tasks':
      case 'models':
      case 'context':
        return dispatch(event)
      case 'open-settings':
      case 'devices':
      case 'pairing':
      case 'update-progress':
      case 'update-error':
        return
      default:
        return event satisfies never
    }
  })

  useEffect(() => {
    if (!options.canSave) return
    saveSidebar(options.sidebar).catch((error) => report(strings().app.failures.saveSidebar, error))
  }, [options.sidebar, options.canSave])

  useEffect(() => {
    const botId = options.activeId
    if (loaded.current.has(botId)) return
    loaded.current.add(botId)
    Promise.all([bridge.history(botId), bridge.panel(botId)]).then(
      ([entries, panel]) => dispatch({ kind: 'loaded', botId, entries, panel }),
      (error) => {
        loaded.current.delete(botId)
        report(strings().app.failures.readChat, error)
      },
    )
  }, [bridge, options.activeId])

  useEffect(() => {
    bridge.setDebug(options.isDebug).catch((error) => report(strings().app.failures.switchDebug, error))
  }, [bridge, options.isDebug])

  // read again on every visit: while debug mode was off, the harness sent no updates
  useEffect(() => {
    if (!options.isDebug) return
    const botId = options.activeId
    bridge.context(botId).then(
      (context) => context && dispatch({ kind: 'context', botId, context }),
      (error) => report(strings().app.failures.readContext, error),
    )
  }, [bridge, options.activeId, options.isDebug])

  useEffect(() => {
    bridge.previews().then(
      (previews) => dispatch({ kind: 'previews', previews }),
      (error) => report(strings().app.failures.readPreviews, error),
    )
    bridge.tasksAndRoutines().then(
      (byBot) => dispatch({ kind: 'tasks-and-routines', byBot }),
      (error) => report(strings().app.failures.readTasks, error),
    )
    bridge.getLimits().then(setLimits, (error) => report(strings().app.failures.readLimits, error))
    return bridge.onEvent((event) => onEvent(event))
  }, [bridge])

  return {
    thread: (botId: string) => threads[botId] ?? EMPTY_THREAD,
    reportFailure,
    limits,
    saveLimits: async (next: Limits) => setLimits(await bridge.setLimits(next)),
    setRoutineEnabled(botId: string, routineId: string, isEnabled: boolean) {
      bridge.setRoutineEnabled(botId, routineId, isEnabled).catch((error) =>
        dispatch({
          kind: 'error',
          botId,
          message: failureOf(strings().app.failures.switchRoutine, error),
        }),
      )
    },
    openLibraryItem(botId: string, path: string) {
      bridge.openLibraryItem(path).catch((error) =>
        dispatch({
          kind: 'error',
          botId,
          message: failureOf(strings().app.failures.openFile, error),
        }),
      )
    },
    stopReply(botId: string) {
      const runId = threads[botId]?.progress?.runId
      if (!runId) return
      bridge
        .stopReply(botId, runId)
        .catch((error) =>
          dispatch({ kind: 'error', botId, message: failureOf(strings().app.failures.stopReply, error) }),
        )
    },
    stopTask(botId: string, taskId: string) {
      bridge.stopTask(botId, taskId).catch((error) =>
        dispatch({
          kind: 'error',
          botId,
          message: failureOf(strings().app.failures.stopTask, error),
        }),
      )
    },
    deleteMessages(botId: string, seqs: number[]) {
      bridge.deleteMessages(botId, seqs).then(
        () => dispatch({ kind: 'deleted', botId, seqs }),
        (error) => dispatch({ kind: 'error', botId, message: failureOf(strings().app.failures.delete, error) }),
      )
    },
    /** False when the message is refused before anything is sent; the thread shows why. */
    send(botId: string, text: string, files: File[], quoteSeq: number | null, miniAppId: string | null): boolean {
      const refusal = refusalOf(text, files, limits)
      if (refusal) {
        dispatch({ kind: 'error', botId, message: refusal })
        return false
      }
      dispatch({ kind: 'sent', botId })
      Promise.all(files.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) })))
        .then((attachments) => bridge.send(botId, text, attachments, quoteSeq, miniAppId))
        .catch((error) => dispatch({ kind: 'error', botId, message: ipcErrorMessage(error) }))
      return true
    },
  }
}

// checked before the bytes are read: a huge file would be loaded into memory only to be refused by the harness
function refusalOf(text: string, files: File[], { attachmentsPerMessage, attachmentMegabytes }: Limits) {
  if (text.length > MESSAGE_MAX_CHARS) return strings().app.send.tooLong(MESSAGE_MAX_CHARS, text.length)
  if (files.length > attachmentsPerMessage) return strings().app.send.tooManyFiles(attachmentsPerMessage)
  const tooBig = files.find((file) => file.size > attachmentMegabytes * BYTES_PER_MB)
  return tooBig && strings().app.send.fileTooBig(tooBig.name, attachmentMegabytes)
}

const failureOf = (what: string, error: unknown) => strings().app.failure(what, ipcErrorMessage(error))
