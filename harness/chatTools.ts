import { tool } from 'ai'
import { z } from 'zod'
import { BOT_NAME_MAX, newBotId, PALETTE, PICKER_SHAPES } from '../shared/bot'
import type { HarnessEvent } from '../shared/bridge'
import type { Limits } from '../shared/limits'
import type { FlowSaved } from '../shared/flow'
import { newId } from '../shared/newId'
import { SECTION_NAME_MAX } from '../shared/sidebar'
import {
  MESSAGES_PER_POINT,
  POINTS_PER_FIRST_FLOW_RUN,
  POINTS_PER_FLOW_RUN,
  POINTS_PER_FLOW_SAVED,
  POINTS_PER_LEVEL,
  tierOf,
  trustOf,
} from '../shared/trust'
import { checkFlow, NewFlow, patchFlow, updateFlows } from './flows'
import { miniAppOf } from './miniApps'
import { checkModel } from './modelTools'
import { NewRoutine, patchRoutine, updateRoutines } from './routines'
import type { ModelChoices } from './runModel'
import type { Store } from './store'
import type { TaskRunner } from './tasks'
import { MODEL_INPUT, OptionalId } from './toolInputs'
import type { Fact } from './types'
import { strings } from '../shared/strings'

const COLORS = PALETTE.filter((color) => color.id !== 'ink')
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]

function sectionIdOf(store: Store, name: string): string {
  const sections = store.sidebar()?.sections ?? []
  const section = sections.find((candidate) => candidate.name === name)
  if (section) return section.id
  const names = sections.map((candidate) => candidate.name).join('、') || '无'
  throw new Error(`没有叫「${name}」的分组，现有分组：${names}。不填 section 就放在「${strings().common.ungrouped}」`)
}

interface ChatContext {
  botId: string
  store: Store
  emit: (e: HarnessEvent) => void
  tasks: TaskRunner
  limits: Limits
  models: ModelChoices
}

