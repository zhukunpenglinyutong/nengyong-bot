import type { ModelMessage, ToolSet } from 'ai'
import { z } from 'zod'
import type { Entry } from '../shared/bridge'
import type { ContextView, PromptSection } from '../shared/debug'
import type { TokenCounts } from '../shared/usage'

// before the API has counted a turn: DeepSeek counts about 0.6 tokens per Chinese character and 0.3 per English one
export const GUESSED_TOKENS_PER_CHAR = 0.5

interface ContextParts {
  model: string
  windowTokens: number
  sections: PromptSection[]
  entries: Entry[] // the transcript after the summary
  messages: ModelMessage[] // the same entries as the model reads them
  tools: ToolSet
  keepRecent: number
  compactAbove: number
}

/** What a chat turn sends the model, measured in characters; tokens come from the API's count of an earlier turn. */
export function describeContext(parts: ContextParts, tokensPerChar: number): ContextView {
  const { entries, tools } = parts
  return {
    model: parts.model,
    windowTokens: parts.windowTokens,
    sections: parts.sections,
    transcript: {
      from: entries[0]?.seq ?? 0,
      to: entries.at(-1)?.seq ?? 0,
      messages: parts.messages.map((message) => ({ role: message.role, text: messageText(message) })),
      counts: countKinds(entries),
    },
    tools: {
      definitions: Object.entries(tools).map(([name, tool]) => ({
        name,
        description: typeof tool.description === 'string' ? tool.description : '',
      })),
      chars: sum(Object.entries(tools).map(([name, tool]) => name.length + toolChars(tool))),
    },
    keepRecent: parts.keepRecent,
    compactAbove: parts.compactAbove,
    tokensPerChar,
    measured: null,
  }
}

/** The context once the API has counted its first step: from then on its characters convert at the counted rate. */
export function withMeasure(context: ContextView, usage: TokenCounts): ContextView {
  const chars = contextChars(context)
  return { ...context, measured: usage, tokensPerChar: chars ? usage.input / chars : context.tokensPerChar }
}

const contextChars = (context: ContextView) =>
  sum([...context.sections, ...context.transcript.messages].map((part) => part.text.length)) + context.tools.chars

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

// images and files are counted by the API, not here: the estimate covers the text
function messageText({ content }: ModelMessage): string {
  if (typeof content === 'string') return content
  return content.map((part) => (part.type === 'text' ? part.text : '')).join('')
}

function toolChars(tool: ToolSet[string]): number {
  const schema =
    tool.inputSchema instanceof z.ZodType ? z.toJSONSchema(tool.inputSchema, { unrepresentable: 'any' }) : {}
  return (tool.description?.length ?? 0) + JSON.stringify(schema).length
}

const NO_ENTRIES: Record<Entry['kind'], number> = {
  user: 0,
  bot: 0,
  'from-bot': 0,
  routine: 0,
  'task-result': 0,
  'skill-answer': 0,
  'duty-answer': 0,
  tool: 0,
}

function countKinds(entries: Entry[]): Record<Entry['kind'], number> {
  return entries.reduce((counts, entry) => ({ ...counts, [entry.kind]: counts[entry.kind] + 1 }), NO_ENTRIES)
}
