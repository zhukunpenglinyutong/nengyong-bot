import { createContext, useContext, useState } from 'react'
import { useTimerPerKey } from '../ui/useTimerPerKey'

/** Transient per-bot activity driving avatar motion; absent means idle. */
export type BotActivity = 'thinking' | 'happy'

export const BotActivityContext = createContext<Record<string, BotActivity>>({})

export const useBotActivity = (botId: string) => useContext(BotActivityContext)[botId] ?? 'idle'

const HAPPY_MS = 1100 // spin + bounce reaction length

/** Owns every bot's activity: 'thinking' while a turn runs, then 'happy' for a moment, then idle. */
export function useBotActivities() {
  const [activities, setActivities] = useState<Record<string, BotActivity>>({})
  const startTimer = useTimerPerKey()

  const set = (botId: string, next: BotActivity | null, onlyIf?: BotActivity) =>
    setActivities((previous) => {
      if (onlyIf && previous[botId] !== onlyIf) return previous // a newer turn already changed the state
      const { [botId]: _dropped, ...rest } = previous
      return next ? { ...rest, [botId]: next } : rest
    })

  return {
    activities,
    onBusy(botId: string, busy: boolean) {
      if (busy) return set(botId, 'thinking')
      set(botId, 'happy')
      startTimer(botId, HAPPY_MS, () => set(botId, null, 'happy'))
    },
  }
}
