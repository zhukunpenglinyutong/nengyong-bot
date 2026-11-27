import { expect, it } from 'vitest'
import type { ContextView, Trace, TraceStep } from '../../shared/debug'
import { contextTokens, fullnessOf, liveTokens, tokensLabel } from './contextTokens'

const context = (patch: Partial<ContextView> = {}): ContextView => ({
  model: 'deepseek-chat',
  windowTokens: 1_000_000,
  sections: [{ heading: null, text: 'x'.repeat(100) }],
  transcript: {
    from: 1,
    to: 2,
    messages: [{ role: 'user', text: 'x'.repeat(200) }],
    counts: { user: 1, bot: 1, 'from-bot': 0, routine: 0, 'task-result': 0, 'skill-answer': 0, tool: 0 },
  },
  tools: { definitions: [{ name: 'remember', description: '记住' }], chars: 300 },
  keepRecent: 40,
  compactAbove: 80,
  tokensPerChar: 0.5,
  measured: null,
  ...patch,
})

it('converts each part from characters at the rate the API last counted', () => {
  expect(contextTokens(context())).toEqual({ system: 50, transcript: 100, tools: 150, total: 300 })
})

it('takes the API count as the total once there is one', () => {
  expect(contextTokens(context({ measured: { input: 320, cached: 0, output: 5 } })).total).toBe(320)
})

it('follows a running turn by the input of its latest counted step', () => {
  const step = (input: number | null): TraceStep => ({
    startedAt: 0,
    endedAt: null,
    calls: [],
    text: '',
    usage: input === null ? null : { input, cached: 0, output: 0 },
  })
  const trace: Trace = {
    id: 'chief',
    title: '聊天',
    startedAt: 0,
    endedAt: null,
    maxSteps: 12,
    inputs: [],
    compaction: null,
    steps: [step(900), step(null)],
    finishReason: null,
    error: null,
    usage: null,
  }
  expect(liveTokens(trace, context())).toBe(900)
  expect(liveTokens(undefined, context())).toBe(300)
  expect(liveTokens(undefined, null)).toBeUndefined()
})

it('turns orange past 60% of the window and red past 85%', () => {
  const fills = [100_000, 600_000, 900_000].map((tokens) => fullnessOf({ tokens, windowTokens: 1_000_000 }))
  expect(fills).toEqual(['roomy', 'filling', 'full'])
})

it('writes thousands and millions with one decimal and drops a trailing zero', () => {
  expect([950, 15_826, 128_000, 1_000_000, 1_048_576].map(tokensLabel)).toEqual(['950', '15.8k', '128k', '1M', '1M'])
})
