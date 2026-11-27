import { tool } from 'ai'
import { z } from 'zod'
import { BOT_NAME_MAX, MAIN_BOT_ID, newBotId, PALETTE, PICKER_SHAPES, type SectionByName } from '../shared/bot'
import type { HarnessEvent } from '../shared/bridge'
import type { Limits } from '../shared/limits'
import type { FlowSaved } from '../shared/flow'
import { newId } from '../shared/newId'
import { DISMISSED_KEEP_DAYS, SECTION_NAME_MAX } from '../shared/sidebar'
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
import { checkOwner } from './checkOwner'
import { welcome } from './duty'
import { line, MODEL_INPUT, OptionalId } from './toolInputs'
import type { Fact } from './types'
import { strings } from '../shared/strings'

const COLORS = PALETTE.filter((color) => color.id !== 'ink')
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]

/** The sidebar section called `name`, with a new id when there is none yet (the sidebar then makes it); undefined: 其他. */
function sectionByName(store: Store, name: string | undefined): SectionByName | undefined {
  if (name === undefined || name === strings().common.ungrouped) return undefined
  const existing = store.sidebar()?.sections.find((candidate) => candidate.name === name)
  return { id: existing?.id ?? newId('s'), name }
}

const sectionInput = () =>
  line(SECTION_NAME_MAX)
    .optional()
    .describe(
      `放进侧边栏的哪个分组：填「团队里的其他 Bot」里列出的分组名；用户要的分组还没有就填它的名字，会新建；不填就放在「${strings().common.ungrouped}」`,
    )

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
        purpose: line(200).describe('它为什么在这儿：一句话。目标和验收指标它会自己和用户定'),
        shape: z.enum(PICKER_SHAPES).optional(),
        color: z.enum(COLORS.map((choice) => choice.id)).optional(),
        section: sectionInput(),
      }),
      execute: async ({ name, purpose, shape, color, section: sectionName }) => {
        const section = sectionByName(store, sectionName)
        const id = newBotId()
        const palette = COLORS.find((choice) => choice.id === color) ?? pick(COLORS)
        const created = { id, name, shape: shape ?? pick(PICKER_SHAPES), color: palette.value, section }
        store.addBot(created, purpose)
        emit({ kind: 'bot-created', bot: created })
        emit({ kind: 'entry', botId: id, entry: welcome(store, id) })
        return { id, name, section: section?.name ?? strings().common.ungrouped, mention: `[${name}](bot:${id})` }
      },
    }),
    move_bot: tool({
      description: '把一个 Bot 换到侧边栏的另一个分组（分组还没有就新建）。',
      inputSchema: z.object({ botId: z.string().describe('要换分组的 Bot 的 id'), section: sectionInput() }),
      execute: async ({ botId: target, section: sectionName }) => {
        checkOwner(store, botId, target, '给别的 Bot 换分组')
        const section = sectionByName(store, sectionName)
        emit({ kind: 'bot-moved', botId: target, section })
        return { botId: target, section: section?.name ?? strings().common.ungrouped }
      },
    }),
    ...(botId === MAIN_BOT_ID
      ? {
          dismiss_bot: tool({
            description: `让一个 Bot 离职：它离开侧边栏，在设置「Bot 回收站」里放 ${DISMISSED_KEEP_DAYS} 天，期间用户能恢复，之后再也找不回。用户明确同意了才用。`,
            inputSchema: z.object({ botId: z.string().describe('要离职的 Bot 的 id') }),
            execute: async ({ botId: target }) => {
              if (target === MAIN_BOT_ID) throw new Error('主 Bot 不能离职')
              checkOwner(store, botId, target, '让 Bot 离职')
              emit({ kind: 'bot-dismissed', botId: target })
              return { dismissed: target, daysToRestore: DISMISSED_KEEP_DAYS }
            },
          }),
        }
      : {}),
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
