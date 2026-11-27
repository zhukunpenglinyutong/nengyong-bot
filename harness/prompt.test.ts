import { expect, it } from 'vitest'
import { joinSections } from '../shared/debug'
import type { MiniApp } from '../shared/miniApp'
import type { SidebarState } from '../shared/sidebar'
import { systemSections, taskSystem } from './prompt'
import type { BotBrain, HarnessState, Task } from './types'
import { dutyOf } from '../shared/duty'

const task = (patch: Partial<Task>): Task => ({
  id: 't1',
  botId: 'chief',
  requestedBy: 'chief',
  source: { kind: 'chat' },
  title: '调研',
  status: 'running',
  statusText: '',
  createdAt: 0,
  ...patch,
})
const chatSystem = (...args: Parameters<typeof systemSections>) => joinSections(systemSections(...args))
const MODELS = { main: 'deepseek-chat', chat: undefined, tasks: undefined, accounts: [{ id: 'kimi', name: 'Kimi' }] }
const KIMI = { accountId: 'kimi', model: 'kimi-k2' }
const state: HarnessState = { userFacts: [], bots: {}, roster: [], pending: [], onboardedAt: null }
const bot: BotBrain = {
  id: 'chief',
  name: 'CEO',
  duty: dutyOf(''),
  memories: [],
  summary: '',
  summarizedUpTo: 0,
  routines: [],
  flows: [],
  miniApps: [],
  skills: [],
}

it('lists the running tasks with their progress, then as many that ended as the limits say', () => {
  const now = new Date(10 * 60_000)
  const ended = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => task({ id: `t${id}`, title: id, status: 'done' }))
  const system = chatSystem(
    state,
    null,
    bot,
    [
      task({ id: 't1', createdAt: 7 * 60_000, statusText: '核对 star 数' }),
      task({ id: 't2', status: 'waiting' }),
      ...ended,
      task({ id: 't3', status: 'failed' }),
    ],
    [],
    5,
    MODELS,
    now,
  )
  expect(system).toContain(
    '## 进行中的任务\n\n- [t1] 调研（运行中 3 分钟，进度：核对 star 数）\n- [t2] 调研（排队中）\n\n## 最近结束的任务\n\n- [ta] a：完成（过程从 ta#1 开始）',
  )
  expect(system).toContain('- [te] e：完成')
  expect(system).not.toContain('[tf]')
})

it('lists the other bots under their sidebar sections, empty ones too, and says which one is its own', () => {
  const brain = (id: string, name: string, purpose = '') => ({ ...bot, id, name, duty: dutyOf(purpose) })
  const team: HarnessState = {
    ...state,
    bots: { chief: bot, lead: brain('lead', '开源负责人', '管开源治理'), ops: brain('ops', '运维') },
    roster: ['chief', 'lead', 'ops'],
  }
  const sidebar: SidebarState = {
    bots: [],
    sections: [
      { id: 's1', name: '管理层', collapsed: false },
      { id: 's2', name: '产品部门', collapsed: false },
    ],
    placement: { chief: 's1', lead: 's1' },
    pinned: [],
    hidden: [],
    unread: {},
    seenAt: {},
    ungroupedCollapsed: false,
    hiddenCollapsed: true,
    dismissed: [],
  }
  expect(chatSystem(team, sidebar, bot, [], [], 5, MODELS)).toContain(
    '## 团队里的其他 Bot\n\n管理层（你在这一组）：\n- lead：开源负责人 —— 管开源治理\n\n产品部门：暂无\n\n其他：\n- ops：运维',
  )
})

it('names the flow a routine follows, and stops naming it once the flow is deleted', () => {
  const routine = { id: 'r1', name: '周报', prompt: '写周报', cron: '0 17 * * 5', timezone: 'Asia/Shanghai' }
  const flow = { id: 'f1', name: '周报汇总', when: '周五', steps: ['汇总'], notes: [], updatedAt: 1 }
  const withFlow = { ...bot, routines: [{ ...routine, isEnabled: true, flowId: 'f1' }], flows: [flow] }
  expect(chatSystem(state, null, withFlow, [], [], 5, MODELS)).toContain(
    '- [r1] 周报：0 17 * * 5（Asia/Shanghai），按流程 [f1] 周报汇总',
  )
  expect(chatSystem(state, null, { ...withFlow, flows: [] }, [], [], 5, MODELS)).toContain(
    '- [r1] 周报：0 17 * * 5（Asia/Shanghai）\n',
  )
})

