// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PairingRequest } from '../shared/devices'
import { createPairing, PAIRING_TTL_MS } from './pairing'

const IPHONE = { name: 'iPhone', kind: 'phone' } as const
const WAIT_MS = 10_000

let asked: (PairingRequest | null)[]
const admit = vi.fn(() => 'the-token')
beforeEach(() => {
  vi.useFakeTimers()
  asked = []
  admit.mockClear()
})
afterEach(() => vi.useRealTimers())

const pairing = () => createPairing({ admit, onChange: (request) => asked.push(request) })

it('hands the asking browser a four-digit code', () => {
  const { code } = pairing().start(IPHONE)
  expect(code).toMatch(/^\d{4}$/)
})

it('asks this computer who wants in, without the code: only the asking device shows it', () => {
  const { id } = pairing().start(IPHONE)
  expect(asked).toEqual([{ id, ...IPHONE }])
})

it('replaces a request still waiting, so nobody can hold the one place to keep others out', async () => {
  const flow = pairing()
  const first = flow.start(IPHONE)
  const answer = flow.wait(first.id, WAIT_MS)
  const second = flow.start(IPHONE)
  await expect(answer).resolves.toEqual({ status: 'gone' })
  expect(asked.at(-1)).toEqual({ id: second.id, ...IPHONE })
})

it('hands the token to the waiting browser once the user types its code', async () => {
  const flow = pairing()
  const { id, code } = flow.start(IPHONE)
  const answer = flow.wait(id, WAIT_MS)
  flow.answer(id, code)
  await expect(answer).resolves.toEqual({ status: 'allowed', token: 'the-token' })
  expect(admit).toHaveBeenCalledWith(IPHONE)
  expect(asked.at(-1)).toBeNull()
})

it('lets nobody in on a code other than the one the device shows', () => {
  const flow = pairing()
  const { id, code } = flow.start(IPHONE)
  expect(() => flow.answer(id, code === '0000' ? '1111' : '0000')).toThrow('配对码不对')
  expect(admit).not.toHaveBeenCalled()
})

it('hands the token over only once', async () => {
  const flow = pairing()
  const { id, code } = flow.start(IPHONE)
  flow.answer(id, code)
  await flow.wait(id, WAIT_MS)
  await expect(flow.wait(id, WAIT_MS)).resolves.toEqual({ status: 'gone' })
})

it('lets nobody in when the user denies it', async () => {
  const flow = pairing()
  const { id } = flow.start(IPHONE)
  flow.answer(id, null)
  await expect(flow.wait(id, WAIT_MS)).resolves.toEqual({ status: 'denied' })
  expect(admit).not.toHaveBeenCalled()
})

it('tells a browser to ask again when nothing was decided in time', async () => {
  const flow = pairing()
  const { id } = flow.start(IPHONE)
  const answer = flow.wait(id, WAIT_MS)
  await vi.advanceTimersByTimeAsync(WAIT_MS)
  await expect(answer).resolves.toEqual({ status: 'waiting' })
})

it('drops a request nobody answered and stops asking this computer', async () => {
  const flow = pairing()
  const { id, code } = flow.start(IPHONE)
  await vi.advanceTimersByTimeAsync(PAIRING_TTL_MS)
  expect(asked.at(-1)).toBeNull()
  expect(() => flow.answer(id, code)).toThrow('过期')
  await expect(flow.wait(id, WAIT_MS)).resolves.toEqual({ status: 'gone' })
})

it('knows nothing of a made-up request id', async () => {
  const flow = pairing()
  flow.start(IPHONE)
  await expect(flow.wait('made-up', WAIT_MS)).resolves.toEqual({ status: 'gone' })
})
