// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APICallError, simulateReadableStream, tool } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { z } from 'zod'
import { createHarness } from './agent'
import type { Mcp } from './mcp'
import type { ModelChoices } from './runModel'
import { createSkills } from './skills'
import { createStore, type Store } from './store'
import { createWorkspace } from './workspace'
import { MAIN_BOT } from '../shared/bot'
import type { HarnessEvent } from '../shared/bridge'
import { DEFAULT_LIMITS, type Limits } from '../shared/limits'
import { SidebarState } from '../shared/sidebar'

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

const NO_MCP: Mcp = { configured: () => [], toolbox: async () => ({ servers: [], tools: {} }) }

/** One model step: optional text, then optional tool calls. */
function step(text?: string, calls: { name: string; input: object }[] = []) {
  const chunks = [
    { type: 'stream-start' as const, warnings: [] },
    ...(text
      ? [
          { type: 'text-start' as const, id: 't' },
          { type: 'text-delta' as const, id: 't', delta: text },
          { type: 'text-end' as const, id: 't' },
        ]
      : []),
    ...calls.map((c, i) => ({
      type: 'tool-call' as const,
      toolCallId: `c${i}`,
      toolName: c.name,
      input: JSON.stringify(c.input),
    })),
    {
      type: 'finish' as const,
      finishReason: { unified: calls.length ? ('tool-calls' as const) : ('stop' as const), raw: undefined },
      usage,
    },
  ]
  return { stream: simulateReadableStream({ chunks }) }
}

let dir: string
let events: HarnessEvent[]
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-'))
  events = []
})

function setup(
  model: MockLanguageModelV4 | null,
  limits: () => Partial<Limits> = () => ({}),
  mcp = NO_MCP,
  models = choicesOf(),
) {
  const store = createStore(path.join(dir, 'nengyongbot.db'))
  store.syncRoster([
    { id: 'chief', name: 'CEO' },
    { id: 'secretary', name: '秘书' },
  ])
  const harness = createHarness({
    store,
    workspace: createWorkspace(path.join(dir, 'library')),
    skills: createSkills({ dir: path.join(dir, 'skills'), store, emit: (e) => events.push(e) }),
    getModel: () => model,
    models,
    getApiKey: () => null,
    windowTokensOf: () => 1_000_000,
    mcp,
    emit: (e) => events.push(e),
    limits: () => ({ ...DEFAULT_LIMITS, ...limits() }),
  })
  return { store, harness }
}

const toolOutputs = (store: Store, ...names: string[]) =>
  names.flatMap((name) =>
    store.toolEntries('chief', name).flatMap((e) => (e.kind === 'tool' ? [JSON.stringify(e.output)] : [])),
  )

const systemOf = (model: MockLanguageModelV4, call: number) => {
  const sys = model.doStreamCalls[call].prompt.find((m) => m.role === 'system')
  return sys?.role === 'system' ? sys.content : ''
}

/** The accounts a bot can switch to: DeepSeek, whose model is the main one, and Kimi, with `byModel` as its models. */
function choicesOf(byModel: Record<string, MockLanguageModelV4> = {}): ModelChoices {
  return {
    accounts: () => [
      { id: 'deepseek', name: 'DeepSeek' },
      { id: 'kimi', name: 'Kimi' },
    ],
    list: async (accountId) => (accountId === 'kimi' ? ['kimi-k2', 'kimi-k2-turbo'] : ['mock-model-id']),
    of: (choice) => (choice.accountId === 'kimi' ? (byModel[choice.model] ?? null) : null),
  }
}

const KIMI = { accountId: 'kimi', model: 'kimi-k2' }

/** A model on another account that streams `steps`. */
const kimiModel = (steps = [step('Kimi 的回复')]) => new MockLanguageModelV4({ modelId: 'kimi-k2', doStream: steps })

/** A model whose server refuses the connection, as a local one that is not running does. */
const unreachableModel = () =>
  new MockLanguageModelV4({
    modelId: 'kimi-k2',
    doStream: async () => {
      throw new APICallError({
        message: 'Cannot connect to API: ',
        url: 'http://127.0.0.1:1234/v1/chat/completions',
        requestBodyValues: {},
        isRetryable: true,
      })
    },
  })

const missingModel = () =>
  new MockLanguageModelV4({
    modelId: 'kimi-k2',
    doStream: async () => {
      throw new APICallError({
        message: "Model 'kimi-k2' not found. Available models: qwen3",
        url: 'http://127.0.0.1:8000/v1/chat/completions',
        requestBodyValues: {},
        statusCode: 404,
        isRetryable: false,
      })
    },
  })

type ModelReply = Awaited<ReturnType<MockLanguageModelV4['doStream']>>

/** A model call that streams `text`, then sends nothing more until it is aborted, as a provider that hangs does. */
function stalled(abortSignal: AbortSignal | undefined, text?: string): ModelReply {
  const stream: ModelReply['stream'] = new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] })
      if (text) {
        controller.enqueue({ type: 'text-start', id: 't' })
        controller.enqueue({ type: 'text-delta', id: 't', delta: text })
      }
      abortSignal?.addEventListener('abort', () => controller.error(abortSignal.reason))
    },
  })
  return { stream }
}

const RELEASE_FLOW = {
  id: 'f1',
  name: '发版说明',
  when: '准备发版时',
  steps: ['列出合并的 PR', '分组改写成用户看得懂的话'],
  notes: ['贴之前先给用户看'],
  updatedAt: 1,
}
const withFlow = (store: Store) => store.updateBot('chief', { flows: [RELEASE_FLOW] })

