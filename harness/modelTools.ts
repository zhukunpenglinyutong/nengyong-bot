import { tool } from 'ai'
import { z } from 'zod'
import type { HarnessEvent } from '../shared/bridge'
import { ModelChoice } from '../shared/modelServices'
import { checkOwner } from './checkOwner'
import { patchFlow } from './flows'
import { patchRoutine } from './routines'
import type { ModelChoices } from './runModel'
import type { Store } from './store'
import { OptionalId } from './toolInputs'

const NEEDS_ID = 'target 是 routine 或 flow 时要填它的 id'
const MAX_NAMED = 30 // of the models an error lists: enough to spot the right name, short enough for an account with hundreds

interface ModelContext {
  botId: string
  store: Store
  emit: (event: HarnessEvent) => void
  choices: ModelChoices
  onBotModels: (botId: string) => void // a chat or task model changed: the panel of that bot shows them
}

/**
 * How a bot switches models: only in its chat, when the user asks; the app has no switch of its own for this. Each bot
 * switches its own, and the main bot those of the others too.
 */
export function modelTools({ botId, store, emit, choices, onBotModels }: ModelContext) {
  return {
    list_models: tool({
      description: '列出用户某个账号能用的模型（账号 id 见「模型」）。用户要换模型时，先用它查准模型名。',
      inputSchema: z.object({ accountId: z.string() }),
      execute: async ({ accountId }) => {
        checkAccount(choices, accountId)
        return { models: await choices.listModels(accountId) }
      },
    }),
    list_bot_models: tool({
      description:
        '查看团队里每个 Bot（含你自己）用什么模型：聊天、后台任务默认、每个例行任务和流程，带它们的 id。null 表示用主模型。',
      inputSchema: z.object({}),
      execute: async () => {
        const { roster, bots } = store.get()
        const listed = ({ id, name, model }: { id: string; name: string; model?: ModelChoice }) => ({
          id,
          name,
          model: model ?? null,
        })
        return roster
          .filter((id) => bots[id])
          .map((id) => ({
            mention: `[${bots[id].name}](bot:${id})`,
            chat: bots[id].model ?? null,
            tasks: bots[id].taskModel ?? null,
            routines: bots[id].routines.map(listed),
            flows: bots[id].flows.map(listed),
          }))
      },
    }),
    set_model: tool({
      description:
        '换模型，只在用户在聊天里要求时用。target=chat：聊天用的；tasks：后台任务默认用的（任务和它按的流程都没指定模型时用它）；routine：某个例行任务（填它的 id）；flow：按某个流程做的任务（填流程 id）。不填 model 就改回主模型。',
      inputSchema: z.object({
        botId: z.string().optional().describe('换别的 Bot 的才填它的 id，只有主 Bot 能填；不填就是你自己'),
        target: z.enum(['chat', 'tasks', 'routine', 'flow']),
        id: OptionalId.describe('target 是 routine 或 flow 时填'),
        model: ModelChoice.optional().describe('账号 id（见「模型」）和 list_models 列出的模型名；不填就改回主模型'),
      }),
      execute: async ({ botId: owner = botId, target, id, model }) => {
        checkOwner(store, botId, owner, '换别的 Bot 的模型')
        if (model) await checkModel(choices, model)
        switch (target) {
          case 'chat':
            store.updateBot(owner, { model })
            onBotModels(owner)
            return { ok: true }
          case 'tasks':
            store.updateBot(owner, { taskModel: model })
            onBotModels(owner)
            return { ok: true }
          case 'routine':
            if (!id) throw new Error(NEEDS_ID)
            patchRoutine(store, emit, owner, id, { model })
            return { ok: true }
          case 'flow':
            if (!id) throw new Error(NEEDS_ID)
            patchFlow(store, emit, owner, id, { model })
            return { ok: true }
          default:
            return target satisfies never
        }
      },
    }),
  }
}

/** Throws, naming what there is, unless the account is connected and lists the model. */
export async function checkModel(choices: ModelChoices, choice: ModelChoice) {
  checkAccount(choices, choice.accountId)
  const models = await choices.listModels(choice.accountId)
  if (models.includes(choice.model)) return
  const named = models.slice(0, MAX_NAMED).join('、')
  throw new Error(`账号 ${choice.accountId} 没有模型 ${choice.model}，它列出的有：${named}`)
}

function checkAccount(choices: ModelChoices, accountId: string) {
  const accounts = choices.accounts()
  if (accounts.some((account) => account.id === accountId)) return
  const named = accounts.map((account) => `${account.name}（${account.id}）`).join('、') || '无'
  throw new Error(
    `没有 id 为 ${accountId} 的账号，用户接上的有：${named}。要用别的服务商，请用户先在设置「模型服务」里添加账号`,
  )
}
