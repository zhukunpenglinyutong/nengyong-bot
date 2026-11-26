import { useCallback, useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import type { Preferences, Theme } from '../preferences'

/** Puts the chosen theme on <html>, where src/index.css reads it; dialogs render into <body>, so it cannot sit lower. */
export function useDocumentTheme(preference: Preferences['theme']): Theme {
  const media = useMemo(
    () => (preference === 'system' ? matchMedia('(prefers-color-scheme: dark)') : null),
    [preference],
  )
  const subscribe = useCallback(
    (onChange: () => void) => {
      media?.addEventListener('change', onChange)
      return () => media?.removeEventListener('change', onChange)
    },
    [media],
  )
  const isSystemDark = useSyncExternalStore(subscribe, () => media?.matches ?? false)
  const theme = preference === 'system' ? (isSystemDark ? 'dark' : 'light') : preference
  // layout effect: the first paint already has the right colours
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return theme
}
