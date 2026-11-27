import path from 'node:path'
import { z } from 'zod'
import type { Store } from '../harness/store'
import type { Workspace } from '../harness/workspace'
import type { HarnessEvent, NengyongBotBridge } from '../shared/bridge'
import { type DevicesView, PairingCode } from '../shared/devices'
import { BYTES_PER_MB, type Limits } from '../shared/limits'
import { appFiles } from './appFiles'
import { createDevices } from './devices'
import type { Handler } from './handlers'
import { createLanServer } from './lanServer'
import { imageResponse, libraryFileResponse, miniAppResponse } from './libraryResponses'
import { createPairing } from './pairing'

const LAN_PORT = 4317
const BASE64_GROWTH = 4 / 3
const CALL_OVERHEAD_BYTES = 1_000_000 // the text and the rest of a call besides its attachments

// what a paired device may do: chat and follow the bots' work; the settings, the sidebar and the data stay on this computer
const DEVICE_METHODS = [
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
  'getModelServices',
  'getLimits',
] as const satisfies readonly (keyof NengyongBotBridge)[]

interface Options {
  home: string
  handlers: Record<string, Handler>
  store: Store
  workspace: Workspace
  limits: () => Limits
  emit: (event: HarnessEvent) => void
  devUrl: string | undefined
}

export type LanAccess = ReturnType<typeof createLanAccess>

/** 设备: the local network server, whom it lets in, and the desktop's controls over both. */
export function createLanAccess({ home, handlers, store, workspace, limits, emit, devUrl }: Options) {
  const devices = createDevices(home)
  const pairing = createPairing({
    admit: (ask) => devices.add(ask, Date.now()),
    onChange: (request) => emit({ kind: 'pairing', request }),
  })
  const server = createLanServer({
    port: LAN_PORT,
    devices,
    pairing,
    handlers: Object.fromEntries(
      DEVICE_METHODS.flatMap((name) => {
        const handler = handlers[name]
        return handler ? [[name, handler]] : []
      }),
    ),
    app: appFiles(devUrl, path.join(__dirname, '../dist')),
    image: (file) => imageResponse(workspace, file),
    miniApp: (page) => miniAppResponse(store, workspace, page),
    libraryFile: (file) => libraryFileResponse(workspace, file),
    maxBodyBytes: () => {
      const { attachmentsPerMessage, attachmentMegabytes } = limits()
      return attachmentsPerMessage * attachmentMegabytes * BYTES_PER_MB * BASE64_GROWTH + CALL_OVERHEAD_BYTES
    },
    onOnlineChange: () => emitView(),
  })
  let error: string | null = null // why the server could not start the last time it was asked to

  const view = (): DevicesView => ({
    isLanOn: devices.isLanOn(),
    address: server.address(),
    error,
    devices: devices.views(server.onlineIds()),
  })
  const emitView = () => emit({ kind: 'devices', devices: view() })
  const apply = async () => {
    if (devices.isLanOn()) error = await server.listen()
    else {
      server.close()
      error = null
    }
    emitView()
    return view()
  }

  return {
    start: apply,
    close: server.close,
    broadcast: server.broadcast,
    handlers: {
      getDevices: view,
      setLanAccess: (isOn) => {
        devices.setLanOn(z.boolean().parse(isOn))
        return apply()
      },
      removeDevice: (deviceId) => {
        const id = z.string().parse(deviceId)
        devices.remove(id)
        server.drop(id)
        return view()
      },
      answerPairing: (requestId, code) =>
        pairing.answer(z.string().parse(requestId), PairingCode.nullable().parse(code)),
    } satisfies Partial<Record<keyof NengyongBotBridge, Handler>>,
  }
}
