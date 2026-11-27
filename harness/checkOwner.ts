import { MAIN_BOT_ID } from '../shared/bot'
import type { Store } from './store'

/**
 * Throws, saying who can, unless `botId` may do `action` (said of another bot, e.g. 换别的 Bot 的模型) to `owner`, a bot
 * in the sidebar: its own, or anyone's for the main bot.
 */
export function checkOwner(store: Store, botId: string, owner: string, action: string) {
  const { roster, bots } = store.get()
  if (!roster.includes(owner)) throw new Error(`没有 id 为 ${owner} 的 Bot`)
  if (owner === botId || botId === MAIN_BOT_ID) return
  const main = `[${bots[MAIN_BOT_ID]?.name ?? '主 Bot'}](bot:${MAIN_BOT_ID})`
  throw new Error(`只有 ${main} 能${action}：请用户跟它说，或者在那个 Bot 自己的聊天里说`)
}
