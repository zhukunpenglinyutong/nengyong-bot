import type { Bot } from '../../shared/bot'
import type { Ask } from '../../shared/decisions'
import { strings } from '../../shared/strings'
import type { IconName } from '../ui/Icon'

/** How each kind of ask is marked: on its line in the chat and in the tray above the message box. */
export const ASK_KINDS: Record<Ask['kind'], { icon: IconName; label: string }> = {
  duty: { icon: 'target', label: strings().chat.asks.duty },
  skill: { icon: 'skill', label: strings().chat.asks.skill },
  question: { icon: 'help', label: strings().chat.asks.question },
}

/** What an ask is about, in one line: the duty card's bot and version, the skills it installs, the question. */
export function askTitle(ask: Ask, bots: Bot[]): string {
  switch (ask.kind) {
    case 'duty': {
      const name = bots.find((bot) => bot.id === ask.offer.botId)?.name ?? ask.offer.botId
      return strings().bot.duty.offer.title(name, ask.offer.baseVersion + 1)
    }
    case 'skill':
      return strings().chat.asks.skillTitle(strings().skills.names(ask.offer.skills.map((skill) => skill.name)))
    case 'question':
      return ask.question.question
    default:
      return ask satisfies never
  }
}
