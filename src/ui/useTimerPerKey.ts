import { useEffect, useRef } from 'react'

/** One timer per key: starting one clears that key's last, a fired one is dropped, and all are cleared on unmount. */
export function useTimerPerKey() {
  const timers = useRef(new Map<string, number>())

  useEffect(() => {
    const running = timers.current
    return () => {
      for (const timer of running.values()) window.clearTimeout(timer)
      running.clear()
    }
  }, [])

  return (key: string, delayMs: number, onFire: () => void) => {
    window.clearTimeout(timers.current.get(key))
    const timer = window.setTimeout(() => {
      timers.current.delete(key)
      onFire()
    }, delayMs)
    timers.current.set(key, timer)
  }
}
