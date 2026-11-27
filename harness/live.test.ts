// @vitest-environment node
// Real DeepSeek round trip. Skipped unless DEEPSEEK_API_KEY is set:  DEEPSEEK_API_KEY=sk-... npx vitest run harness/live
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createHarness } from './agent'
import { createModelCatalog } from './modelCatalog'
import { createSkills } from './skills'
import { createStore } from './store'
import { createWorkspace } from './workspace'
import type { HarnessEvent } from '../shared/bridge'
import { DEFAULT_LIMITS } from '../shared/limits'

const key = process.env.DEEPSEEK_API_KEY

describe.skipIf(!key)('live DeepSeek', () => {
  it('creates a bot, remembers a fact and recalls it in another bot', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-live-'))
    const events: HarnessEvent[] = []
    const store = createStore(path.join(dir, 'nengyongbot.db'))
    store.syncRoster([
      { id: 'chief', name: 'CEO' },
      { id: 'secretary', name: '秘书' },
    ])
    const model = createDeepSeek({ apiKey: key })(process.env.DEEPSEEK_MODEL ?? 'deepseek-flash')
    const harness = createHarness({
      store,
      workspace: createWorkspace(path.join(dir, 'lib')),
      skills: createSkills({ dir: path.join(dir, 'skills'), store, emit: (e) => events.push(e) }),
      getModel: () => model,
      models: { accounts: () => [], list: async () => [], of: () => null },
      getApiKey: () => key ?? null,
      windowTokensOf: createModelCatalog().windowTokensOf,
      mcp: { configured: () => [], toolbox: async () => ({ servers: [], tools: {} }) },
      emit: (e) => events.push(e),
      limits: () => DEFAULT_LIMITS,
    })

    await harness.send('chief', '给我创建一个新的 bot，用来记录我认为可以流程化、但还没有具体实施的想法。')
    await harness.send('chief', '记住：我习惯按北京时间安排工作，周末不安排会议。')
    await harness.send('secretary', '我周末一般安排会议吗？只回答是或否和原因。')

    const errors = events.filter((e) => e.kind === 'error')
    expect(errors).toEqual([])
    expect(events.some((e) => e.kind === 'bot-created')).toBe(true)
    expect(store.get().userFacts.length).toBeGreaterThan(0)
    const reply = store
      .history('secretary')
      .filter((e) => e.kind === 'bot')
      .map((e) => ('text' in e ? e.text : ''))
      .join('')
    expect(reply).toMatch(/否|不/)
    process.stderr.write(
      `\n--- transcripts in ${dir}/state/transcripts\n${JSON.stringify(store.get(), null, 2)}\n${reply}\n`,
    )
  }, 180_000)
})
