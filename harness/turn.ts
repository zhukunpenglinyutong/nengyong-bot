import { type FinishReason, type ModelMessage, stepCountIs, streamText, type ToolSet } from 'ai'
import { z } from 'zod'
import type { Activity, Entry, HarnessEvent } from '../shared/bridge'
import type { Trace } from '../shared/debug'
import { strings } from '../shared/strings'
import { libraryItems } from './library'
import type { RunModel } from './runModel'
import type { Store } from './store'
import { sessionHeaders } from './sessionHeaders'
import { endTrace, startTrace, type TraceStart, traceWith, usageOf } from './trace'
import type { Workspace } from './workspace'

interface TurnOptions {
  store: Store
  workspace: Workspace
  emit: (event: HarnessEvent) => void
  botId: string
  transcriptId: string
  runId: string // what the 用量 page counts as one chat turn or task
  model: RunModel
  system: string
  messages: ModelMessage[]
  tools: ToolSet
  maxSteps: number
  silenceSeconds: number // the model sending nothing for this long ends the run with an error
  abortSignal?: AbortSignal // ends the run at once, tool calls under way included: a task stopped or timed out
  stopSignal?: AbortSignal // the user stopped the reply: it ends once the tool calls under way have recorded their results
  onDraft?: (text: string) => void
  onEntry?: (entry: Entry) => void
  onActivity?: (activity: Activity) => void
  trace: TraceStart
  onTrace: (trace: Trace) => void // at the start, after every recorded part but the streamed text, and at the end
}

interface Paragraph {
  seq: number
  text: string
}

/**
 * One model run with tools: each paragraph it writes and each tool result is recorded in the transcript.
 * `finishReason` is 'tool-calls' when the step limit cut it off mid-work, undefined when it was aborted.
 */
export async function runTurn(options: TurnOptions): Promise<{ said: Paragraph[]; finishReason?: FinishReason }> {
  const { store, transcriptId, onDraft = () => {}, onEntry = () => {}, onActivity = () => {} } = options
  const said: Paragraph[] = []
  let finishReason: FinishReason | undefined
  let draft = ''
  let requestId: string | undefined
  const flush = () => {
    const text = draft.trim()
    draft = ''
    onDraft('')
    if (!text) return
    const model = options.model.name()
    const fallbackFrom = options.model.fallbackFrom()
    const entry = store.append(transcriptId, {
      kind: 'bot',
      text,
      model,
      ...(fallbackFrom ? { fallbackFrom } : {}),
      ...(requestId ? { requestId } : {}),
    })
    said.push({ seq: entry.seq, text })
    onEntry(entry)
  }
  const recordTool = (name: string, input: unknown, output: unknown) => {
    onEntry(store.append(transcriptId, { kind: 'tool', name, input, output }))
    if (name === 'write_file')
      options.emit({
        kind: 'library',
        botId: options.botId,
        library: libraryItems(store, options.workspace, options.botId),
      })
  }
  let trace = startTrace(transcriptId, options.maxSteps, options.trace, Date.now())
  let failure: string | null = null
  options.onTrace(trace)
  const silenceMs = options.silenceSeconds * 1000
  const halt = new AbortController() // ends a stopped reply once no tool call is under way
  const toolCallsUnderWay = new Set<string>()
  const haltIfIdle = () => {
    if (options.stopSignal?.aborted && toolCallsUnderWay.size === 0) halt.abort()
  }
  options.stopSignal?.addEventListener('abort', haltIfIdle, { once: true })
  try {
    const result = streamText({
      model: options.model.model,
      system: options.system,
      messages: options.messages,
      tools: options.tools,
      stopWhen: stepCountIs(options.maxSteps),
      abortSignal: options.abortSignal ? AbortSignal.any([options.abortSignal, halt.signal]) : halt.signal,
      timeout: { firstChunkMs: silenceMs, chunkMs: silenceMs },
      headers: sessionHeaders(transcriptId),
      include: { rawChunks: true },
    })
    for await (const part of result.fullStream) {
      const next = traceWith(trace, part, Date.now())
      if (next !== trace && part.type !== 'text-delta') options.onTrace(next)
      trace = next
      switch (part.type) {
        case 'start-step':
          requestId = undefined
          break
        case 'raw':
          requestId ??= ResponseChunk.safeParse(part.rawValue).data?.id
          break
        case 'text-delta':
          if (!draft) onActivity({ kind: 'typing' })
          draft += part.text
          onDraft(draft)
          break
        case 'text-end':
          flush()
          break
        case 'reasoning-start':
          onActivity({ kind: 'thinking' })
          break
        case 'tool-input-start':
          onActivity({ kind: 'tool', tool: part.toolName })
          break
        case 'tool-call':
          toolCallsUnderWay.add(part.toolCallId)
          onActivity({ kind: 'tool', tool: part.toolName })
          break
        case 'tool-result':
          recordTool(part.toolName, part.input, part.output)
          toolCallsUnderWay.delete(part.toolCallId)
          haltIfIdle()
          break
        case 'tool-error':
          recordTool(part.toolName, part.input, { error: String(part.error) })
          toolCallsUnderWay.delete(part.toolCallId)
          haltIfIdle()
          break
        case 'finish-step': {
          const usage = usageOf(part.usage)
          if (usage) {
            const { botId, runId } = options
            store.addUsage({ at: Date.now(), runId, transcriptId, botId, model: options.model.name(), ...usage })
          }
          break
        }
        case 'finish':
          finishReason = part.finishReason
          break
        case 'error':
          throw part.error
        case 'abort': // the SDK ends a timed-out stream as aborted, like one the caller aborted
          if (!options.abortSignal?.aborted && !halt.signal.aborted)
            throw new Error(strings().harness.modelSilent(options.silenceSeconds))
          break
        default: // the SDK streams many more part kinds; none of the others is shown or recorded
      }
    }
    flush()
    const broken = finishReason && brokenFinish()[finishReason]
    if (broken) throw new Error(broken)
    return { said, finishReason }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    flush() // keep whatever was streamed before a failure
    options.onTrace(endTrace(trace, Date.now(), failure))
  }
}

// the stream ended without a normal finish and usually without an error part: say why instead of going quiet
const brokenFinish = (): Partial<Record<FinishReason, string>> => ({
  interrupted: strings().harness.brokenFinish.interrupted,
  error: strings().harness.brokenFinish.error,
  'content-filter': strings().harness.brokenFinish.contentFilter,
})

// the SDK reports the API's response id only when a step ends, after its paragraphs are recorded; every OpenAI-compatible chunk carries it
const ResponseChunk = z.object({ id: z.string().min(1) })
