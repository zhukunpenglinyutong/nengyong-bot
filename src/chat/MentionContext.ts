import { createContext, useContext } from 'react'
import type { Bot } from '../../shared/bot'
import type { Flow } from '../../shared/flow'
import type { MiniApp } from '../../shared/miniApp'
import type { SkillView } from '../../shared/skill'

interface Mentions {
  chatBotId: string // the bot whose chat this is
  bots: Bot[] // what [name](bot:id) mentions in replies resolve against
  open: (botId: string) => void // opens a mentioned bot, keeping the way back to this chat
  flows: Flow[] // what [name](flow:id) mentions resolve against: the flows of the bot whose chat this is
  miniApps: MiniApp[] // what [name](app:id) links resolve against: the mini apps of the bot whose chat this is
  thumbUrl: (app: MiniApp) => string // a card's live picture of it
  attachmentUrl: (path: string) => string // where an image in the library loads from: one sent, or a reply's ![](file://…)
  openFile: (path: string) => void // what a reply's [name](file://…) link does: opens that file in the library
  skills: SkillView[] // what [name](skill:name) and [name](skill:botId/name) resolve against: what the chat's bot can use
}

/** What a bot, flow, skill or mini app mention, an install card or a file link deep in a reply needs, so the chat view does not hand it down through every layer. */
export const MentionContext = createContext<Mentions | null>(null)

export function useMentions(): Mentions {
  const value = useContext(MentionContext)
  if (!value) throw new Error('useMentions needs a <ChatView> above it')
  return value
}
