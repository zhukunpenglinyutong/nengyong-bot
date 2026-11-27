import { randomInt, randomUUID } from 'node:crypto'
import type { PairingAnswer, PairingAsk, PairingRequest, PairingStarted } from '../shared/devices'
import { strings } from '../shared/strings'

export const PAIRING_TTL_MS = 2 * 60_000

type Decision = { status: 'allowed'; token: string } | { status: 'denied' }
type Status = Decision | { status: Exclude<PairingAnswer['status'], Decision['status']> }

interface Pending {
  request: PairingRequest
  code: string // kept out of request, which goes to the renderer
  decision: Decision | null
  wake: (() => void)[] // browsers waiting for the decision
}

interface Options {
  admit: (ask: PairingAsk) => string // lets the device in; returns its token
  onChange: (request: PairingRequest | null) => void // what this computer's user is asked now
}

export type Pairing = ReturnType<typeof createPairing>

/** One pairing request at a time: a browser asks, this computer's user lets it in or not, and the browser hears back. */
export function createPairing({ admit, onChange }: Options) {
  let pending: Pending | null = null

  const pendingAt = (id: string) => (pending?.request.id === id ? pending : null)
  const settle = (id: string, decision: Decision | null) => {
    const current = pendingAt(id)
    if (!current || current.decision) return
    pending = decision && { ...current, decision }
    onChange(null)
    for (const wake of current.wake) wake()
  }

  return {
    /** Asks this computer's user; a request still waiting is dropped, so nobody can hold the one place to keep others out. */
    start(ask: PairingAsk): PairingStarted {
      const replaced = pending
      const request = { ...ask, id: randomUUID() }
      const code = String(randomInt(0, 10_000)).padStart(4, '0')
      pending = { request, code, decision: null, wake: [] }
      for (const wake of replaced?.wake ?? []) wake()
      onChange(request)
      setTimeout(() => {
        settle(request.id, null)
        if (pending?.request.id === request.id) pending = null // allowed, but the browser never came back for its token
      }, PAIRING_TTL_MS)
      return { id: request.id, code }
    },
    /** `code`: what the user typed from the device's screen, which only the device that asked shows; null turns it away. */
    answer(id: string, code: string | null) {
      const current = pendingAt(id)
      if (!current || current.decision) throw new Error(strings().main.pairing.expired)
      if (code === null) return settle(id, { status: 'denied' })
      if (code !== current.code) throw new Error(strings().main.pairing.wrongCode)
      const { name, kind } = current.request
      settle(id, { status: 'allowed', token: admit({ name, kind }) })
    },
    /** The decision on `id`, handed over once; waits up to `timeoutMs` for it. */
    async wait(id: string, timeoutMs: number): Promise<Status> {
      const before = pendingAt(id)
      if (!before) return { status: 'gone' }
      if (!before.decision)
        await new Promise<void>((resolve) => {
          before.wake.push(resolve)
          setTimeout(resolve, timeoutMs)
        })
      const after = pendingAt(id)
      if (!after) return { status: 'gone' }
      if (!after.decision) return { status: 'waiting' }
      pending = null
      return after.decision
    },
  }
}
