import { useEffect, useEffectEvent, useReducer, useRef, useState } from 'react'
import type { Bot } from '../shared/bot'
import type { Trace } from '../shared/debug'
import type { Entry, HarnessEvent, OnboardingChoices, NengyongBotBridge } from '../shared/bridge'
import type { DevicesView, PairingRequest } from '../shared/devices'
import { BYTES_PER_MB, DEFAULT_LIMITS, type Limits, MESSAGE_MAX_CHARS } from '../shared/limits'
import { type ModelServicesView, SERVICES } from '../shared/modelServices'
import type { SidebarState } from '../shared/sidebar'
import { EMPTY_THREAD, harnessState } from './harnessState'
import { ipcErrorMessage } from './ipcErrorMessage'
import type { SettingsPage } from './settings/SettingsDialog'
import { strings } from '../shared/strings'

interface Options {
  activeId: string
  sidebar: SidebarState
  canSave: boolean // false until the onboarding has hired: quitting before that brings it back
  canAskForKey: boolean // false while the onboarding is due: it connects a model itself
  isDebug: boolean // the harness reports contexts and runs only while it is on
  onBotCreated: (bot: Bot) => void
  onBotRenamed: (botId: string, name: string) => void
  onEntry: (botId: string, entry: Entry, before: Entry[]) => void // before: that bot's entries until this one
  onBusy: (botId: string, busy: boolean) => void
  onTrace: (botId: string, trace: Trace, before: Trace | undefined) => void // before: the last report of the same run
  onOpenBot: (botId: string) => void
}

/** Everything behind the bridge: per-bot threads kept up to date by its events, saving the sidebar, and the model services. */
export function useHarness(bridge: NengyongBotBridge, options: Options) {
  const [threads, dispatch] = useReducer(harnessState, {})
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(null)
  const [modelServices, setModelServices] = useState<ModelServicesView | null>(null)
  const [limits, setLimits] = useState(DEFAULT_LIMITS)
  const [devices, setDevices] = useState<DevicesView | null>(null)
  const [pairing, setPairing] = useState<PairingRequest | null>(null)
  const loaded = useRef(new Set<string>())

  // failures with no bot of their own are shown in the conversation that is open
  const reportFailure = (what: string, error: unknown) =>
    dispatch({ kind: 'error', botId: options.activeId, message: failureOf(what, error) })
  const report = useEffectEvent(reportFailure)
  const saveSidebar = useEffectEvent(async (sidebar: SidebarState) =>
    (await bridge.saveSidebar(sidebar)).forEach(options.onBotCreated),
  )
  const onModelServices = useEffectEvent((services: ModelServicesView) => {
    setModelServices(services)
    if (services.chat === null && options.canAskForKey) setSettingsPage('model')
  })
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
      case 'open-settings':
        return setSettingsPage('model')
      case 'open-bot':
        return options.onOpenBot(event.botId)
      case 'devices':
        return setDevices(event.devices)
      case 'pairing':
        return setPairing(event.request)
      case 'error':
        dispatch(event)
        if (event.code === 'no-key') setSettingsPage('model')
        return
      case 'draft':
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
    bridge.getModelServices().then(
      (services) => onModelServices(services),
      (error) => report(strings().app.failures.readModelServices, error),
    )
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
    settingsPage, // null while the settings are closed
    modelServices, // null until the first read from the bridge lands
    setModelServices, // the 模型服务 page changes them through the bridge and hands back what it answered
    devices, // the latest the harness reported; null until it reports one
    pairing, // the device asking to be let in now
    openSettings(page: SettingsPage) {
      setSettingsPage(page)
      // the first read failed and was reported: try again, or the settings could never be opened
      if (!modelServices)
        bridge
          .getModelServices()
          .then(setModelServices, (error) => reportFailure(strings().app.failures.readModelServices, error))
    },
    closeSettings: () => setSettingsPage(null),
    async connectDeepSeek(apiKey: string) {
      const saved = modelServices?.accounts.find((account) => account.service === 'deepseek')
      const input = {
        id: null,
        service: 'deepseek' as const,
        name: '',
        baseURL: saved?.baseURL ?? SERVICES.deepseek.baseURL,
        apiKey,
      }
      setModelServices(await bridge.saveAccount(input, 'chat'))
    },
    limits,
    saveLimits: async (next: Limits) => setLimits(await bridge.setLimits(next)),
    onboard: (choices: OnboardingChoices) => bridge.onboard(choices),
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
