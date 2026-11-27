import { useEffect, useEffectEvent } from 'react'

/** Calls `onFocus` each time the window comes back to the front. */
export function useWindowFocus(onFocus: () => void) {
  const handle = useEffectEvent(onFocus)

  useEffect(() => {
    const listener = () => handle()
    window.addEventListener('focus', listener)
    return () => window.removeEventListener('focus', listener)
  }, [])
}
