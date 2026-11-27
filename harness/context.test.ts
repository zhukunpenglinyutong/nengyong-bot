import { tool } from 'ai'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { describeContext, withMeasure } from './context'

const remember = tool({ description: '记住', inputSchema: z.object({ text: z.string() }), execute: async () => 'ok' })
const context = () =>
  describeContext(
    {
      model: 'deepseek-chat',
      windowTokens: 131_072,
      sections: [{ heading: null, text: 'x'.repeat(100) }],
      entries: [
        { seq: 5, at: 0, kind: 'user', text: '你好' },
        { seq: 6, at: 0, kind: 'tool', name: 'remember', input: {} },
        { seq: 7, at: 0, kind: 'bot', text: '好' },
      ],
      messages: [
        { role: 'user', content: '你好' },
        {
          role: 'user',
          content: [
            { type: 'text', text: '看图' },
            { type: 'image', image: 'aGk=' },
          ],
        },
      ],
      tools: { remember },
      keepRecent: 40,
      compactAbove: 80,
    },
    0.5,
  )

it('keeps the transcript as the model reads it, counted by kind, leaving images to the API', () => {
  expect(context().transcript).toEqual({
    from: 5,
    to: 7,
    messages: [
      { role: 'user', text: '你好' },
      { role: 'user', text: '看图' },
    ],
    counts: { user: 1, bot: 1, tool: 1, 'from-bot': 0, routine: 0, 'task-result': 0, 'skill-answer': 0 },
  })
})

it('measures a tool by its name, description and input schema', () => {
  expect(context().tools.definitions).toEqual([{ name: 'remember', description: '记住' }])
  expect(context().tools.chars).toBeGreaterThan('remember记住'.length)
})

it('converts at the counted rate once the API has counted the first step', () => {
  const measured = withMeasure(context(), { input: 1000, cached: 0, output: 1 })
  const chars = 100 + 4 + measured.tools.chars
  expect(measured.tokensPerChar).toBeCloseTo(1000 / chars)
  expect(measured.measured).toEqual({ input: 1000, cached: 0, output: 1 })
})
