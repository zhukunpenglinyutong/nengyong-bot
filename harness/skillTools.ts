import { tool } from 'ai'
import { z } from 'zod'
import { SkillName } from '../shared/skill'
import { checkOwner } from './checkOwner'
import type { Skills } from './skills'
import type { Store } from './store'
import { OptionalId } from './toolInputs'

interface SkillToolsContext {
  botId: string
  store: Store
  skills: Skills
}

const OWNER_INPUT = OptionalId.describe('给别的 Bot 装、卸才填它的 id，只有主 Bot 能填；不填就是你自己')

/** What a bot does about skills in its chat: offer one to install (the user decides on its card), or remove one. */
export function skillChatTools({ botId, store, skills }: SkillToolsContext) {
  return {
    install_skill: tool({
      description:
        '读出技能，在聊天里给用户出一张确认卡。source 是技能的 GitHub 链接（仓库，或仓库里技能所在的文件夹），或者用户电脑上技能文件夹的完整路径。那里有好几个技能（技能合集）时，卡片上全部列出来，用户自己勾选装哪些。这一步不会装：用户点了卡片上的「装上」才装好，你会收到结果。同名的技能已经有了，装上就替换它。',
      inputSchema: z.object({
        source: z.string().trim().min(1).max(500),
        botId: OWNER_INPUT,
      }),
      execute: async ({ source, botId: owner = botId }) => {
        checkOwner(store, botId, owner, '给别的 Bot 装、卸技能')
        const offer = await skills.offer(botId, owner, source)
        return {
          ...offer,
          note: '确认卡已经显示在聊天里。用一两句话告诉用户这些技能做什么（好几个就概括）、带不带脚本；skipped 里有装不了的，说一下是哪些、为什么。请用户在卡片上勾选、决定；不要说已经装好了。',
        }
      },
    }),
    remove_skill: tool({
      description: '卸载技能，可以一次卸好几个（比如一整个技能合集），它们的文件夹会删掉。用户明确要求时才用。',
      inputSchema: z.object({ names: z.array(SkillName).min(1), botId: OWNER_INPUT }),
      execute: async ({ names, botId: owner = botId }) => {
        checkOwner(store, botId, owner, '给别的 Bot 装、卸技能')
        skills.remove(owner, names)
        return { removed: names }
      },
    }),
  }
}

/** What a task uses to open a skill of its bot (the main bot's tasks: of any bot) before following it. */
export function skillTaskTools({ botId, skills }: Omit<SkillToolsContext, 'store'>) {
  return {
    use_skill: tool({
      description:
        '打开一个技能：返回它的说明（SKILL.md 正文）、技能文件夹的绝对路径和里面的文件。照着说明做；说明里提到的资料用 read_file 读（写绝对路径），脚本用 run_command 跑。',
      inputSchema: z.object({
        skill: z.string().trim().min(1).max(120).describe('技能名；主 Bot 用别的 Bot 的技能时写成「Bot id/技能名」'),
      }),
      execute: async ({ skill }) => skills.use(botId, skill),
    }),
  }
}
