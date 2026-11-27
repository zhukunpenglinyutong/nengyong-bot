import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { z } from 'zod'
import type { HarnessEvent } from '../shared/bridge'
import { BYTES_KEY, PairingAsk, REMOTE_API, type RemoteSession } from '../shared/devices'
import { strings } from '../shared/strings'
import type { Devices } from './devices'
import { isLocalAddress, lanAddresses } from './lanAddresses'
import type { Handler } from './handlers'
import type { Pairing } from './pairing'

const COOKIE = 'nengyongbot_device'
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60 // the longest a browser keeps a cookie
const LONG_POLL_MS = 25_000
const PING_MS = 15_000 // a stream silent for longer tells the device the computer is gone (asleep, off the network)
const MAX_PAIRING_BODY_BYTES = 1000

// what a device hears: chats, tasks and what the panel shows; debug reports, the pairing and the desktop's own windows stay here
const DEVICE_EVENTS: ReadonlySet<HarnessEvent['kind']> = new Set([
  'entry',
  'draft',
  'busy',
  'queued',
  'activity',
  'bot-created',
  'bot-renamed',
  'routines',
  'flows',
  'skills',
  'mini-apps',
  'mini-app-data',
  'library',
  'tasks',
  'models',
  'error',
])

interface Options {
  port: number // 0 picks a free one, for tests
  devices: Devices
  pairing: Pairing
  handlers: Record<string, Handler> // the bridge methods a device may call
  app: (path: string) => Promise<Response> // the renderer's files, by path and query
  image: (path: string) => Promise<Response>
  miniApp: (path: string) => Response
  libraryFile: (path: string) => Promise<Response>
  maxBodyBytes: () => number // a call carries at most this much, attachments included
  onOnlineChange: () => void
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const EncodedBytes = z.object({ [BYTES_KEY]: z.string() })
const reviveBytes = (_key: string, value: unknown) => {
  const encoded = EncodedBytes.safeParse(value)
  return encoded.success ? Buffer.from(encoded.data[BYTES_KEY], 'base64') : value
}

export type LanServer = ReturnType<typeof createLanServer>

/** 局域网访问 over HTTP: the renderer, its bridge calls and the harness's events, for paired devices on the local network. */
export function createLanServer(options: Options) {
  const { devices, pairing } = options
  const streams = new Map<ServerResponse, string>() // open event streams, by the device each belongs to
  const sockets = new Set<Socket>()
  let server: http.Server | null = null

  const port = () => {
    const address = server?.address()
    return typeof address === 'object' && address ? address.port : options.port
  }
  const onlineIds = () => new Set(streams.values())

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const host = request.headers.host ?? ''
    // a page on another site that resolves its own name to this address (DNS rebinding) comes in with that name
    if (!isOwnHost(host, port())) throw new HttpError(421, strings().main.lan.ownAddressOnly)
    const url = new URL(request.url ?? '/', `http://${host}`)
    const path = url.pathname
    if (!path.startsWith('/api/')) return send(response, await options.app(path + url.search), FRAMED_BY_NOBODY)
    if (request.method === 'POST' && request.headers.origin !== `http://${host}`)
      throw new HttpError(403, strings().main.lan.sameOriginOnly)
    const token = cookieOf(request)
    const deviceId = token === undefined ? undefined : devices.idOf(token)

    if (path === REMOTE_API.session)
      return json(response, { kind: deviceId ? 'paired' : 'unpaired' } satisfies RemoteSession)
    if (path === REMOTE_API.pair && request.method === 'POST') {
      const ask = PairingAsk.safeParse(JSON.parse(await bodyOf(request, MAX_PAIRING_BODY_BYTES)))
      if (!ask.success) throw new HttpError(400, strings().main.lan.badDeviceName)
      const { id, code } = await tryOr(409, () => pairing.start(ask.data))
      return json(response, { id, code })
    }
    if (path.startsWith(`${REMOTE_API.pair}/`)) {
      const answer = await pairing.wait(path.slice(REMOTE_API.pair.length + 1), LONG_POLL_MS)
      if (answer.status !== 'allowed') return json(response, { status: answer.status })
      response.setHeader(
        'set-cookie',
        `${COOKIE}=${answer.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_S}`,
      )
      return json(response, { status: 'allowed' })
    }

    if (!deviceId) throw new HttpError(401, strings().main.lan.notPaired)
    if (path === REMOTE_API.events) return openStream(request, response, deviceId)
    if (path.startsWith(REMOTE_API.call) && request.method === 'POST') {
      const method = path.slice(REMOTE_API.call.length)
      // own keys only: `constructor` and `toString` are on every object, and are not bridge methods
      const handler = Object.hasOwn(options.handlers, method) ? options.handlers[method] : undefined
      if (!handler) throw new HttpError(404, strings().main.lan.desktopOnly)
      const args = z.array(z.unknown()).parse(JSON.parse(await bodyOf(request, options.maxBodyBytes()), reviveBytes))
      return json(response, (await tryOr(400, () => handler(...args))) ?? null)
    }
    if (path.startsWith(REMOTE_API.attachment))
      return send(response, await options.image(path.slice(REMOTE_API.attachment.length)))
    if (path.startsWith(REMOTE_API.miniApp))
      return send(response, options.miniApp(path.slice(REMOTE_API.miniApp.length)))
    if (path.startsWith(REMOTE_API.library))
      return send(response, await options.libraryFile(path.slice(REMOTE_API.library.length)))
    throw new HttpError(404, strings().main.lan.noSuchPath)
  }

