import { useEffect, useEffectEvent } from 'react'

/** Calls `read` once the component is mounted, and hands what it answers to `onRead`, or why it failed to `onFailure`. */
export function useReadOnMount<T>(
  read: () => Promise<T>,
  onRead: (value: T) => void,
  onFailure: (error: unknown) => void,
) {
  const start = useEffectEvent(() => read().then(onRead, onFailure))

  useEffect(() => {
    start()
  }, [])
}
