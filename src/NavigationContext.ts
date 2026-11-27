import { createContext, useContext } from 'react'
import type { SkillFilesTarget } from './skills/SkillFilesDialog'

/** Where a click deep in the chat, the island or the panel takes the user; the desktop and a device each go there their own way. */
export interface Navigation {
  openBot: (botId: string) => void
  openFlow: (flowId: string | null) => void // in the panel's abilities tab; null: the list of the open bot's flows
  openSkill: (botId: string, name: string) => void // in the panel's abilities tab
  openSkillFiles: (target: SkillFilesTarget) => void
  openMiniApp: (miniAppId: string, from: Element) => void // from: what it was opened from, its window grows out of it
}

export const NavigationContext = createContext<Navigation | null>(null)

export function useNavigation(): Navigation {
  const value = useContext(NavigationContext)
  if (!value) throw new Error('useNavigation needs a <NavigationContext> above it')
  return value
}
