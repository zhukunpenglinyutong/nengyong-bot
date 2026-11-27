import { createContext, useContext } from 'react'
import type { Bot } from '../../shared/bot'
import type { Flow } from '../../shared/flow'
import type { MiniApp } from '../../shared/miniApp'
import type { SkillView } from '../../shared/skill'
import type { SkillFilesTarget } from '../skills/SkillFilesDialog'

interface Mentions {
  chatBotId: string // the bot whose chat this is
  bots: Bot[] // what [name](bot:id) mentions in replies resolve against
  open: (botId: string) => void
  flows: Flow[] // what [name](flow:id) mentions resolve against: the flows of the bot whose chat this is
  openFlow: (flowId: string) => void
  miniApps: MiniApp[] // what [name](app:id) links resolve against: the mini apps of the bot whose chat this is
  openMiniApp: (miniAppId: string, from: Element) => void // from: what it was opened from, its window grows out of it
  thumbUrl: (app: MiniApp) => string // a card's live picture of it
  fileUrl: (path: string) => string // where a reply's ![](file://…) image in the library loads from
  openFile: (path: string) => void // what a reply's [name](file://…) link does: opens that file in the library
  skills: SkillView[] // what [name](skill:name) and [name](skill:botId/name) resolve against: what the chat's bot can use
  openSkill: (botId: string, name: string) => void
  answerSkillOffer?: (offer: string, names: string[]) => Promise<void> // an install card's buttons; absent on a device
  openSkillFiles: (target: SkillFilesTarget) => void
}

/** What a bot, flow, skill or mini app mention, an install card or a file link deep in a reply needs, so the chat view does not hand it down through every layer. */
export const MentionContext = createContext<Mentions | null>(null)

export function useMentions(): Mentions {
  const value = useContext(MentionContext)
  if (!value) throw new Error('useMentions needs a <ChatView> above it')
  return value
}
