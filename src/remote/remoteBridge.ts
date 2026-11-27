import { z } from 'zod'
import type { HarnessEvent, NengyongBotBridge } from '../../shared/bridge'
import { BYTES_KEY, REMOTE_API, RemoteSession } from '../../shared/devices'
import { strings } from '../../shared/strings'

const QUIET_LIMIT_MS = 40_000 // the computer pings every 15 s: this much silence means it is gone (asleep, off the network)
const WATCH_MS = 5_000
const RETRY_MS = 3_000
const BASE64_CHUNK = 0x8000 // String.fromCharCode takes its arguments on the stack

/** How this device stands with the computer: connected, cut off for now, or removed there (it has to pair again). */
export type Connection = 'online' | 'offline' | 'removed'

export interface ConnectionStore {
  get: () => Connection
  subscribe: (onChange: () => void) => () => void
}

const ErrorBody = z.object({ message: z.string() })
const desktopOnly = () => Promise.reject(new Error(strings().remote.desktopOnly))
const pathOf = (path: string) => path.split('/').map(encodeURIComponent).join('/')

/** The bridge of a paired device's browser: the same methods as preload's, over HTTP to the computer it paired with. */
export function createRemoteBridge(): { bridge: NengyongBotBridge; connection: ConnectionStore } {
  const listeners = new Set<(event: HarnessEvent) => void>()
  const watchers = new Set<() => void>()
  let connection: Connection = 'online'
  let hasDropped = false // the stream broke at least once: events may have been missed
  let lastHeard = Date.now()
  let source: EventSource | null = null

  const setConnection = (next: Connection) => {
    if (next === connection || connection === 'removed') return
    connection = next
    for (const watcher of watchers) watcher()
  }

  async function call<T>(method: keyof NengyongBotBridge, args: unknown[]): Promise<T> {
    const response = await fetch(REMOTE_API.call + method, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args, encodeBytes),
    }).catch(() => null)
    if (!response) {
      setConnection('offline')
      throw new Error(strings().remote.unreachable)
    }
    if (response.status === 401) setConnection('removed')
    if (!response.ok) throw new Error(await reasonOf(response))
    return response.json()
  }

  function connect() {
    source?.close()
    const next = new EventSource(REMOTE_API.events)
    source = next
    lastHeard = Date.now()
    next.onopen = () => {
      lastHeard = Date.now()
      // what happened while the stream was down never arrives: starting over is how the page catches up
      if (hasDropped) return location.reload()
      setConnection('online')
    }
    next.onmessage = (message) => {
      lastHeard = Date.now()
      const event: HarnessEvent = JSON.parse(message.data)
      for (const listener of listeners) listener(event)
    }
    next.addEventListener('ping', () => {
      lastHeard = Date.now()
    })
    next.onerror = () => {
      hasDropped = true
      setConnection('offline')
      // CONNECTING: the browser tries again by itself; CLOSED: the computer turned the stream away
      if (next.readyState === EventSource.CLOSED) void recheck()
    }
  }

  async function recheck() {
    if ((await remoteSession())?.kind === 'unpaired') return setConnection('removed')
    window.setTimeout(connect, RETRY_MS)
  }

  window.setInterval(() => {
    if (connection === 'removed' || Date.now() - lastHeard < QUIET_LIMIT_MS) return
    hasDropped = true
    setConnection('offline')
    connect()
  }, WATCH_MS)
  connect()

  const bridge: NengyongBotBridge = {
    isMac: false,
    getLanguage: () => call('getLanguage', []),
    setLanguage: desktopOnly,
    send: (botId, text, attachments, quoteSeq, miniAppId) =>
      call('send', [botId, text, attachments, quoteSeq, miniAppId]),
    attachmentUrl: (path) => REMOTE_API.attachment + pathOf(path),
    miniAppUrl: (botId, miniAppId, version, dataAt) =>
      `${REMOTE_API.miniApp}${encodeURIComponent(botId)}/${encodeURIComponent(miniAppId)}/${version}?data=${dataAt ?? 0}`,
    askFromMiniApp: (botId, miniAppId, text) => call('askFromMiniApp', [botId, miniAppId, text]),
    saveMiniAppData: (botId, miniAppId, data) => call('saveMiniAppData', [botId, miniAppId, data]),
    restoreMiniApp: (botId, miniAppId, version) => call('restoreMiniApp', [botId, miniAppId, version]),
    deleteMiniApp: (botId, miniAppId) => call('deleteMiniApp', [botId, miniAppId]),
    miniAppHtml: (botId, miniAppId, version) => call('miniAppHtml', [botId, miniAppId, version]),
    history: (botId) => call('history', [botId]),
    deleteMessages: (botId, seqs) => call('deleteMessages', [botId, seqs]),
    previews: () => call('previews', []),
    panel: (botId) => call('panel', [botId]),
    tasksAndRoutines: () => call('tasksAndRoutines', []),
    context: desktopOnly,
    setDebug: async () => {}, // debug mode belongs to the computer: a device neither turns it on nor off
    setRoutineEnabled: (botId, routineId, isEnabled) => call('setRoutineEnabled', [botId, routineId, isEnabled]),
    // a document or a picture opens in the browser; the computer answers that other files open only there
    openLibraryItem: async (path) => {
      window.open(REMOTE_API.library + pathOf(path), '_blank', 'noopener')
    },
    stopReply: (botId, runId) => call('stopReply', [botId, runId]),
    stopTask: (botId, taskId) => call('stopTask', [botId, taskId]),
    // installing, removing and the Finder belong to the computer; a device only looks at a skill's files
    answerSkillOffer: desktopOnly,
    uploadSkill: desktopOnly,
    answerSkillUpload: desktopOnly,
    removeSkills: desktopOnly,
    skillFiles: (ref) => call('skillFiles', [ref]),
    skillFile: (ref, path) => call('skillFile', [ref, path]),
    revealSkill: desktopOnly,
    getSidebar: () => call('getSidebar', []),
    needsOnboarding: async () => false,
    saveSidebar: desktopOnly,
    getDataDir: desktopOnly,
    openDataDir: desktopOnly,
    moveDataDir: desktopOnly,
    exportData: desktopOnly,
    importData: desktopOnly,
    getModelServices: () => call('getModelServices', []),
    listModels: desktopOnly,
    saveAccount: desktopOnly,
    removeAccount: desktopOnly,
    setChatModel: desktopOnly,
    setSearchAccount: desktopOnly,
    getMcpConfig: desktopOnly,
    setMcpConfig: desktopOnly,
    getLimits: () => call('getLimits', []),
    setLimits: desktopOnly,
    usage: desktopOnly,
    setModelPrice: desktopOnly,
    onboard: desktopOnly,
    getDevices: desktopOnly,
    setLanAccess: desktopOnly,
    removeDevice: desktopOnly,
    answerPairing: desktopOnly,
    checkForUpdate: desktopOnly,
    installUpdate: desktopOnly,
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  return {
    bridge,
    connection: {
      get: () => connection,
      subscribe(onChange) {
        watchers.add(onChange)
        return () => watchers.delete(onChange)
      },
    },
  }
}

/** Whether this page comes from the computer's LAN access, and if so whether this browser has paired; null otherwise. */
export async function remoteSession(): Promise<RemoteSession | null> {
  try {
    const response = await fetch(REMOTE_API.session)
    return RemoteSession.parse(await response.json())
  } catch {
    // the demo's dev server answers with the page itself, and an unreachable computer with nothing: not paired here
    return null
  }
}

export async function reasonOf(response: Response): Promise<string> {
  const body = ErrorBody.safeParse(await response.json().catch(() => null))
  return body.success ? body.data.message : strings().remote.noResponse(response.status)
}

export function encodeBytes(_key: string, value: unknown) {
  if (!(value instanceof Uint8Array)) return value
  let binary = ''
  for (let start = 0; start < value.length; start += BASE64_CHUNK)
    binary += String.fromCharCode(...value.subarray(start, start + BASE64_CHUNK))
  return { [BYTES_KEY]: btoa(binary) }
}