it('marks a routine and a flow set to a model of their own', () => {
  const routine = { id: 'r1', name: '巡检', prompt: '看仓库', cron: '0 * * * *', timezone: 'Asia/Shanghai' }
  const flow = { id: 'f1', name: '发版说明', when: '发版前', steps: ['列 PR'], notes: [], updatedAt: 1, model: KIMI }
  const onKimi = { ...bot, routines: [{ ...routine, isEnabled: true, model: KIMI }], flows: [flow] }
  const system = chatSystem(state, null, onKimi, [], [], 5, MODELS)
  expect(system).toContain('- [r1] 巡检：0 * * * *（Asia/Shanghai），用 kimi-k2\n')
  expect(system).toContain('[f1] 发版说明（什么时候用：发版前；用 kimi-k2 做）')
})

it('tells the bot the main model, the accounts it can switch to, and to switch only when the user asks', () => {
  const system = chatSystem(state, null, bot, [], [], 5, MODELS)
  expect(system).toContain('主模型 deepseek-chat')
  expect(system).toContain('[kimi] Kimi')
  expect(system).toContain('用户在聊天里要求换模型时才换')
})

it('tells the main bot it can switch the models of the other bots', () => {
  expect(chatSystem(state, null, bot, [], [], 5, MODELS)).toContain('别的 Bot 的模型也由你来换')
})

it('tells any other bot that only the main bot can switch the models of others', () => {
  const system = chatSystem(state, null, { ...bot, id: 'secretary' }, [], [], 5, MODELS)
  expect(system).not.toContain('别的 Bot 的模型也由你来换')
})

it('tells the bot which model its chat runs on once the user had it switch', () => {
  const system = chatSystem(state, null, { ...bot, model: KIMI }, [], [], 5, { ...MODELS, chat: KIMI })
  expect(system).toContain('你聊天用 kimi-k2（用户让你换的）')
})

it('tells the bot which model its tasks run on once the user had it switch them', () => {
  const system = chatSystem(state, null, { ...bot, taskModel: KIMI }, [], [], 5, { ...MODELS, tasks: KIMI })
  expect(system).toContain('你的后台任务默认用 kimi-k2（用户让你换的')
})

it('leaves the task sections out while the bot has no tasks', () => {
  expect(chatSystem(state, null, bot, [], [], 5, MODELS)).not.toContain('任务\n\n- [')
})

it('tells the chat which local MCP servers its tasks can operate, and says nothing of MCP without any', () => {
  expect(chatSystem(state, null, bot, [], ['playwright', 'figma'], 5, MODELS)).toContain(
    'MCP 操作用户电脑上的这些软件：playwright、figma',
  )
  expect(chatSystem(state, null, bot, [], [], 5, MODELS)).not.toContain('MCP')
})

it('tells the chat its tasks can run commands, and that older memories saying otherwise are stale', () => {
  const system = chatSystem(state, null, bot, [], [], 5, MODELS)
  expect(system).toContain('后台任务有：它能用 run_command 在用户电脑上执行 shell 命令')
  expect(system).toContain('记忆或摘要里和它冲突的旧说法')
})

it('tells the chat to start a task before saying it has, and never to promise work it started no task for', () => {
  const system = chatSystem(state, null, bot, [], [], 5, MODELS)
  expect(system).toContain('先调用 start_task，拿到返回后再用一句话告诉用户你开了任务')
  expect(system).toContain('没调用 start_task 就不要说')
})

it('tells a task it cannot hand work to another bot, and to say in its result who should do what', () => {
  expect(taskSystem(state, bot, [], undefined, undefined)).toContain('你不能再开任务、派活给别的 Bot')
})

it('tells the chat to pass on work a task result says another bot should do', () => {
  expect(chatSystem(state, null, bot, [], [], 5, MODELS)).toContain(
    '结论里写了要别的 Bot 接着做的事，用 start_task 派给它',
  )
})

it('says why a recently ended task failed', () => {
  const system = chatSystem(
    state,
    null,
    bot,
    [task({ status: 'failed', failureReason: '账户余额不足' })],
    [],
    5,
    MODELS,
  )
  expect(system).toContain('- [t1] 调研：失败：账户余额不足（过程从 t1#1 开始）')
})

const revenue: MiniApp = {
  id: 'a1',
  name: '收入汇总',
  icon: 'chart',
  color: 'sky',
  versions: [
    { version: 1, change: '第一版', at: 0 },
    { version: 2, change: '加了月目标线', at: 1 },
  ],
  dataAt: null,
}

it("lists the bot's mini apps in its chat prompt with their version and last change", () => {
  const system = chatSystem(state, null, { ...bot, miniApps: [revenue] }, [], [], 5, MODELS)
  expect(system).toContain('- [a1] 收入汇总 v2（最近一版：加了月目标线）')
})

it('tells a task changing a mini app where its current page and data are', () => {
  const system = taskSystem(state, { ...bot, miniApps: [revenue] }, [], undefined, revenue)
  expect(system).toContain('## 这次要改的小程序\n\n- [a1] 收入汇总 v2：页面 apps/a1/v2.html，数据 apps/a1/data.json')
})
