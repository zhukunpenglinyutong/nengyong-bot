import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useBotActivities } from './botActivity'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

it('is happy for a moment after a turn ends, then idle', () => {
  const { result } = renderHook(useBotActivities)
  act(() => result.current.onBusy('chief', true))
  expect(result.current.activities).toEqual({ chief: 'thinking' })
  act(() => result.current.onBusy('chief', false))
  expect(result.current.activities).toEqual({ chief: 'happy' })
  act(() => vi.runAllTimers())
  expect(result.current.activities).toEqual({})
})

it('keeps one timer per bot however many of its turns end', () => {
  const { result } = renderHook(useBotActivities)
  act(() => {
    result.current.onBusy('chief', false)
    result.current.onBusy('chief', false)
    result.current.onBusy('secretary', false)
  })
  expect(vi.getTimerCount()).toBe(2)
})

it('leaves no timer behind once it unmounts', () => {
  const { result, unmount } = renderHook(useBotActivities)
  act(() => result.current.onBusy('chief', false))
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