describe('harness turn', () => {
  it('saves attachments into the library under their own names and shows the model the image', async () => {
    const model = new MockLanguageModelV4({ doStream: [step('是一只猫。')] })
    const { store, harness } = setup(model)
    await harness.send('chief', '这是什么', [
      { name: '../猫 1.png', data: new Uint8Array([7, 8]) },
      { name: '../猫 1.png', data: new Uint8Array([9]) },
    ])

    const [entry] = store.history('chief')
    const attachments = entry.kind === 'user' ? (entry.attachments ?? []) : []
    expect(attachments).toEqual([
      expect.stringMatching(/^uploads\/\w+\/猫 1\.png$/),
      expect.stringMatching(/猫 1\.png$/),
    ])
    expect(new Set(attachments).size).toBe(2)
    expect([...fs.readFileSync(path.join(dir, 'library', attachments[0]))]).toEqual([7, 8])
    const user = model.doStreamCalls[0].prompt.find((message) => message.role === 'user')
    const images = user?.role === 'user' ? user.content.filter((part) => part.type === 'file') : []
    expect(images.map((part) => part.mediaType)).toEqual(['image/png', 'image/png'])
  })

  it('creates a bot via tool call and streams each paragraph as its own message', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step('我来创建一个点子收集箱。', [
          { name: 'create_bot', input: { name: '点子收集箱', instructions: '记录点子，不执行' } },
        ]),
        step('已创建。'),
      ],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '给我建一个记录流程想法的 bot')

    const created = events.find((e) => e.kind === 'bot-created')
    expect(created?.kind === 'bot-created' && created.bot.name).toBe('点子收集箱')
    const id = created?.kind === 'bot-created' ? created.bot.id : ''
    expect(id).toMatch(/^b[0-9a-z]{1,16}$/)
    expect(store.get().roster).toContain(id)
    expect(store.get().bots[id].instructions).toBe('记录点子，不执行')
    expect(store.history('chief').map((e) => e.kind)).toEqual(['user', 'bot', 'bot'])
    expect(store.toolEntries('chief', 'create_bot')).toHaveLength(1)
    expect(events.filter((e) => e.kind === 'busy').map((e) => e.kind === 'busy' && e.busy)).toEqual([true, false])
  })

  it('creates a bot into the sidebar section named, and creates nothing for a section that does not exist', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [
          { name: 'create_bot', input: { name: '开源负责人', instructions: '管开源', section: '管理层' } },
        ]),
        step(undefined, [{ name: 'create_bot', input: { name: '多余', instructions: '不该建', section: '董事会' } }]),
        step('好了。'),
      ],
    })
    const { store, harness } = setup(model)
    store.saveSidebar(SidebarState.parse({ bots: [MAIN_BOT], sections: [{ id: 's1', name: '管理层' }] }))
    await harness.send('chief', '建一个开源负责人，放到管理层')

    expect(systemOf(model, 0)).toContain('管理层：暂无')
    const created = events.flatMap((e) => (e.kind === 'bot-created' ? [e.bot] : []))
    expect(created).toEqual([expect.objectContaining({ name: '开源负责人', sectionId: 's1' })])
    expect(store.get().pending).toEqual(created) // a sidebar that missed the event still gets the section
    expect(toolOutputs(store, 'create_bot')).toEqual([
      expect.stringContaining('"section":"管理层"'),
      expect.stringContaining('没有叫「董事会」的分组，现有分组：管理层'),
    ])
  })

  it('lists every bot with the level its chat has earned, highest first', async () => {
    const model = new MockLanguageModelV4({
      doStream: [step(undefined, [{ name: 'list_bot_levels', input: {} }]), step('秘书等级最高。')],
    })
    const { store, harness } = setup(model)
    for (let index = 0; index < 25; index++) store.append('secretary', { kind: 'user', text: '在吗' })
    await harness.send('chief', '谁的等级最高')

    const [output] = store.toolEntries('chief', 'list_bot_levels')
    expect(output?.kind === 'tool' && output.output).toEqual([
      expect.objectContaining({ mention: '[秘书](bot:secretary)', level: 2, tier: '初识', messages: 25 }),
      expect.objectContaining({ mention: '[CEO](bot:chief)', level: 1, messages: 1 }),
    ])
  })

  it('renames itself via tool call and tells the sidebar', async () => {
    const model = new MockLanguageModelV4({
      doStream: [step(undefined, [{ name: 'update_my_name', input: { name: ' 灵感记录 Bot ' } }]), step('改好了。')],
    })
    const { store, harness } = setup(model)
    await harness.send('secretary', '你的名字改一下')

    expect(store.get().bots.secretary.name).toBe('灵感记录 Bot')
    expect(events).toContainEqual({ kind: 'bot-renamed', botId: 'secretary', name: '灵感记录 Bot' })
  })

  it('remembers a user fact and shows it to every bot in later turns', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [{ name: 'remember', input: { text: '用户偏好北京时间', scope: 'user' } }]),
        step('记住了。'),
        step('好的。'),
      ],
    })
    const { harness } = setup(model)
    await harness.send('chief', '以后按北京时间安排')
    await harness.send('secretary', '明早提醒我开会')
    expect(systemOf(model, 2)).toContain('用户偏好北京时间')
  })

  it('records the message a reply quotes and shows the model the quote with its ref', async () => {
    const model = new MockLanguageModelV4({ doStream: [step('三件事。'), step('第一件是发布。')] })
    const { store, harness } = setup(model)
    await harness.send('chief', '今天要做什么')
    await harness.send('chief', '第一件呢', [], 2)

    const reply = store.history('chief').at(-2)
    expect(reply?.kind === 'user' && reply.quote).toEqual({ seq: 2, text: '三件事。' })
    const lastUser = model.doStreamCalls[1].prompt.filter((message) => message.role === 'user').at(-1)
    const content = lastUser?.role === 'user' ? lastUser.content : []
    expect(content).toEqual([
      { type: 'text', text: '（用户在回复 chief#2 这条消息，它的开头是：「三件事。」）\n第一件呢' },
    ])
  })

  it('refuses to quote a message that is not in this chat, and records nothing', async () => {
    const { store, harness } = setup(new MockLanguageModelV4({ doStream: [step('好。')] }))
    expect(() => harness.send('chief', '这条呢', [], 9)).toThrow('要回复的那条消息不在这段聊天里')
    expect(store.history('chief')).toEqual([])
  })

  it("records the API's response id on each paragraph it streams, and none when the API gives none", async () => {
    const withId = {
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start' as const, warnings: [] },
          { type: 'raw' as const, rawValue: { id: 'chatcmpl-42', choices: [] } },
          { type: 'text-start' as const, id: 't' },
          { type: 'text-delta' as const, id: 't', delta: '好的。' },
          { type: 'text-end' as const, id: 't' },
          { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, usage },
        ],
      }),
    }
    const { store, harness } = setup(new MockLanguageModelV4({ doStream: [withId, step('收到。')] }))
    await harness.send('chief', '在吗')
    await harness.send('chief', '还在吗')

    const replies = store.history('chief').filter((entry) => entry.kind === 'bot')
    expect(replies.map((entry) => entry.kind === 'bot' && entry.requestId)).toEqual(['chatcmpl-42', undefined])
  })

  it('records on each reply the model that wrote it', async () => {
    const { store, harness } = setup(new MockLanguageModelV4({ modelId: 'deepseek-flash', doStream: [step('在。')] }))
    await harness.send('chief', '在吗')
    expect(store.history('chief').at(-1)).toMatchObject({ kind: 'bot', model: 'deepseek-flash' })
  })

  it('records why a tool call failed, so the model can read the reason', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [
          { name: 'forget', input: { id: 'u-missing' } },
          { name: 'create_bot', input: { name: '   ', instructions: '没有名字' } },
          { name: 'read_history', input: { ref: 'chief#999' } },
          { name: 'read_history', input: { ref: 'ghost#1' } },
          { name: 'read_history', input: { ref: 'chief 12' } },
        ]),
        step('没成功。'),
      ],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '忘掉那条')
    const outputs = toolOutputs(store, 'forget', 'create_bot', 'read_history')
    // a rejected input is recorded before the tools that ran, so the order is not the call order
    expect(outputs).toHaveLength(5)
    expect(outputs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('没有 id 为 u-missing 的记忆'),
        expect.stringContaining('Invalid input for tool create_bot'), // a blank name is refused before the bot exists
        expect.stringContaining('没有这条记录：chief#999'),
        expect.stringContaining('没有 id 为 ghost 的 Bot'),
        expect.stringContaining('ref 形如 chief#12'),
      ]),
    )
  })

  it('creates a routine, then pauses it in a later turn, telling the panel each time', async () => {
    const create = new MockLanguageModelV4({
      doStream: [
        step(undefined, [
          {
            name: 'create_routine',
            input: { name: '日报', prompt: '写日报', cron: '0 8 * * *', timezone: 'Asia/Shanghai' },
          },
        ]),
        step('建好了。'),
      ],
    })
    const { store, harness } = setup(create)
    await harness.send('chief', '每天 8 点写日报')
    const [routine] = store.get().bots.chief.routines
    expect(routine).toMatchObject({ name: '日报', cron: '0 8 * * *', timezone: 'Asia/Shanghai', isEnabled: true })

    const pause = new MockLanguageModelV4({
      doStream: [
        step(undefined, [
          { name: 'set_routine_enabled', input: { id: routine.id, isEnabled: false } },
          { name: 'delete_routine', input: { id: 'r-missing' } },
        ]),
        step('暂停了。'),
      ],
    })
    const later = createHarness({
      store,
      workspace: createWorkspace(path.join(dir, 'library')),
      skills: createSkills({ dir: path.join(dir, 'skills'), store, emit: () => {} }),
      getModel: () => pause,
      models: choicesOf(),
      getApiKey: () => null,
      windowTokensOf: () => 1_000_000,
      mcp: NO_MCP,
      emit: (e) => events.push(e),
      limits: () => DEFAULT_LIMITS,
    })
    await later.send('chief', '先暂停')
    expect(systemOf(pause, 0)).toContain(`[${routine.id}] 日报：0 8 * * *（Asia/Shanghai）`)
    expect(store.get().bots.chief.routines[0].isEnabled).toBe(false)
    const panelUpdates = events.flatMap((e) => (e.kind === 'routines' ? [e.routines.map((r) => r.isEnabled)] : []))
    expect(panelUpdates).toEqual([[true], [false]])
    const outputs = toolOutputs(store, 'delete_routine')
    expect(outputs.some((output) => output.includes('没有 id 为 r-missing 的例行任务'))).toBe(true)
  })

  it('saves a flow the user agreed to, tells the panel, and shows its steps to later turns', async () => {
    const input = {
      name: '发版说明',
      when: '准备发版时',
      steps: ['列出上个 tag 以来合并的 PR', '按新功能、修复、其他分组'],
      notes: ['贴到 Release 之前先给用户看'],
    }
    const model = new MockLanguageModelV4({
      doStream: [step(undefined, [{ name: 'save_flow', input }]), step('存好了。'), step('好的。')],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '以后都这么弄')
    const [flow] = store.get().bots.chief.flows
    expect(flow).toMatchObject(input)
    expect(toolOutputs(store, 'save_flow')).toEqual([expect.stringContaining(`[发版说明](flow:${flow.id})`)])
    expect(events).toContainEqual({ kind: 'flows', botId: 'chief', flows: [flow] })

    await harness.send('chief', '下周发版')
    expect(systemOf(model, 2)).toContain(`[${flow.id}] 发版说明（什么时候用：准备发版时）`)
    expect(systemOf(model, 2)).toContain('1. 列出上个 tag 以来合并的 PR')
    expect(systemOf(model, 2)).toContain('注意：贴到 Release 之前先给用户看')
  })

  it('rewrites a flow by its id, and refuses an id it does not have or a rewrite that leaves out the notes', async () => {
    const steps = ['列出合并的 PR', '草稿先发给用户确认']
    const notes = ['贴之前先给用户看', '不超过 20 条']
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [
          { name: 'save_flow', input: { id: 'f1', name: '发版说明', when: '准备发版时', steps } },
          { name: 'save_flow', input: { id: 'f1', name: '发版说明', when: '准备发版时', steps, notes } },
          { name: 'save_flow', input: { id: 'f-missing', name: '周报', when: '周五', steps: ['汇总'], notes: [] } },
        ]),
        step('改好了。'),
      ],
    })
    const { store, harness } = setup(model)
    withFlow(store)
    await harness.send('chief', '以后草稿先给我看')
    const [flow] = store.get().bots.chief.flows
    expect(store.get().bots.chief.flows).toHaveLength(1)
    expect(flow).toMatchObject({ id: 'f1', steps, notes })
    expect(flow.updatedAt).toBeGreaterThan(1)
    const outputs = toolOutputs(store, 'save_flow')
    expect(outputs.some((output) => output.includes('notes'))).toBe(true)
    expect(outputs.some((output) => output.includes('没有 id 为 f-missing 的流程'))).toBe(true)
  })

  it('takes an empty id as a new flow, never storing one without an id', async () => {
    const input = { id: '', name: '周报', when: '周五', steps: ['汇总'], notes: [] }
    const model = new MockLanguageModelV4({
      doStream: [step(undefined, [{ name: 'save_flow', input }]), step(undefined, [{ name: 'save_flow', input }])],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '存两次')
    const ids = store.get().bots.chief.flows.map((flow) => flow.id)
    expect(ids).toHaveLength(2)
    expect(ids.every((id) => id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(2)
  })

  it('refuses flows past their total length, which goes into every system prompt', async () => {
    const long = (n: number) => `${n}${'很长的一步'.repeat(58)}`
    const input = (n: number) => ({ name: `流程${n}`, when: '随时', steps: [1, 2, 3, 4, 5, 6].map(long), notes: [] })
    const saves = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ name: 'save_flow', input: input(n) }))
    const model = new MockLanguageModelV4({ doStream: [step(undefined, saves), step('存不下了。')] })
    const { store, harness } = setup(model)
    await harness.send('chief', '全存上')
    const outputs = toolOutputs(store, 'save_flow')
    expect(outputs.some((output) => output.includes('流程加起来超过'))).toBe(true)
    const chars = store.get().bots.chief.flows.flatMap((flow) => [flow.name, flow.when, ...flow.steps, ...flow.notes])
    expect(chars.join('').length).toBeLessThanOrEqual(20_000)
  })

  it('refuses a new flow past the limit, and deletes a flow it no longer needs', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [
          { name: 'save_flow', input: { name: '周报', when: '周五', steps: ['汇总'], notes: [] } },
          { name: 'delete_flow', input: { id: 'f1' } },
        ]),
        step('好了。'),
      ],
    })
    const { store, harness } = setup(model, () => ({ maxFlows: 1 }))
    withFlow(store)
    await harness.send('chief', '周报也存一个，发版那个不要了')
    expect(toolOutputs(store, 'save_flow')).toEqual([expect.stringContaining('最多 1 个流程')])
    expect(store.get().bots.chief.flows).toEqual([])
  })

  it('refuses to delete a flow a routine follows, saying what to do instead', async () => {
    const model = new MockLanguageModelV4({
      doStream: [step(undefined, [{ name: 'delete_flow', input: { id: 'f1' } }]), step('删不了。')],
    })
    const { store, harness } = setup(model)
    withFlow(store)
    store.updateBot('chief', {
      routines: [
        {
          id: 'r1',
          name: '周五发版',
          prompt: '整理',
          cron: '0 9 * * 5',
          timezone: 'Asia/Shanghai',
          isEnabled: true,
          flowId: 'f1',
        },
      ],
    })
    await harness.send('chief', '发版流程不要了')
    expect(toolOutputs(store, 'delete_flow')).toEqual([expect.stringContaining('例行任务「周五发版」[r1]')])
    expect(store.get().bots.chief.flows).toHaveLength(1)
  })

  it('creates a routine that runs by one of its flows, and refuses a flow it does not have', async () => {
    const routine = { name: '发版说明', prompt: '整理本周发版说明', cron: '0 9 * * 5', timezone: 'Asia/Shanghai' }
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [
          { name: 'create_routine', input: { ...routine, flowId: 'f1' } },
          { name: 'create_routine', input: { ...routine, flowId: 'f-missing' } },
        ]),
        step('建好了。'),
      ],
    })
    const { store, harness } = setup(model)
    withFlow(store)
    await harness.send('chief', '每周五按发版流程整理')
    expect(store.get().bots.chief.routines).toMatchObject([{ name: '发版说明', flowId: 'f1' }])
    expect(toolOutputs(store, 'create_routine').some((output) => output.includes('没有 id 为 f-missing 的流程'))).toBe(
      true,
    )
  })

  it('hooks an existing routine onto one of its flows, telling the panel, and refuses a flow it does not have', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [
          { name: 'set_routine_flow', input: { id: 'r1', flowId: 'f1' } },
          { name: 'set_routine_flow', input: { id: 'r1', flowId: 'f-missing' } },
        ]),
        step('挂好了。'),
      ],
    })
    const { store, harness } = setup(model)
    withFlow(store)
    store.updateBot('chief', {
      routines: [
        { id: 'r1', name: '周五发版', prompt: '整理', cron: '0 9 * * 5', timezone: 'Asia/Shanghai', isEnabled: true },
      ],
    })
    await harness.send('chief', '周五发版按发版流程做')
    expect(store.get().bots.chief.routines).toMatchObject([{ id: 'r1', flowId: 'f1' }])
    expect(events).toContainEqual({
      kind: 'routines',
      botId: 'chief',
      routines: [expect.objectContaining({ flowId: 'f1' })],
    })
    expect(
      toolOutputs(store, 'set_routine_flow').some((output) => output.includes('没有 id 为 f-missing 的流程')),
    ).toBe(true)
  })

  /** A model whose first turn waits until `release` is called, so messages can arrive while it runs. */
  function holdFirstTurn() {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const model = new MockLanguageModelV4({
      doStream: async () => {
        calls += 1
        if (calls > 1) return step('B 和 C 一起回答')
        await held
        return step('A 的回答')
      },
    })
    const isBusy = () => expect(events).toContainEqual(expect.objectContaining({ kind: 'busy', busy: true }))
    return { model, release, isBusy }
  }

  it('answers the messages that arrived during a turn together, in one next turn', async () => {
    const { model, release, isBusy } = holdFirstTurn()
    const { store, harness } = setup(model)
    const first = harness.send('chief', 'A')
    await vi.waitFor(isBusy)
    const later = [harness.send('chief', 'B'), harness.send('chief', 'C')]
    release()
    await Promise.all([first, ...later])
    expect(model.doStreamCalls).toHaveLength(2)
    expect(store.history('chief').map((e) => ('text' in e ? e.text : ''))).toEqual([
      'A',
      'A 的回答',
      'B',
      'C',
      'B 和 C 一起回答',
    ])
  })

  it('shows messages that arrive during a turn as queued until the next turn reads them', async () => {
    const { model, release, isBusy } = holdFirstTurn()
    const { harness } = setup(model)
    const first = harness.send('chief', 'A')
    await vi.waitFor(isBusy)
    const later = [harness.send('chief', 'B'), harness.send('chief', 'C')]
    release()
    await Promise.all([first, ...later])
    const queued = events.flatMap((e) => (e.kind === 'queued' ? [e.texts] : []))
    expect(queued).toEqual([['B'], ['B', 'C'], []])
    const cleared = events.findIndex((e) => e.kind === 'queued' && e.texts.length === 0)
    const recorded = events.findIndex((e) => e.kind === 'entry' && e.entry.kind === 'user' && e.entry.text === 'B')
    expect(cleared).toBeLessThan(recorded) // the queued bubble gives way to the recorded message, never both at once
  })

  /** The run ids of the chat turns started so far, oldest first. */
  const startedRuns = () => events.flatMap((e) => (e.kind === 'busy' && e.busy ? [e.runId] : []))

  it('stops a reply the user stops, keeping what it wrote so far, without an error', async () => {
    const model = new MockLanguageModelV4({ doStream: async ({ abortSignal }) => stalled(abortSignal, '写到一半') })
    const { store, harness } = setup(model)
    const reply = harness.send('chief', '写首长诗')
    await vi.waitFor(() => expect(events).toContainEqual({ kind: 'draft', botId: 'chief', text: '写到一半' }))
    harness.stopReply('chief', startedRuns()[0])
    await reply
    expect(store.history('chief').at(-1)).toMatchObject({ kind: 'bot', text: '写到一半' })
    expect(events.filter((e) => e.kind === 'error')).toEqual([])
    expect(events.filter((e) => e.kind === 'busy').at(-1)).toMatchObject({ busy: false })
  })

  it('answers the messages queued behind a stopped reply in the next turn', async () => {
    let isFirst = true
    const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => {
        if (!isFirst) return step('B 的回答')
        isFirst = false
        return stalled(abortSignal)
      },
    })
    const { store, harness } = setup(model)
    const first = harness.send('chief', 'A')
    await vi.waitFor(() => expect(model.doStreamCalls).toHaveLength(1))
    const later = harness.send('chief', 'B')
    harness.stopReply('chief', startedRuns()[0])
    await Promise.all([first, later])
    expect(store.history('chief').map((e) => ('text' in e ? e.text : ''))).toEqual(['A', 'B', 'B 的回答'])
  })

  it('leaves the next turn running when a stop meant for the one before it comes late', async () => {
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let isFirst = true
    const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => {
        if (!isFirst) return released.then(() => step('B 的回答'))
        isFirst = false
        return stalled(abortSignal)
      },
    })
    const { store, harness } = setup(model)
    const first = harness.send('chief', 'A')
    await vi.waitFor(() => expect(model.doStreamCalls).toHaveLength(1))
    const later = harness.send('chief', 'B')
    const [firstRun] = startedRuns()
    harness.stopReply('chief', firstRun)
    await vi.waitFor(() => expect(model.doStreamCalls).toHaveLength(2))
    harness.stopReply('chief', firstRun)
    release()
    await Promise.all([first, later])
    expect(store.history('chief').at(-1)).toMatchObject({ kind: 'bot', text: 'B 的回答' })
  })

  it('records the result of a tool call under way before stopping, and starts no further step', async () => {
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const model = new MockLanguageModelV4({
      doStream: async () =>
        model.doStreamCalls.length === 1
          ? step(undefined, [{ name: 'list_models', input: { accountId: 'kimi' } }])
          : step('停了以后不该说的话'),
    })
    const slowList: ModelChoices = { ...choicesOf(), list: () => released.then(() => ['kimi-k2']) }
    const { store, harness } = setup(model, () => ({}), NO_MCP, slowList)
    const reply = harness.send('chief', '有哪些模型')
    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({ kind: 'activity' })))
    harness.stopReply('chief', startedRuns()[0])
    release()
    await reply
    expect(toolOutputs(store, 'list_models')).toEqual([JSON.stringify({ models: ['kimi-k2'] })])
    expect(JSON.stringify(store.history('chief'))).not.toContain('停了以后不该说的话')
  })

  it('ends a reply whose model goes silent mid-answer with an error, instead of waiting forever', async () => {
    const model = new MockLanguageModelV4({ doStream: async ({ abortSignal }) => stalled(abortSignal, '写到一半') })
    const { harness } = setup(model, () => ({ modelSilenceSeconds: 0.05 }))
    await harness.send('chief', '写首长诗')
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'error', message: expect.stringContaining('没有回应') }),
    )
  })

  it('finds an old message by keyword and opens it with the conversation around it', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [{ name: 'search_history', input: { query: '周报格式' } }]),
        step(undefined, [{ name: 'read_history', input: { ref: 'chief#3', around: 1 } }]),
        step('找到了。'),
      ],
    })
    const { store, harness } = setup(model)
    for (const text of ['早', '早上好', '周报格式定成三段', '好的，按三段写', '谢谢'])
      store.append('chief', { kind: 'user', text })
    await harness.send('chief', '上次周报格式怎么定的？')
    const [found] = toolOutputs(store, 'search_history')
    expect(found).toContain('"ref":"chief#3"')
    const [opened] = toolOutputs(store, 'read_history')
    expect(opened).toContain('早上好')
    expect(opened).toContain('好的，按三段写')
    expect(opened).not.toContain('谢谢')
    expect(opened).toContain('"ref":"chief#4"')
  })

  it('finds the latest matches across all bots, not only those of the bot listed last', async () => {
    const model = new MockLanguageModelV4({
      doStream: [step(undefined, [{ name: 'search_history', input: { query: '周报' } }]), step('找到了。')],
    })
    const { store, harness } = setup(model)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    for (let n = 1; n <= 20; n++) store.append('secretary', { kind: 'user', text: `周报 ${n}` })
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
    store.append('chief', { kind: 'user', text: '新的周报' })
    vi.useRealTimers()
    await harness.send('chief', '上次的周报呢？')
    const [found] = toolOutputs(store, 'search_history')
    expect(found).toContain('"ref":"chief#1"')
    expect(found).not.toContain('"ref":"secretary#1"')
  })

  it('shows the tool calls inside an opened stretch of history as one-line notes, not their full output', async () => {
    const model = new MockLanguageModelV4({
      doStream: [step(undefined, [{ name: 'read_history', input: { ref: 'chief#1', around: 3 } }]), step('看到了。')],
    })
    const { store, harness } = setup(model)
    store.append('chief', { kind: 'user', text: '读一下那个网页' })
    store.append('chief', {
      kind: 'tool',
      name: 'fetch_url',
      input: { url: 'https://a.example' },
      output: 'x'.repeat(500),
    })
    store.append('chief', {
      kind: 'tool',
      name: 'forget',
      input: { id: 'u1' },
      output: { error: '没有 id 为 u1 的记忆' },
    })
    store.append('chief', { kind: 'bot', text: '读完了' })
    await harness.send('chief', '刚才你真的读了吗？')
    const [opened] = toolOutputs(store, 'read_history')
    expect(opened).toContain('"ref":"chief#2"')
    expect(opened).toContain('调用了 fetch_url')
    expect(opened).toContain('当时拿到了 500 字的结果（这里不再重复原文）')
    expect(opened).toContain('调用 forget 失败')
    expect(opened).not.toContain('x'.repeat(100))
  })

  it('opens a long message one window at a time, keeping the messages around it to a short preview', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [{ name: 'read_history', input: { ref: 'chief#2', around: 1 } }]),
        step(undefined, [{ name: 'read_history', input: { ref: 'chief#2', around: 0, offset: 20_000 } }]),
        step('读完了。'),
      ],
    })
    const { store, harness } = setup(model)
    store.append('chief', { kind: 'user', text: 'b'.repeat(500) })
    store.append('chief', { kind: 'user', text: 'a'.repeat(25_000) })
    store.append('chief', { kind: 'bot', text: '收到' })
    await harness.send('chief', '再看看那段日志')
    const [first, second] = toolOutputs(store, 'read_history')
    expect(first).toContain('用 offset=20000 再读')
    expect(first).toContain('共 500 字，打开这条的 ref 看全文')
    expect(first).not.toContain('b'.repeat(301))
    expect(second).toContain('已到结尾')
  })

  it("opens a stretch of a task's transcript, naming the bot the task ran as", async () => {
    const model = new MockLanguageModelV4({
      doStream: [step(undefined, [{ name: 'read_history', input: { ref: 't1#2', around: 1 } }]), step('看到了。')],
    })
    const { store, harness } = setup(model)
    store.saveTask({
      id: 't1',
      botId: 'secretary',
      requestedBy: 'chief',
      source: { kind: 'chat' },
      title: '查日程',
      status: 'done',
      statusText: '',
      createdAt: 1,
    })
    store.append('t1', { kind: 'from-bot', from: 'chief', text: '查明天的日程' })
    store.append('t1', { kind: 'bot', text: '明天 10 点开会' })
    await harness.send('chief', '那个任务查到什么了？')
    const [opened] = toolOutputs(store, 'read_history')
    expect(opened).toContain('"ref":"t1#1","who":"委托自 CEO"')
    expect(opened).toContain('"ref":"t1#2","who":"秘书"')
  })

  it('reminds the model of the tools it called in earlier turns, one line each, without their output', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [{ name: 'search_history', input: { query: '周报' } }]),
        step('找到了。'),
        step('刚才查了历史。'),
      ],
    })
    const { store, harness } = setup(model)
    store.append('chief', { kind: 'user', text: `周报${'z'.repeat(500)}` })
    await harness.send('chief', '找一下周报')
    await harness.send('chief', '你刚才真的查了吗？')
    const later = JSON.stringify(model.doStreamCalls[2].prompt)
    expect(later).toContain('系统记录，不是用户发的')
    expect(later).toContain('调用了 search_history')
    expect(later).toContain('字的结果（这里不再重复原文）')
    expect(later).not.toContain('打开这条的 ref 看全文')
  })

  it('reports an error when the model stream ends without finishing, instead of staying silent', async () => {
    const interrupted = {
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start' as const, warnings: [] },
          { type: 'finish' as const, finishReason: { unified: 'interrupted' as const, raw: undefined }, usage },
        ],
      }),
    }
    const { harness } = setup(new MockLanguageModelV4({ doStream: [interrupted] }))
    await harness.send('chief', '你都会些什么？')
    expect(events).toContainEqual(expect.objectContaining({ kind: 'error', message: expect.stringContaining('/v1') }))
  })

  it('asks for a key and records nothing when there is no model', async () => {
    const { store, harness } = setup(null)
    await harness.send('chief', 'hi')
    expect(events).toContainEqual(expect.objectContaining({ kind: 'error', code: 'no-key' }))
    expect(store.history('chief')).toEqual([])
  })

  it('folds old turns into a summary once the transcript grows', async () => {
    const model = new MockLanguageModelV4({
      doStream: [step('ok')],
      doGenerate: {
        content: [{ type: 'text', text: '摘要：用户在做开源项目' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage,
        warnings: [],
      },
    })
    const { store, harness } = setup(model)
    for (let i = 0; i < 170; i++) store.append('chief', { kind: i % 2 ? 'bot' : 'user', text: `msg ${i}` })
    await harness.send('chief', '继续')
    expect(store.get().bots.chief.summary).toBe('摘要：用户在做开源项目')
    expect(systemOf(model, 0)).toContain('摘要：用户在做开源项目')
    expect(model.doStreamCalls[0].prompt.filter((m) => m.role !== 'system').length).toBe(80)
  })

  it('records every model call of a turn, its summary included, as one run on the model with the tokens the API counted', async () => {
    const model = new MockLanguageModelV4({
      doStream: [step(undefined, [{ name: 'update_my_name', input: { name: '新名字' } }]), step('好了')],
      doGenerate: {
        content: [{ type: 'text', text: '摘要' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage,
        warnings: [],
      },
    })
    const { store, harness } = setup(model)
    for (let i = 0; i < 170; i++) store.append('chief', { kind: i % 2 ? 'bot' : 'user', text: `msg ${i}` })
    await harness.send('chief', '继续')
    expect(store.usageRuns(0)).toEqual([
      expect.objectContaining({ transcriptId: 'chief', botId: 'chief', model: 'mock-model-id', input: 3, output: 3 }),
    ])
  })

  it('names the chat as the session of every model call of its turns, since OpenCode Go refuses calls without one', async () => {
    const model = new MockLanguageModelV4({
      doStream: [step('ok')],
      doGenerate: {
        content: [{ type: 'text', text: '摘要' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage,
        warnings: [],
      },
    })
    const { store, harness } = setup(model)
    for (let i = 0; i < 170; i++) store.append('chief', { kind: i % 2 ? 'bot' : 'user', text: `msg ${i}` })
    await harness.send('chief', '继续')
    const calls = [...model.doGenerateCalls, ...model.doStreamCalls]
    expect(calls).toHaveLength(2)
    expect(calls.map((call) => call.headers?.['x-opencode-session'])).toEqual(['chief', 'chief'])
  })

  it('counts tool records toward the recent window set in the limits and folds them into the summary as one-line notes', async () => {
    const model = new MockLanguageModelV4({
      doStream: [step('ok')],
      doGenerate: {
        content: [{ type: 'text', text: '摘要' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage,
        warnings: [],
      },
    })
    const { store, harness } = setup(model, () => ({ recentEntries: 40 }))
    for (let i = 0; i < 30; i++) {
      store.append('chief', { kind: 'user', text: `问 ${i}` })
      store.append('chief', { kind: 'tool', name: 'read_file', input: { path: 'a.md' }, output: 'q'.repeat(50) })
      store.append('chief', { kind: 'bot', text: `答 ${i}` })
    }
    await harness.send('chief', '继续')
    expect(model.doStreamCalls[0].prompt.filter((m) => m.role !== 'system').length).toBe(40)
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain('工具：调用了 read_file')
  })
})

describe('background tasks', () => {
  type Scripted = (abortSignal: AbortSignal | undefined) => ModelReply | Promise<ModelReply>
  const TASK_MARKER = '你正在后台执行一个任务'
  type Prompt = MockLanguageModelV4['doStreamCalls'][number]['prompt']
  const isTaskCall = (prompt: Prompt) =>
    prompt.some((message) => message.role === 'system' && message.content.includes(TASK_MARKER))

  /** One model for the chat and its tasks: each call takes the next step of its own script; a used-up script says 好的。 */
  function scriptedModel(script: { chat: Scripted[]; task: Scripted[] }) {
    return new MockLanguageModelV4({
      doStream: async (options) => {
        const next = (isTaskCall(options.prompt) ? script.task : script.chat).shift()
        return next ? next(options.abortSignal) : step('好的。')
      },
    })
  }
  const now =
    (text?: string, calls: { name: string; input: object }[] = []): Scripted =>
    () =>
      step(text, calls)
  function gate() {
    let open = () => {}
    const opened = new Promise<void>((resolve) => {
      open = resolve
    })
    const held =
      (text: string): Scripted =>
      async () => {
        await opened
        return step(text)
      }
    return { open, held }
  }
  const withRoutine = (store: Store, isEnabled: boolean, flowId?: string) =>
    store.update((s) => ({
      ...s,
      bots: {
        ...s.bots,
        chief: {
          ...s.bots.chief,
          routines: [
            {
              id: 'r1',
              name: '日报',
              prompt: '写日报',
              cron: '0 8 * * *',
              timezone: 'Asia/Shanghai',
              isEnabled,
              flowId,
            },
          ],
        },
      },
    }))
  const startTask = (title: string, brief = `做${title}`) => ({ name: 'start_task', input: { title, brief } })
  const taskCalls = (model: MockLanguageModelV4) => model.doStreamCalls.filter((call) => isTaskCall(call.prompt))
  const chatCalls = (model: MockLanguageModelV4) => model.doStreamCalls.filter((call) => !isTaskCall(call.prompt))
  const kinds = (store: Store) => store.history('chief').map((entry) => entry.kind)
  const reported = (store: Store) => vi.waitFor(() => expect(kinds(store).slice(-2)).toEqual(['task-result', 'bot']))
  const userText = (call: MockLanguageModelV4['doStreamCalls'][number]) =>
    JSON.stringify(call.prompt.filter((message) => message.role === 'user'))

  it('replies right after starting a task, before the task ends', async () => {
    const task = gate()
    const model = scriptedModel({
      chat: [now(undefined, [startTask('日报')]), now('开了任务，做完告诉你。')],
      task: [task.held('日报写好了')],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '写份日报')
    expect(store.history('chief').at(-1)).toMatchObject({ kind: 'bot', text: '开了任务，做完告诉你。' })
    expect(store.tasksOf('chief', 10)).toMatchObject([{ title: '日报', status: 'running' }])
    task.open()
    await reported(store)
  })

  it('hands the conclusion back to the chat, where the bot reports it in a turn of its own', async () => {
    const model = scriptedModel({
      chat: [now(undefined, [startTask('日报')]), now('开了。'), now('日报写好了，要点三条。')],
      task: [now('日报：三件事')],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '写份日报')
    await reported(store)
    expect(store.history('chief').at(-2)).toMatchObject({ kind: 'task-result', status: 'done', text: '日报：三件事' })
    expect(userText(chatCalls(model)[2])).toContain('任务「日报」')
    expect(userText(chatCalls(model)[2])).toContain('日报：三件事')
    expect(store.tasksOf('chief', 10)).toMatchObject([{ status: 'done' }])
  })

  it('answers the user while a task is still running', async () => {
    const task = gate()
    const model = scriptedModel({
      chat: [now(undefined, [startTask('调研')]), now('开了。'), now('10 点开会。')],
      task: [task.held('调研完了')],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '调研五个仓库')
    await harness.send('chief', '明天几点开会？')
    expect(store.history('chief').at(-1)).toMatchObject({ kind: 'bot', text: '10 点开会。' })
    expect(store.tasksOf('chief', 10)).toMatchObject([{ status: 'running' }])
    task.open()
    await reported(store)
  })

  it('reads a result that arrives during a turn together with the messages queued behind that turn', async () => {
    const task = gate()
    const chat = gate()
    const model = scriptedModel({
      chat: [now(undefined, [startTask('调研')]), now('开了。'), chat.held('B 的回答'), now('C 和结果一起回答')],
      task: [task.held('调研完了')],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', 'A')
    const turnB = harness.send('chief', 'B')
    await vi.waitFor(() => expect(chatCalls(model)).toHaveLength(3))
    const turnC = harness.send('chief', 'C')
    task.open()
    await vi.waitFor(() => expect(store.tasksOf('chief', 10)).toMatchObject([{ status: 'done' }]))
    chat.open()
    await Promise.all([turnB, turnC])
    expect(kinds(store)).toEqual(['user', 'bot', 'user', 'bot', 'user', 'task-result', 'bot'])
    expect(chatCalls(model)).toHaveLength(4)
  })

  it('runs two tasks of the same bot at the same time', async () => {
    const tasks = gate()
    const model = scriptedModel({
      chat: [now(undefined, [startTask('甲'), startTask('乙')]), now('开了两个。')],
      task: [tasks.held('甲好了'), tasks.held('乙好了')],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '做甲和乙')
    await vi.waitFor(() => expect(taskCalls(model)).toHaveLength(2))
    tasks.open()
    await vi.waitFor(() => expect(store.tasksOf('chief', 10).map((task) => task.status)).toEqual(['done', 'done']))
  })

  it('keeps a fourth task waiting until one of the three running tasks ends', async () => {
    const tasks = gate()
    const model = scriptedModel({
      chat: [
        now(
          undefined,
          ['甲', '乙', '丙', '丁'].map((title) => startTask(title)),
        ),
        now('开了四个。'),
      ],
      task: [tasks.held('好了'), tasks.held('好了'), tasks.held('好了'), now('丁好了')],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '做四件事')
    await vi.waitFor(() => expect(taskCalls(model)).toHaveLength(3))
    const statusOf = (title: string) => store.tasksOf('chief', 10).find((task) => task.title === title)?.status
    expect(['甲', '乙', '丙', '丁'].map(statusOf)).toEqual(['running', 'running', 'running', 'waiting'])
    tasks.open()
    await vi.waitFor(() => expect(['甲', '乙', '丙', '丁'].map(statusOf)).toEqual(['done', 'done', 'done', 'done']))
    expect(taskCalls(model)).toHaveLength(4)
  })

  it('stops a running task without reporting it back or starting a turn', async () => {
    let isAborted = false
    const hangUntilAborted: Scripted = (abortSignal) =>
      new Promise((_, reject) =>
        abortSignal?.addEventListener('abort', () => {
          isAborted = true
          reject(abortSignal.reason)
        }),
      )
    const script = { chat: [now(undefined, [startTask('调研')]), now('开了。')], task: [hangUntilAborted] }
    const model = scriptedModel(script)
    const { store, harness } = setup(model)
    await harness.send('chief', '调研一下')
    const [task] = store.tasksOf('chief', 10)
    script.chat.push(now(undefined, [{ name: 'stop_task', input: { taskId: task.id } }]), now('停了。'))
    await harness.send('chief', '别做了')
    await vi.waitFor(() => expect(isAborted).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(store.task(task.id)?.status).toBe('stopped')
    expect(kinds(store)).not.toContain('task-result')
    expect(chatCalls(model)).toHaveLength(4)
  })

  it('shows a task that already ended as ended when stopped from the panel', async () => {
    const model = scriptedModel({
      chat: [now(undefined, [startTask('调研')]), now('开了。')],
      task: [now('好了')],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '调研一下')
    await reported(store)
    const [task] = store.tasksOf('chief', 10)
    events.length = 0
    harness.stopTask('chief', task.id)
    expect(store.task(task.id)?.status).toBe('done')
    expect(events).toContainEqual({
      kind: 'tasks',
      botId: 'chief',
      tasks: [expect.objectContaining({ id: task.id, status: 'done' })],
    })
  })

  it('refuses to stop a task that is not running', async () => {
    const model = scriptedModel({
      chat: [now(undefined, [{ name: 'stop_task', input: { taskId: 't-ghost' } }])],
      task: [],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '停掉那个任务')
    expect(toolOutputs(store, 'stop_task')).toEqual([expect.stringContaining('没有进行中的任务 t-ghost')])
  })

  it('reports a task that failed, with the reason', async () => {
    const model = scriptedModel({
      chat: [now(undefined, [startTask('调研')]), now('开了。')],
      task: [
        () => {
          throw new Error('网络断了')
        },
      ],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '调研一下')
    await reported(store)
    expect(store.history('chief').at(-2)).toMatchObject({ kind: 'task-result', status: 'failed' })
    expect(JSON.stringify(store.history('chief').at(-2))).toContain('网络断了')
  })

  it('fails a task whose model goes silent, saying so', async () => {
    const model = scriptedModel({
      chat: [now(undefined, [startTask('调研')]), now('开了。')],
      task: [(abortSignal) => stalled(abortSignal, '查到一半')],
    })
    const { store, harness } = setup(model, () => ({ modelSilenceSeconds: 0.05 }))
    await harness.send('chief', '调研一下')
    await reported(store)
    expect(store.tasksOf('chief', 10)).toMatchObject([
      { status: 'failed', failureReason: expect.stringContaining('没有回应') },
    ])
  })

  it('gives a task the tools for doing the work, not the ones for talking to the user or managing bots', async () => {
    const model = scriptedModel({ chat: [now(undefined, [startTask('调研')]), now('开了。')], task: [now('好了')] })
    const { store, harness } = setup(model)
    await harness.send('chief', '调研一下')
    await reported(store)
    const names = (taskCalls(model)[0].tools ?? []).map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining(['fetch_url', 'write_file', 'edit_file', 'run_command', 'read_history', 'set_status']),
    )
    for (const name of ['remember', 'create_bot', 'start_task', 'stop_task', 'create_routine', 'ask_bot'])
      expect(names).not.toContain(name)
  })

  it('lists a file written by a task in the library of its bot', async () => {
    const model = scriptedModel({
      chat: [now(undefined, [startTask('日报')]), now('开了。')],
      task: [now(undefined, [{ name: 'write_file', input: { path: '日报/1.md', content: '三件事' } }]), now('写好了')],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '写份日报')
    await reported(store)
    const libraries = events.flatMap((e) => (e.kind === 'library' && e.botId === 'chief' ? [e.library] : []))
    expect(libraries.at(-1)?.map((item) => item.path)).toEqual(['日报/1.md'])
  })

  it('shows its progress on the task while it runs', async () => {
    const model = scriptedModel({
      chat: [now(undefined, [startTask('日报')]), now('开了。')],
      task: [now(undefined, [{ name: 'set_status', input: { text: '核对 star 数' } }]), now('好了')],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '写份日报')
    await reported(store)
    const views = events.flatMap((e) => (e.kind === 'tasks' && e.botId === 'chief' ? e.tasks : []))
    expect(views).toContainEqual(expect.objectContaining({ status: 'running', statusText: '核对 star 数' }))
    expect(store.tasksOf('chief', 10)).toMatchObject([{ status: 'done', statusText: '核对 star 数' }])
  })

  it('points the result at the task transcript, which opens with the brief', async () => {
    const script = {
      chat: [now(undefined, [startTask('日报', '写份日报，分三段')]), now('开了。'), now('写好了。')],
      task: [now('日报：三件事')],
    }
    const model = scriptedModel(script)
    const { store, harness } = setup(model)
    await harness.send('chief', '写份日报')
    await reported(store)
    const [task] = store.tasksOf('chief', 10)
    expect(userText(chatCalls(model)[2])).toContain(`${task.id}#1`)
    script.chat.push(
      now(undefined, [{ name: 'read_history', input: { ref: `${task.id}#1`, around: 0 } }]),
      now('看到了。'),
    )
    await harness.send('chief', '任务说明是什么？')
    const [opened] = toolOutputs(store, 'read_history')
    expect(opened).toContain('写份日报，分三段')
  })

  it('clips a long conclusion and says where to read all of it', async () => {
    const model = scriptedModel({
      chat: [now(undefined, [startTask('长文')]), now('开了。')],
      task: [now('长'.repeat(3000))],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '写长文')
    await reported(store)
    const [task] = store.tasksOf('chief', 10)
    const result = store.history('chief').at(-2)
    const text = result?.kind === 'task-result' ? result.text : ''
    expect(text.length).toBeLessThan(2100)
    expect(text).toContain(`${task.id}#2`)
  })

  it('hands the task its brief as the one message, saying who it came from', async () => {
    const model = scriptedModel({ chat: [now(undefined, [startTask('调研', '查五个仓库')]), now('开了。')], task: [] })
    const { store, harness } = setup(model)
    await harness.send('chief', '调研一下')
    await reported(store)
    expect(taskCalls(model)[0].prompt.filter((message) => message.role === 'user')).toEqual([
      { role: 'user', content: [{ type: 'text', text: '任务说明（来自「CEO」）：\n查五个仓库' }] },
    ])
  })

  it('reports a task that used up its steps mid-work as failed, not done', async () => {
    const working = now('接下来打开第二个仓库', [{ name: 'set_status', input: { text: '读仓库' } }])
    const model = scriptedModel({
      chat: [now(undefined, [startTask('调研')]), now('开了。')],
      task: Array.from({ length: 3 }, () => working),
    })
    const { store, harness } = setup(model, () => ({ taskSteps: 3 }))
    await harness.send('chief', '调研一下')
    await reported(store)
    expect(store.history('chief').at(-2)).toMatchObject({
      kind: 'task-result',
      status: 'failed',
      text: '步数用完仍未完成，停在「读仓库」',
    })
  })

  it('stops a waiting task so that it never starts', async () => {
    const tasks = gate()
    const script = {
      chat: [
        now(
          undefined,
          ['甲', '乙', '丙', '丁'].map((title) => startTask(title)),
        ),
        now('开了四个。'),
      ],
      task: [tasks.held('好了'), tasks.held('好了'), tasks.held('好了'), now('丁好了')],
    }
    const model = scriptedModel(script)
    const { store, harness } = setup(model)
    await harness.send('chief', '做四件事')
    const fourth = store.tasksOf('chief', 10).find((task) => task.title === '丁')
    script.chat.push(now(undefined, [{ name: 'stop_task', input: { taskId: fourth?.id } }]), now('丁停了。'))
    await harness.send('chief', '丁不用做了')
    tasks.open()
    await vi.waitFor(() =>
      expect(
        store
          .tasksOf('chief', 10)
          .map((task) => task.status)
          .sort(),
      ).toEqual(['done', 'done', 'done', 'stopped']),
    )
    expect(taskCalls(model)).toHaveLength(3)
  })

  it('starts a waiting task as soon as more tasks may run at once', async () => {
    const tasks = gate()
    const model = scriptedModel({
      chat: [now(undefined, [startTask('甲'), startTask('乙')]), now('开了两个。')],
      task: [tasks.held('好了'), tasks.held('好了')],
    })
    let runningTasks = 1
    const { store, harness } = setup(model, () => ({ runningTasks }))
    await harness.send('chief', '做两件事')
    const statuses = () =>
      store
        .tasksOf('chief', 10)
        .map((task) => task.status)
        .sort()
    expect(statuses()).toEqual(['running', 'waiting'])
    runningTasks = 2
    harness.startWaitingTasks()
    expect(statuses()).toEqual(['running', 'running'])
    tasks.open()
    await vi.waitFor(() => expect(statuses()).toEqual(['done', 'done']))
  })

  it('marks tasks that were running when the app quit as interrupted, without starting a turn', () => {
    const model = scriptedModel({ chat: [], task: [] })
    const { store } = setup(model)
    const task = {
      botId: 'chief',
      requestedBy: 'chief',
      source: { kind: 'chat' as const },
      title: '调研',
      statusText: '',
      createdAt: 1,
    }
    store.saveTask({ ...task, id: 't1', status: 'running' })
    store.saveTask({ ...task, id: 't2', status: 'waiting' })
    store.saveTask({ ...task, id: 't3', status: 'done' })
    createHarness({
      store,
      workspace: createWorkspace(path.join(dir, 'library')),
      skills: createSkills({ dir: path.join(dir, 'skills'), store, emit: () => {} }),
      getModel: () => model,
      models: choicesOf(),
      getApiKey: () => null,
      windowTokensOf: () => 1_000_000,
      mcp: NO_MCP,
      emit: (e) => events.push(e),
      limits: () => DEFAULT_LIMITS,
    })
    expect(['t1', 't2', 't3'].map((id) => store.task(id)?.status)).toEqual(['interrupted', 'interrupted', 'done'])
    expect(model.doStreamCalls).toHaveLength(0)
  })

  it('gives a task the tools of the connected MCP servers, and keeps them out of the chat', async () => {
    const click = vi.fn(async () => '点到了')
    const browser = tool({ description: '点击', inputSchema: z.object({}), execute: click })
    const mcp: Mcp = {
      configured: () => ['browser'],
      toolbox: async () => ({ servers: ['browser'], tools: { browser__click: browser } }),
    }
    const model = scriptedModel({
      chat: [now(undefined, [startTask('点按钮')]), now('开了。')],
      task: [now(undefined, [{ name: 'browser__click', input: {} }]), now('点好了')],
    })
    const { store, harness } = setup(model, undefined, mcp)
    await harness.send('chief', '帮我点一下按钮')
    await reported(store)
    expect(click).toHaveBeenCalledOnce()
    expect((chatCalls(model)[0].tools ?? []).map((definition) => definition.name)).not.toContain('browser__click')
  })

  it('gives the chat no tools for doing the work itself, so it has to start a task', async () => {
    const model = scriptedModel({ chat: [now('你好。')], task: [] })
    const { harness } = setup(model)
    await harness.send('chief', '你好')
    const names = (chatCalls(model)[0].tools ?? []).map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining(['start_task', 'stop_task', 'remember', 'search_history', 'read_history']),
    )
    for (const name of [
      'fetch_url',
      'read_file',
      'write_file',
      'run_command',
      'web_search',
      'list_files',
      'set_status',
      'ask_bot',
    ])
      expect(names).not.toContain(name)
  })

  const askSecretary = () =>
    scriptedModel({
      chat: [
        now(undefined, [{ name: 'start_task', input: { title: '查日程', brief: '查明天的日程', botId: 'secretary' } }]),
        now('交给秘书了。'),
        now('秘书说明天 10 点开会。'),
      ],
      task: [now('明天 10 点开会')],
    })

  it('runs a task as another bot, with its duty, and hands the result to the bot that asked', async () => {
    const model = askSecretary()
    const { store, harness } = setup(model)
    await harness.send('chief', '明天有什么安排？')
    await reported(store)
    expect(JSON.stringify(taskCalls(model)[0].prompt[0])).toContain('你是「秘书」')
    expect(userText(taskCalls(model)[0])).toContain('任务说明（来自「CEO」）')
    expect(store.history('secretary')).toEqual([])
    expect(store.tasksOf('secretary', 10)).toMatchObject([{ requestedBy: 'chief', status: 'done' }])
  })

  it('shows the asking bot the tasks it started under another bot', async () => {
    const model = askSecretary()
    const { store, harness } = setup(model)
    await harness.send('chief', '明天有什么安排？')
    await reported(store)
    expect(JSON.stringify(chatCalls(model)[2].prompt[0])).toContain('查日程：完成')
  })

  it('refuses to start a task as a bot that does not exist', async () => {
    const model = scriptedModel({
      chat: [now(undefined, [{ name: 'start_task', input: { title: '查日程', brief: '查', botId: 'ghost' } }])],
      task: [],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '让 ghost 去查')
    expect(toolOutputs(store, 'start_task')).toEqual([expect.stringContaining('没有 id 为 ghost 的 Bot')])
    expect(store.tasksOf('ghost', 10)).toEqual([])
  })

  it('runs a routine that comes due as a task of its bot, reporting back to its chat', async () => {
    const model = scriptedModel({ chat: [now('日报写好了，三件事。')], task: [now('日报：三件事')] })
    const { store, harness } = setup(model)
    withRoutine(store, true)
    harness.startRoutine('chief', 'r1')
    await reported(store)
    expect(kinds(store)).toEqual(['task-result', 'bot'])
    expect(store.tasksOf('chief', 10)).toMatchObject([
      { title: '日报', source: { kind: 'routine', routineId: 'r1' }, status: 'done' },
    ])
    expect(userText(taskCalls(model)[0])).toContain('写日报')
  })

  it('does not start a routine again while its last run is unfinished, nor one that is paused', async () => {
    const task = gate()
    const model = scriptedModel({ chat: [], task: [task.held('日报')] })
    const { store, harness } = setup(model)
    withRoutine(store, true)
    harness.startRoutine('chief', 'r1')
    harness.startRoutine('chief', 'r1')
    expect(store.tasksOf('chief', 10)).toHaveLength(1)
    task.open()
    await reported(store)
    withRoutine(store, false)
    harness.startRoutine('chief', 'r1')
    expect(store.tasksOf('chief', 10)).toHaveLength(1)
  })

  it('stops a task that runs too long and reports it as timed out', async () => {
    const hangUntilAborted: Scripted = (abortSignal) =>
      new Promise((_, reject) => abortSignal?.addEventListener('abort', () => reject(abortSignal.reason)))
    const model = scriptedModel({
      chat: [now(undefined, [startTask('调研')]), now('开了。')],
      task: [hangUntilAborted],
    })
    const { store, harness } = setup(model, () => ({ taskTimeoutMinutes: 50 / 60_000 }))
    await harness.send('chief', '调研一下')
    await reported(store)
    expect(store.history('chief').at(-2)).toMatchObject({ kind: 'task-result', status: 'failed' })
    expect(JSON.stringify(store.history('chief').at(-2))).toContain('超时')
    expect(store.tasksOf('chief', 10)).toMatchObject([
      { status: 'failed', failureReason: expect.stringContaining('超时') },
    ])
  })

  it('reports a task the model provider refused for an empty balance in words the user understands', async () => {
    const model = scriptedModel({
      chat: [now(undefined, [startTask('调研')]), now('开了。')],
      task: [
        () => {
          throw new APICallError({
            message: 'Payment Required',
            url: 'https://api',
            requestBodyValues: {},
            statusCode: 402,
          })
        },
      ],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '调研一下')
    await reported(store)
    expect(store.history('chief').at(-2)).toMatchObject({ kind: 'task-result', status: 'failed', text: '账户余额不足' })
  })

  it('runs a routine again once its last run has ended', async () => {
    const model = scriptedModel({ chat: [], task: [now('日报一'), now('日报二')] })
    const { store, harness } = setup(model)
    withRoutine(store, true)
    harness.startRoutine('chief', 'r1')
    await vi.waitFor(() => expect(store.tasksOf('chief', 10)).toMatchObject([{ status: 'done' }]))
    harness.startRoutine('chief', 'r1')
    await vi.waitFor(() => expect(store.tasksOf('chief', 10).map((task) => task.status)).toEqual(['done', 'done']))
  })

  it('stops a task from the panel only through the bot that runs it', async () => {
    const task = gate()
    const model = scriptedModel({
      chat: [now(undefined, [startTask('调研')]), now('开了。')],
      task: [task.held('好了')],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '调研一下')
    const [running] = store.tasksOf('chief', 10)
    expect(() => harness.stopTask('secretary', running.id)).toThrow('没有进行中的任务')
    harness.stopTask('chief', running.id)
    expect(store.task(running.id)?.status).toBe('stopped')
    task.open()
  })

  it('refuses to stop a task another bot started', async () => {
    const task = gate()
    const script = {
      chat: [
        now(undefined, [{ name: 'start_task', input: { title: '查日程', brief: '查', botId: 'secretary' } }]),
        now('交给秘书了。'),
      ],
      task: [task.held('10 点')],
    }
    const model = scriptedModel(script)
    const { store, harness } = setup(model)
    await harness.send('chief', '让秘书查日程')
    const [asked] = store.tasksOf('secretary', 10)
    script.chat.push(now(undefined, [{ name: 'stop_task', input: { taskId: asked.id } }]), now('停不了。'))
    await harness.send('secretary', '把 CEO 让你查的停掉')
    expect(store.task(asked.id)?.status).toBe('running')
    const outputs = store.toolEntries('secretary', 'stop_task').map((entry) => JSON.stringify(entry))
    expect(outputs).toEqual([expect.stringContaining('不是你开的')])
    task.open()
    await reported(store)
  })

  it('runs a task by one of its flows, which the task follows step by step', async () => {
    const byFlow = { name: 'start_task', input: { title: '发版说明', brief: '整理 v0.9 的发版说明', flowId: 'f1' } }
    const model = scriptedModel({ chat: [now(undefined, [byFlow]), now('开了。')], task: [now('草稿写好了')] })
    const { store, harness } = setup(model)
    withFlow(store)
    await harness.send('chief', '整理发版说明')
    await reported(store)
    const system = JSON.stringify(taskCalls(model)[0].prompt[0])
    expect(system).toContain('按流程「发版说明」做')
    expect(system).toContain('1. 列出合并的 PR')
    expect(system).toContain('注意：贴之前先给用户看')
    expect(store.tasksOf('chief', 10)).toMatchObject([{ flowId: 'f1', status: 'done' }])
    expect(store.history('chief').at(-2)).toMatchObject({ kind: 'task-result', status: 'done', flowId: 'f1' })
    const views = events.flatMap((event) => (event.kind === 'tasks' ? event.tasks : []))
    expect(views.at(-1)).toMatchObject({ title: '发版说明', flowId: 'f1' })
  })

  it('refuses a task by a flow run as another bot, saying to leave the bot out', async () => {
    const asOther = {
      name: 'start_task',
      input: { title: '发版说明', brief: '整理', botId: 'secretary', flowId: 'f1' },
    }
    const model = scriptedModel({ chat: [now(undefined, [asOther])], task: [] })
    const { store, harness } = setup(model)
    withFlow(store)
    await harness.send('chief', '让秘书按发版流程做')
    expect(toolOutputs(store, 'start_task')).toEqual([expect.stringContaining('不要填 botId')])
    expect(store.tasksOf('secretary', 10)).toEqual([])
  })

  it('runs a task without a flow when the flow id is left empty', async () => {
    const empty = { name: 'start_task', input: { title: '周报', brief: '写周报', flowId: '' } }
    const model = scriptedModel({ chat: [now(undefined, [empty]), now('开了。')], task: [now('周报')] })
    const { store, harness } = setup(model)
    await harness.send('chief', '写周报')
    await reported(store)
    expect(store.tasksOf('chief', 10)).toMatchObject([{ status: 'done' }])
    expect(store.tasksOf('chief', 10)[0].flowId).toBeUndefined()
  })

  it('refuses a task by a flow its bot does not have', async () => {
    const byFlow = { name: 'start_task', input: { title: '周报', brief: '写周报', flowId: 'f-missing' } }
    const model = scriptedModel({ chat: [now(undefined, [byFlow])], task: [] })
    const { store, harness } = setup(model)
    await harness.send('chief', '按周报流程写')
    expect(toolOutputs(store, 'start_task')).toEqual([expect.stringContaining('没有 id 为 f-missing 的流程')])
    expect(store.tasksOf('chief', 10)).toEqual([])
  })

  it('runs a routine by the flow it names', async () => {
    const model = scriptedModel({ chat: [now('发版说明好了。')], task: [now('草稿')] })
    const { store, harness } = setup(model)
    withFlow(store)
    withRoutine(store, true, 'f1')
    harness.startRoutine('chief', 'r1')
    await reported(store)
    expect(store.tasksOf('chief', 10)).toMatchObject([{ flowId: 'f1' }])
    expect(JSON.stringify(taskCalls(model)[0].prompt[0])).toContain('按流程「发版说明」做')
  })

  const onKimi = { name: 'start_task', input: { title: '巡检', brief: '看五个仓库', model: KIMI } }

  it('runs a task on the model the bot names, and tells the chat which one it ran on', async () => {
    const model = scriptedModel({ chat: [now(undefined, [onKimi]), now('开了。')], task: [] })
    const { store, harness } = setup(model, undefined, NO_MCP, choicesOf({ 'kimi-k2': kimiModel([step('巡检完了')]) }))
    await harness.send('chief', '用 Kimi 巡检')
    await reported(store)
    expect(taskCalls(model)).toHaveLength(0)
    expect(store.history('chief').at(-2)).toMatchObject({ kind: 'task-result', text: '巡检完了', model: 'kimi-k2' })
  })

  it('names the task as the session of its model calls', async () => {
    const model = scriptedModel({ chat: [now(undefined, [startTask('日报')])], task: [now('日报写好了')] })
    const { store, harness } = setup(model)
    await harness.send('chief', '写份日报')
    await reported(store)
    const [task] = store.tasksOf('chief', 10)
    expect(taskCalls(model)[0].headers?.['x-opencode-session']).toBe(task.id)
  })

  it('refuses a model the account does not list, naming the ones it does', async () => {
    const wrong = { ...onKimi, input: { ...onKimi.input, model: { accountId: 'kimi', model: 'kimi-k9' } } }
    const model = scriptedModel({ chat: [now(undefined, [wrong])], task: [] })
    const { store, harness } = setup(model)
    await harness.send('chief', '用 Kimi 巡检')
    expect(toolOutputs(store, 'start_task')).toEqual([expect.stringContaining('kimi-k2-turbo')])
    expect(store.tasksOf('chief', 10)).toEqual([])
  })

  it('runs a task by a flow on the model set for that flow', async () => {
    const byFlow = { name: 'start_task', input: { title: '发版说明', brief: '写 0.8 的', flowId: 'f1' } }
    const model = scriptedModel({ chat: [now(undefined, [byFlow]), now('开了。')], task: [] })
    const { store, harness } = setup(model, undefined, NO_MCP, choicesOf({ 'kimi-k2': kimiModel([step('草稿')]) }))
    store.updateBot('chief', { flows: [{ ...RELEASE_FLOW, model: KIMI }] })
    await harness.send('chief', '写发版说明')
    await reported(store)
    expect(taskCalls(model)).toHaveLength(0)
    expect(store.tasksOf('chief', 10)).toMatchObject([{ model: KIMI, status: 'done' }])
  })

  it('switches a routine to another model, telling the panel, and runs it there from then on', async () => {
    const toKimi = { name: 'set_model', input: { target: 'routine', id: 'r1', model: KIMI } }
    const model = scriptedModel({ chat: [now(undefined, [toKimi]), now('改好了。')], task: [] })
    const { store, harness } = setup(
      model,
      undefined,
      NO_MCP,
      choicesOf({ 'kimi-k2': kimiModel([step('日报：三件事')]) }),
    )
    withRoutine(store, true)
    await harness.send('chief', '日报改用 Kimi')
    const views = events.flatMap((event) => (event.kind === 'routines' ? event.routines : []))
    expect(views.at(-1)).toMatchObject({ id: 'r1', model: 'kimi-k2' })
    harness.startRoutine('chief', 'r1')
    await reported(store)
    expect(taskCalls(model)).toHaveLength(0)
    expect(store.tasksOf('chief', 10)).toMatchObject([{ model: KIMI, status: 'done' }])
  })

  it('switches the model its tasks run on when asked, telling the panel, and runs tasks naming none there', async () => {
    const toKimi = { name: 'set_model', input: { target: 'tasks', model: KIMI } }
    const patrol = { name: 'start_task', input: { title: '巡检', brief: '看五个仓库' } }
    const model = scriptedModel({
      chat: [now(undefined, [toKimi]), now('改好了。'), now(undefined, [patrol]), now('开了。')],
      task: [],
    })
    const { store, harness } = setup(model, undefined, NO_MCP, choicesOf({ 'kimi-k2': kimiModel([step('巡检完了')]) }))
    await harness.send('chief', '后台任务都用 Kimi')
    expect(store.get().bots.chief.taskModel).toEqual(KIMI)
    const shown = events.flatMap((event) => (event.kind === 'models' ? [event.models] : []))
    expect(shown.at(-1)).toMatchObject({ chat: null, tasks: { model: 'kimi-k2', isGone: false } })
    await harness.send('chief', '巡检一下')
    await reported(store)
    expect(taskCalls(model)).toHaveLength(0)
    expect(store.tasksOf('chief', 10)).toMatchObject([{ model: KIMI, status: 'done' }])
  })

  it('runs a task on the main model when its model cannot be reached, and tells the chat it fell back', async () => {
    const model = scriptedModel({ chat: [now(undefined, [onKimi]), now('开了。')], task: [now('巡检完了')] })
    const { store, harness } = setup(model, undefined, NO_MCP, choicesOf({ 'kimi-k2': unreachableModel() }))
    await harness.send('chief', '用 Kimi 巡检')
    await reported(store)
    expect(store.history('chief').at(-2)).toMatchObject({
      kind: 'task-result',
      status: 'done',
      model: 'mock-model-id',
      fallbackFrom: 'kimi-k2',
    })
  })
})

describe('debug reports', () => {
  const traces = () => events.flatMap((e) => (e.kind === 'trace' ? [e.trace] : []))
  const contexts = () => events.flatMap((e) => (e.kind === 'context' ? [e.context] : []))
  const debugSetup = (model: MockLanguageModelV4) => {
    const made = setup(model)
    made.harness.setDebug(true)
    return made
  }

  it('sends no context or trace while debug mode is off', async () => {
    const { harness } = setup(new MockLanguageModelV4({ doStream: [step('好。')] }))
    await harness.send('chief', '你好')
    expect(events.filter((e) => e.kind === 'context' || e.kind === 'trace')).toEqual([])
  })

  it('reports a chat turn step by step: each call with its input and output, and the API count', async () => {
    const remember = { name: 'remember', input: { text: '周报周五交', scope: 'user' } }
    const model = new MockLanguageModelV4({ doStream: [step(undefined, [remember]), step('记下了。')] })
    const { harness } = debugSetup(model)
    await harness.send('chief', '记住周报周五交')
    const last = traces().at(-1)
    expect(last).toMatchObject({ id: 'chief', title: '聊天', inputs: ['用户：记住周报周五交'], finishReason: 'stop' })
    expect(last?.endedAt).not.toBeNull()
    expect(last?.compaction).toEqual({ pending: 1, threshold: 160, folded: 0 })
    expect(last?.steps.map((s) => s.calls.map((call) => call.name))).toEqual([['remember'], []])
    expect(last?.steps[0]?.calls[0]).toMatchObject({ input: '{"text":"周报周五交","scope":"user"}', isError: false })
    expect(last?.steps[1]).toMatchObject({ text: '记下了。', usage: { input: 1, output: 1 } })
  })

  it('reports the run as it goes: it starts with no steps before the model answers', async () => {
    const { harness } = debugSetup(new MockLanguageModelV4({ doStream: [step('好。')] }))
    await harness.send('chief', '你好')
    expect(traces()[0]).toMatchObject({ steps: [], endedAt: null })
  })

  it('sends the tool records of a chat turn to the renderer as they are written', async () => {
    const remember = { name: 'remember', input: { text: '周报周五交', scope: 'bot' } }
    const { harness } = debugSetup(new MockLanguageModelV4({ doStream: [step(undefined, [remember]), step('好。')] }))
    await harness.send('chief', '记住')
    const kinds = events.flatMap((e) => (e.kind === 'entry' ? [e.entry.kind] : []))
    expect(kinds).toEqual(['user', 'tool', 'bot'])
  })

  it('ends the report with the reason a turn failed', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error('接口挂了')
      },
    })
    const { harness } = debugSetup(model)
    await harness.send('chief', '你好')
    expect(traces().at(-1)).toMatchObject({ error: expect.stringContaining('接口挂了') })
    expect(traces().at(-1)?.endedAt).not.toBeNull()
  })

  it('shows the context a turn sends: its sections make up the system prompt, and the API count replaces the guess', async () => {
    const model = new MockLanguageModelV4({ doStream: [step('好。')] })
    const { harness } = debugSetup(model)
    await harness.send('chief', '你好')
    const [guessed, counted, after] = contexts()
    expect(guessed?.measured).toBeNull()
    expect(guessed?.sections.map((s) => (s.heading ? `## ${s.heading}\n\n${s.text}` : s.text)).join('\n\n')).toBe(
      systemOf(model, 0),
    )
    expect(guessed?.transcript).toMatchObject({ from: 1, to: 1, counts: { user: 1 } })
    expect(guessed?.tools.definitions.map((tool) => tool.name)).toContain('remember')
    expect(counted?.measured).toMatchObject({ input: 1 })
    expect(harness.context('chief')?.tokensPerChar).toBe(counted?.tokensPerChar)
    expect(after?.transcript.counts).toMatchObject({ user: 1, bot: 1 }) // sent again once the reply is in
  })

  it('has no context for a bot it does not know', () => {
    const { harness } = debugSetup(new MockLanguageModelV4({ doStream: [] }))
    expect(harness.context('nobody')).toBeNull()
  })

  it('reports a task to the bot that runs it, under the task id', async () => {
    const start = { name: 'start_task', input: { title: '查日程', brief: '查明天', botId: 'secretary' } }
    const model = new MockLanguageModelV4({
      doStream: [step(undefined, [start]), step('交给秘书了。'), step('明天 10 点开会。'), step('秘书说 10 点。')],
    })
    const { store, harness } = debugSetup(model)
    await harness.send('chief', '让秘书查日程')
    await vi.waitFor(() => expect(store.tasksOf('secretary', 1)[0]?.status).toBe('done'))
    const [task] = store.tasksOf('secretary', 1)
    const reported = events.flatMap((e) => (e.kind === 'trace' && e.trace.id === task.id ? [e] : []))
    expect(reported.at(-1)).toMatchObject({ botId: 'secretary', trace: { title: '查日程', inputs: ['查明天'] } })
  })
})

describe('model choices', () => {
  const switchChat = (model?: object) => ({ name: 'set_model', input: { target: 'chat', ...(model ? { model } : {}) } })

  it('replies on the model the user had it switch to', async () => {
    const main = new MockLanguageModelV4({ doStream: [step('主模型的回复')] })
    const { store, harness } = setup(main, undefined, NO_MCP, choicesOf({ 'kimi-k2': kimiModel() }))
    store.updateBot('chief', { model: KIMI })
    await harness.send('chief', '在吗')
    expect(main.doStreamCalls).toHaveLength(0)
    expect(store.history('chief').at(-1)).toMatchObject({ kind: 'bot', text: 'Kimi 的回复', model: 'kimi-k2' })
  })

  it('replies on the main model when the chosen one cannot be reached, noting which one it stood in for', async () => {
    const main = new MockLanguageModelV4({ doStream: [step('主模型的回复')] })
    const { store, harness } = setup(main, undefined, NO_MCP, choicesOf({ 'kimi-k2': unreachableModel() }))
    store.updateBot('chief', { model: KIMI })
    await harness.send('chief', '在吗')
    expect(store.history('chief').at(-1)).toMatchObject({
      kind: 'bot',
      text: '主模型的回复',
      model: 'mock-model-id',
      fallbackFrom: 'kimi-k2',
    })
    expect(events).not.toContainEqual(expect.objectContaining({ kind: 'error' }))
  })

  it('replies on the main model when the server of the chosen one no longer has it', async () => {
    const main = new MockLanguageModelV4({ doStream: [step('主模型的回复')] })
    const { store, harness } = setup(main, undefined, NO_MCP, choicesOf({ 'kimi-k2': missingModel() }))
    store.updateBot('chief', { model: KIMI })
    await harness.send('chief', '在吗')
    expect(store.history('chief').at(-1)).toMatchObject({
      kind: 'bot',
      text: '主模型的回复',
      model: 'mock-model-id',
      fallbackFrom: 'kimi-k2',
    })
  })

  it('replies on the main model when the account of the chosen one is gone', async () => {
    const main = new MockLanguageModelV4({ doStream: [step('主模型的回复')] })
    const { store, harness } = setup(main)
    store.updateBot('chief', { model: KIMI })
    await harness.send('chief', '在吗')
    expect(store.history('chief').at(-1)).toMatchObject({
      kind: 'bot',
      model: 'mock-model-id',
      fallbackFrom: 'kimi-k2',
    })
  })

  it('switches its chat model when asked, telling the panel, and replies there from the next turn', async () => {
    const main = new MockLanguageModelV4({ doStream: [step(undefined, [switchChat(KIMI)]), step('换好了。')] })
    const { store, harness } = setup(main, undefined, NO_MCP, choicesOf({ 'kimi-k2': kimiModel() }))
    await harness.send('chief', '以后用 Kimi 跟我聊')
    expect(store.get().bots.chief.model).toEqual(KIMI)
    const shown = events.flatMap((event) => (event.kind === 'models' ? [event.models] : []))
    expect(shown.at(-1)).toEqual({ main: 'mock-model-id', chat: { model: 'kimi-k2', isGone: false }, tasks: null })
    await harness.send('chief', '在吗')
    expect(store.history('chief').at(-1)).toMatchObject({ kind: 'bot', model: 'kimi-k2' })
  })

  it('goes back to the main model when asked to switch to none', async () => {
    const main = new MockLanguageModelV4({ doStream: [step(undefined, [switchChat()]), step('换回来了。')] })
    const { store, harness } = setup(main)
    store.updateBot('chief', { model: KIMI })
    await harness.send('chief', '换回主模型')
    expect(store.get().bots.chief.model).toBeUndefined()
  })

  it('refuses an account the user has not connected, naming the ones there are', async () => {
    const main = new MockLanguageModelV4({
      doStream: [step(undefined, [switchChat({ accountId: 'openai', model: 'gpt-5' })]), step('没有这个账号。')],
    })
    const { store, harness } = setup(main)
    await harness.send('chief', '用 GPT 聊')
    expect(toolOutputs(store, 'set_model')).toEqual([expect.stringContaining('Kimi')])
    expect(store.get().bots.chief.model).toBeUndefined()
  })

  it('switches a flow to another model', async () => {
    const toKimi = { name: 'set_model', input: { target: 'flow', id: 'f1', model: KIMI } }
    const main = new MockLanguageModelV4({ doStream: [step(undefined, [toKimi]), step('改好了。')] })
    const { store, harness } = setup(main)
    withFlow(store)
    await harness.send('chief', '发版说明改用 Kimi')
    expect(store.get().bots.chief.flows[0].model).toEqual(KIMI)
  })

  it('folds old turns into the summary with the main model even when it chats on another one', async () => {
    const main = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: '主模型的摘要' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage,
        warnings: [],
      },
    })
    const { store, harness } = setup(main, undefined, NO_MCP, choicesOf({ 'kimi-k2': kimiModel() }))
    store.updateBot('chief', { model: KIMI })
    for (let i = 0; i < 170; i++) store.append('chief', { kind: i % 2 ? 'bot' : 'user', text: `msg ${i}` })
    await harness.send('chief', '继续')
    expect(store.get().bots.chief.summary).toBe('主模型的摘要')
  })

  it('lists the models of an account', async () => {
    const list = { name: 'list_models', input: { accountId: 'kimi' } }
    const main = new MockLanguageModelV4({ doStream: [step(undefined, [list]), step('有两个。')] })
    const { store, harness } = setup(main)
    await harness.send('chief', 'Kimi 有哪些模型')
    expect(toolOutputs(store, 'list_models')).toEqual([JSON.stringify({ models: ['kimi-k2', 'kimi-k2-turbo'] })])
  })

  it('switches the model of another bot when the main bot is asked, telling the panel of that bot', async () => {
    const toKimi = { name: 'set_model', input: { botId: 'secretary', target: 'chat', model: KIMI } }
    const main = new MockLanguageModelV4({ doStream: [step(undefined, [toKimi]), step('换好了。')] })
    const { store, harness } = setup(main)
    await harness.send('chief', '秘书改用 Kimi 聊天')
    expect(store.get().bots.secretary.model).toEqual(KIMI)
    expect(store.get().bots.chief.model).toBeUndefined()
    expect(events).toContainEqual(expect.objectContaining({ kind: 'models', botId: 'secretary' }))
  })

  it('lets no bot but the main one switch the model of another bot', async () => {
    const toKimi = { name: 'set_model', input: { botId: 'chief', target: 'chat', model: KIMI } }
    const main = new MockLanguageModelV4({ doStream: [step(undefined, [toKimi]), step('换不了。')] })
    const { store, harness } = setup(main)
    await harness.send('secretary', 'CEO 改用 Kimi')
    expect(store.get().bots.chief.model).toBeUndefined()
    const [refused] = store.toolEntries('secretary', 'set_model')
    expect(refused?.kind === 'tool' && JSON.stringify(refused.output)).toContain('只有 [CEO](bot:chief) 能换')
  })

  it('lists the models every bot runs on, with the ids of its routines and flows', async () => {
    const list = { name: 'list_bot_models', input: {} }
    const main = new MockLanguageModelV4({ doStream: [step(undefined, [list]), step('秘书用 Kimi。')] })
    const { store, harness } = setup(main)
    const routine = { id: 'r1', name: '日报', prompt: '写日报', cron: '0 8 * * *', timezone: 'Asia/Shanghai' }
    store.updateBot('secretary', {
      model: KIMI,
      routines: [{ ...routine, isEnabled: true, model: KIMI }],
      flows: [RELEASE_FLOW],
    })
    await harness.send('chief', '各个 Bot 用的什么模型')
    const [listed] = toolOutputs(store, 'list_bot_models')
    expect(JSON.parse(listed ?? '[]')).toContainEqual({
      mention: '[秘书](bot:secretary)',
      chat: KIMI,
      tasks: null,
      routines: [{ id: 'r1', name: '日报', model: KIMI }],
      flows: [{ id: RELEASE_FLOW.id, name: RELEASE_FLOW.name, model: null }],
    })
  })
})

describe('skills', () => {
  /** A skill folder on this computer, as the user would paste its path into the chat. */
  function skillFolder(name: string): string {
    const root = path.join(dir, 'sources', name)
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(
      path.join(root, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Use ${name} for PDFs.\n---\n# Steps`,
    )
    return root
  }

  const offerOf = (store: Store, botId: string) => {
    const [entry] = store.toolEntries(botId, 'install_skill')
    const output = entry?.kind === 'tool' ? entry.output : undefined
    return z.object({ offer: z.string() }).parse(output).offer
  }

  it('installs only once the user says yes on the card, and the bot hears about it in its next turn', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [{ name: 'install_skill', input: { source: skillFolder('pdf') } }]),
        step('看一下卡片。'),
        step('装好了。'),
      ],
    })
    const { store, harness } = setup(model)
    await harness.send('chief', '装一下这个技能')
    expect(store.get().bots.chief.skills).toEqual([])
    harness.answerSkillOffer('chief', offerOf(store, 'chief'), ['pdf'])
    expect(store.history('chief').at(-1)).toMatchObject({ kind: 'skill-answer', names: ['pdf'] })
    await vi.waitFor(() => expect(model.doStreamCalls).toHaveLength(3))
    expect(store.get().bots.chief.skills).toMatchObject([{ name: 'pdf' }])
    expect(store.history('chief').map((entry) => entry.kind)).toContain('skill-answer')
    expect(JSON.stringify(model.doStreamCalls[2].prompt)).toContain('点了「装上」')
  })

  it('lets only the main bot install for another bot', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        step(undefined, [{ name: 'install_skill', input: { source: skillFolder('pdf'), botId: 'chief' } }]),
        step('不行。'),
      ],
    })
    const { store, harness } = setup(model)
    await harness.send('secretary', '给 CEO 装个技能')
    const [entry] = store.toolEntries('secretary', 'install_skill')
    expect(JSON.stringify(entry?.kind === 'tool' ? entry.output : null)).toContain('只有')
  })

  it("lists the team's skills to the main bot, and a bot only its own", async () => {
    const model = new MockLanguageModelV4({ doStream: [step('好。'), step('好。')] })
    const { store, harness } = setup(model)
    const skill = {
      name: 'notes',
      description: '整理发版说明',
      source: { kind: 'local' as const, root: '/x', path: '/x' },
      installedAt: 1,
      fileCount: 1,
      scripts: [],
      isUserInvoked: false,
    }
    store.updateBot('secretary', { skills: [skill] })
    await harness.send('chief', '你好')
    await harness.send('secretary', '你好')
    expect(systemOf(model, 0)).toContain('- secretary/notes（秘书 的）：整理发版说明')
    expect(systemOf(model, 1)).toContain('- notes：整理发版说明')
  })

  it('names the skills only the user calls on, without their descriptions', async () => {
    const model = new MockLanguageModelV4({ doStream: [step('好。')] })
    const { store, harness } = setup(model)
    const skill = (name: string, isUserInvoked: boolean) => ({
      name,
      description: `${name} 的说明`,
      source: { kind: 'local' as const, root: '/x', path: '/x' },
      installedAt: 1,
      fileCount: 1,
      scripts: [],
      isUserInvoked,
    })
    store.updateBot('secretary', {
      skills: [skill('grilling', false), skill('grill-me', true), skill('handoff', true)],
    })
    await harness.send('secretary', '你好')
    expect(systemOf(model, 0)).toContain('- grilling：grilling 的说明\n- 用户点名才用，不要自己挑：grill-me、handoff')
    expect(systemOf(model, 0)).not.toContain('grill-me 的说明')
  })
})
