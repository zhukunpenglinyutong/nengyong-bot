import { z } from 'zod'
import type { NengyongBotBridge } from './bridge'

/** 设备: a phone, tablet or other computer the user let in over the local network to use this computer's bots. */
export const DeviceKind = z.enum(['phone', 'tablet', 'computer'])
export type DeviceKind = z.infer<typeof DeviceKind>

const DEVICE_NAME_MAX = 40
export const PairingCode = z.string().regex(/^\d{4}$/)

/** What a browser asking to pair says about itself; shown to the user, who decides. */
export const PairingAsk = z.object({ name: z.string().trim().min(1).max(DEVICE_NAME_MAX), kind: DeviceKind })
export type PairingAsk = z.infer<typeof PairingAsk>

/** A device waiting on this computer to be let in: it shows its code, which never comes here, and the user types it here. */
export interface PairingRequest extends PairingAsk {
  id: string
}

export interface DeviceView {
  id: string
  name: string
  kind: DeviceKind
  isOnline: boolean
  lastSeenAt: number
}

/** The 设备 settings page: whether the local network may connect, at which address, and the paired devices. */
export interface DevicesView {
  isLanOn: boolean
  address: string | null // http://<this computer's LAN address>:<port> while it listens
  error: string | null // why it does not listen although it is on
  devices: DeviceView[]
}

/** The bridge methods a paired device may call: chat and follow the bots' work; the settings, the sidebar and the data stay on this computer. */
export const DEVICE_METHODS = [
  'getLanguage',
  'send',
  'askFromMiniApp',
  'saveMiniAppData',
  'restoreMiniApp',
  'deleteMiniApp',
  'miniAppHtml',
  'history',
  'deleteMessages',
  'previews',
  'panel',
  'tasksAndRoutines',
  'setRoutineEnabled',
  'stopReply',
  'stopTask',
  'skillFiles',
  'skillFile',
  'getSidebar',
  'getLimits',
] as const satisfies readonly (keyof NengyongBotBridge)[]

/** The HTTP API a paired browser uses in place of preload's IPC; every path but these few needs the device's cookie. */
export const REMOTE_API = {
  session: '/api/session', // GET, open: RemoteSession
  pair: '/api/pair', // POST PairingAsk, open: PairingStarted; GET /api/pair/<id>, open: PairingAnswer once decided
  events: '/api/events', // GET: server-sent HarnessEvents
  call: '/api/call/', // POST /api/call/<bridge method> with the arguments as a JSON array
  attachment: '/api/attachment/', // GET /api/attachment/<library path>: an image
  miniApp: '/api/app/', // GET /api/app/<botId>/<miniAppId>/<version>: a mini app's page
  library: '/api/library/', // GET /api/library/<library path>: a document or a picture to look at
} as const

export const RemoteSession = z.object({ kind: z.enum(['paired', 'unpaired']) })
export type RemoteSession = z.infer<typeof RemoteSession>

export const PairingStarted = z.object({ id: z.string(), code: z.string() })
export type PairingStarted = z.infer<typeof PairingStarted>

// waiting: nothing decided yet, ask again; gone: it expired, or a newer request replaced it
export const PairingAnswer = z.object({ status: z.enum(['allowed', 'denied', 'waiting', 'gone']) })
export type PairingAnswer = z.infer<typeof PairingAnswer>

/** JSON has no bytes: an attachment's Uint8Array travels as { [BYTES_KEY]: base64 } inside the call's arguments. */
export const BYTES_KEY = '$bytes'