/** What a bot does in its chat: memories, bots, routines, flows and tasks. */
export function chatTools({ botId, store, emit, tasks, limits, models }: ChatContext) {
  const { maxFacts, maxRoutines, maxFlows } = limits
  const bot = () => store.get().bots[botId]

  return {
    remember: tool({
      description: '记住一条长期有用的信息。scope=user：关于用户本人、所有 Bot 共享；scope=bot：只和你的职责有关。',
      inputSchema: z.object({ text: z.string().min(1).max(500), scope: z.enum(['user', 'bot']) }),
      execute: async ({ text, scope }) => {
        const fact: Fact = { id: newId(scope === 'user' ? 'u' : 'm'), text, at: Date.now() }
        // the oldest drop off: the lists go into every system prompt
        if (scope === 'user') store.update((s) => ({ ...s, userFacts: [...s.userFacts, fact].slice(-maxFacts) }))
        else store.updateBot(botId, { memories: [...bot().memories, fact].slice(-maxFacts) })
        return { saved: fact.id }
      },
    }),
    forget: tool({
      description: '删除一条记忆（用记忆前面方括号里的 id）。',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const before = store.get()
        store.update((s) => ({ ...s, userFacts: s.userFacts.filter((f) => f.id !== id) }))
        store.updateBot(botId, { memories: bot().memories.filter((f) => f.id !== id) })
        const after = store.get()
        const removed =
          after.userFacts.length < before.userFacts.length ||
          after.bots[botId].memories.length < before.bots[botId].memories.length
        if (!removed) throw new Error(`没有 id 为 ${id} 的记忆`)
        return { forgotten: id }
      },
    }),
    update_my_instructions: tool({
      description: '改写你自己的职责说明（完整替换）。',
      inputSchema: z.object({ instructions: z.string().min(1).max(2000) }),
      execute: async ({ instructions }) => {
        store.updateBot(botId, { instructions })
        return { ok: true }
      },
    }),
    update_my_name: tool({
      description: '改你自己在侧边栏里显示的名字。',
      inputSchema: z.object({ name: z.string().trim().min(1).max(BOT_NAME_MAX) }),
      execute: async ({ name }) => {
        store.updateBot(botId, { name })
        emit({ kind: 'bot-renamed', botId, name })
        return { ok: true }
      },
    }),
    create_bot: tool({
      description: '新建一个 Bot，它会出现在用户的侧边栏里。',
      inputSchema: z.object({
        name: z.string().trim().min(1).max(BOT_NAME_MAX),
        instructions: z.string().min(1).max(2000).describe('它负责什么、怎么做、不做什么'),
        shape: z.enum(PICKER_SHAPES).optional(),
        color: z.enum(COLORS.map((choice) => choice.id)).optional(),
        section: z
          .string()
          .trim()
          .min(1)
          .max(SECTION_NAME_MAX)
          .optional()
          .describe(
            `放进侧边栏的哪个分组，填「团队里的其他 Bot」里列出的分组名；不填就放在「${strings().common.ungrouped}」`,
          ),
      }),
      execute: async ({ name, instructions, shape, color, section }) => {
        const sectionId = section === undefined ? undefined : sectionIdOf(store, section)
        const id = newBotId()
        const palette = COLORS.find((choice) => choice.id === color) ?? pick(COLORS)
        const created = { id, name, shape: shape ?? pick(PICKER_SHAPES), color: palette.value, sectionId }
        store.addBot(created, instructions)
        emit({ kind: 'bot-created', bot: created })
        return { id, name, section: section ?? strings().common.ungrouped, mention: `[${name}](bot:${id})` }
      },
    }),
    list_bot_levels: tool({
      description: `查看团队里每个 Bot（含你自己）的等级、段位和经验来源，已按经验从高到低排好。经验规则：和它对话每 ${MESSAGES_PER_POINT} 次 +1；沉淀一个新流程 +${POINTS_PER_FLOW_SAVED}；一个流程第一次做成 +${POINTS_PER_FIRST_FLOW_RUN}，之后每做成一次 +${POINTS_PER_FLOW_RUN}；从 Lv.n 升到下一级要 n × ${POINTS_PER_LEVEL} 经验。返回的 mention 原样写进回复。`,
      inputSchema: z.object({}),
      execute: async () => {
        const { roster, bots } = store.get()
        return roster
          .filter((id) => bots[id])
          .map((id) => {
            const trust = trustOf(store.range(id, 1))
            return { mention: `[${bots[id].name}](bot:${id})`, tier: tierOf(trust.level).name, ...trust }
          })
          .toSorted((a, b) => b.level - a.level || b.points - a.points)
      },
    }),
    create_routine: tool({
      description:
        '新建一个例行任务，显示在用户面板的「近况」里。到点时 prompt 会作为你的一个后台任务去做，做完你会收到结论。',
      inputSchema: NewRoutine,
      execute: async (input) => {
        if (input.flowId) checkFlow(store, botId, input.flowId)
        if (input.model) await checkModel(models, input.model)
        const id = newId('r')
        updateRoutines(store, emit, botId, (routines) => {
          if (routines.length >= maxRoutines) throw new Error(`最多 ${maxRoutines} 个例行任务，先删掉不用的`)
          return [...routines, { ...input, id, isEnabled: true }]
        })
        return { id }
      },
    }),
    set_routine_enabled: tool({
      description: '暂停（false）或恢复（true）你的一个例行任务。',
      inputSchema: z.object({ id: z.string(), isEnabled: z.boolean() }),
      execute: async ({ id, isEnabled }) => {
        patchRoutine(store, emit, botId, id, { isEnabled })
        return { ok: true }
      },
    }),
    set_routine_flow: tool({
      description: '让你的一个例行任务以后每次按你的某个流程做（填 flowId），或者不再按流程做（不填）。',
      inputSchema: z.object({ id: z.string(), flowId: OptionalId }),
      execute: async ({ id, flowId }) => {
        if (flowId) checkFlow(store, botId, flowId)
        patchRoutine(store, emit, botId, id, { flowId })
        return { ok: true }
      },
    }),
    delete_routine: tool({
      description: '删除你的一个例行任务。',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        patchRoutine(store, emit, botId, id, null)
        return { deleted: id }
      },
    }),
    save_flow: tool({
      description:
        '存一个流程：一套以后照着做的做法，显示在用户面板的「流程」里。带 id 就整条替换那个流程。返回的 mention 原样写进回复。',
      inputSchema: NewFlow,
      execute: async ({ id, ...fields }) => {
        const updatedAt = Date.now()
        const savedId = id ?? newId('f')
        const saved = { saved: savedId, isNew: !id, mention: `[${fields.name}](flow:${savedId})` } satisfies FlowSaved
        if (id) {
          patchFlow(store, emit, botId, id, { ...fields, updatedAt })
          return saved
        }
        updateFlows(store, emit, botId, (flows) => {
          if (flows.length >= maxFlows) throw new Error(`最多 ${maxFlows} 个流程，先删掉不用的`)
          return [...flows, { ...fields, id: savedId, updatedAt }]
        })
        return saved
      },
    }),
    delete_flow: tool({
      description: '删除你的一个流程。',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const followers = bot().routines.filter((routine) => routine.flowId === id)
        if (followers.length) {
          const names = followers.map((routine) => `例行任务「${routine.name}」[${routine.id}]`).join('、')
          throw new Error(
            `${names}按这个流程做：先用 set_routine_flow 把它们换到别的流程或去掉流程，或者用 save_flow 改这个流程`,
          )
        }
        patchFlow(store, emit, botId, id, null)
        return { deleted: id }
      },
    }),
    start_task: tool({
      description:
        '开一个后台任务：它带着职责和记忆、用读写文件和上网的工具独立做完，做完你会收到它交回的结论，再告诉用户。开完立即返回，不用等它做完。任务里不能记忆、建 Bot、管例行任务或流程、再开任务，派给别的 Bot 也一样：这些只能由那个 Bot 在它自己的聊天里做。',
      inputSchema: z.object({
        title: z.string().trim().min(1).max(40).describe('显示在面板上的短名字，如“五仓库日报”'),
        brief: z
          .string()
          .trim()
          .min(1)
          .max(4000)
          .describe('任务看不到这段聊天：写清目标、已知信息（附相关 ref）、约束、产出形式'),
        botId: z.string().optional().describe('让哪个 Bot 去做（按它的职责和记忆）；不填就是你自己'),
        flowId: OptionalId.describe('按你的哪个流程做（流程 id）；要做的事和某个流程对得上就填，不填 botId'),
        miniAppId: OptionalId.describe('要改你的哪个小程序（小程序 id）；改页面或换数据都填，新做的不填，也不填 botId'),
        model: MODEL_INPUT,
      }),
      execute: async ({ title, brief, botId: runAs = botId, flowId, miniAppId, model }) => {
        if (!store.get().roster.includes(runAs)) throw new Error(`没有 id 为 ${runAs} 的 Bot`)
        if (flowId && runAs !== botId) throw new Error('按流程做的任务只能你自己做：填了 flowId 就不要填 botId')
        if (miniAppId && runAs !== botId) throw new Error('改小程序的任务只能你自己做：填了 miniAppId 就不要填 botId')
        if (flowId) checkFlow(store, botId, flowId)
        if (miniAppId) miniAppOf(store, botId, miniAppId)
        if (model) await checkModel(models, model)
        const source = { kind: 'chat' } as const
        const task = tasks.start({ botId: runAs, requestedBy: botId, source, title, brief, flowId, miniAppId, model })
        return { taskId: task.id, status: task.status }
      },
    }),
    stop_task: tool({
      description: '停止你开的一个后台任务（用任务 id）。停下的任务不会再交回结论。',
      inputSchema: z.object({ taskId: z.string() }),
      execute: async ({ taskId }) => {
        const task = store.task(taskId)
        if (task && task.requestedBy !== botId) throw new Error(`任务 ${taskId} 不是你开的，不能停`)
        tasks.stop(taskId)
        return { stopped: taskId }
      },
    }),
  }
}