  function openStream(request: IncomingMessage, response: ServerResponse, deviceId: string) {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
    response.write('retry: 3000\n\n')
    streams.set(response, deviceId)
    devices.seen(deviceId, Date.now())
    options.onOnlineChange()
    const ping = setInterval(() => response.write('event: ping\ndata: {}\n\n'), PING_MS)
    request.on('close', () => {
      clearInterval(ping)
      if (!streams.delete(response)) return
      devices.seen(deviceId, Date.now())
      options.onOnlineChange()
    })
  }

  return {
    /** Starts listening on every interface; resolves with why it could not, or null. */
    listen: () =>
      new Promise<string | null>((resolve) => {
        if (server) return resolve(null)
        const next = http.createServer((request, response) => {
          handle(request, response).catch((error) => fail(response, error))
        })
        next.on('connection', (socket) => {
          // the Host check stops browsers only; a program from the internet (a public IPv6 address, say) is cut off here
          if (!isLocalAddress(socket.remoteAddress ?? '')) return void socket.destroy()
          sockets.add(socket)
          socket.on('close', () => sockets.delete(socket))
        })
        next.once('error', (error: NodeJS.ErrnoException) =>
          resolve(
            error.code === 'EADDRINUSE'
              ? strings().main.lan.portInUse(options.port)
              : strings().main.lan.cannotStart(error.message),
          ),
        )
        next.listen(options.port, () => {
          server = next
          resolve(null)
        })
      }),
    close() {
      server?.close()
      server = null
      for (const socket of sockets) socket.destroy()
      streams.clear()
    },
    /** Where a device opens it, while it listens: this computer's LAN address. */
    address: () => {
      const ip = server && lanAddresses()[0]
      return ip ? `http://${ip}:${port()}` : null
    },
    onlineIds,
    broadcast(event: HarnessEvent) {
      if (!DEVICE_EVENTS.has(event.kind)) return
      const message = `data: ${JSON.stringify(event)}\n\n`
      for (const response of streams.keys()) response.write(message)
    },
    /** Ends the streams of a device that was just removed; its next request is turned away. */
    drop(deviceId: string) {
      for (const [response, id] of streams) {
        if (id !== deviceId) continue
        streams.delete(response)
        response.end()
      }
      options.onOnlineChange()
    },
  }
}

function isOwnHost(host: string, port: number) {
  const name = host.slice(0, host.lastIndexOf(':'))
  return host.endsWith(`:${port}`) && ['localhost', '127.0.0.1', '[::1]', ...lanAddresses()].includes(name)
}

function cookieOf(request: IncomingMessage): string | undefined {
  const pair = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
  return pair?.slice(COOKIE.length + 1)
}

async function bodyOf(request: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk)
    size += bytes.byteLength
    if (size > maxBytes) throw new HttpError(413, strings().main.lan.tooLarge)
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function tryOr<T>(status: number, run: () => T): Promise<Awaited<T>> {
  try {
    return await run()
  } catch (error) {
    throw new HttpError(status, error instanceof Error ? error.message : String(error))
  }
}

function json(response: ServerResponse, value: unknown) {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}

// fetch has already unpacked the dev server's body; passing on its encoding and length would garble it
const UNPACKED_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection'])

// the app opened inside another site's frame would ask this computer to pair on that site's behalf
const FRAMED_BY_NOBODY = { 'x-frame-options': 'DENY' }

async function send(response: ServerResponse, web: Response, extra: Record<string, string> = {}) {
  const headers = [...web.headers].filter(([name]) => !UNPACKED_HEADERS.has(name))
  response.writeHead(web.status, { ...Object.fromEntries(headers), ...extra, 'x-content-type-options': 'nosniff' })
  response.end(Buffer.from(await web.arrayBuffer()))
}

function fail(response: ServerResponse, error: unknown) {
  if (response.headersSent) return void response.end()
  const status = error instanceof HttpError ? error.status : 400
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify({ message: error instanceof Error ? error.message : String(error) }))
}
