import type { TextStreamPart, ToolSet } from 'ai'
import type { Compaction, Trace, TraceStep } from '../shared/debug'
import { clip } from './textWindow'
import { usageOf } from './usage'

const SHOWN_CHARS = 2000 // of each input, output and paragraph: enough to see what happened, small enough to send each step

/** What the caller of a run knows before it starts. */
export interface TraceStart {
  title: string
  inputs: string[]
  compaction: Compaction | null
}

export function startTrace(id: string, maxSteps: number, start: TraceStart, now: number): Trace {
  return {
    id,
    maxSteps,
    title: start.title,
    inputs: start.inputs.map((input) => clip(input, SHOWN_CHARS)),
    compaction: start.compaction,
    startedAt: now,
    endedAt: null,
    steps: [],
    finishReason: null,
    error: null,
    usage: null,
  }
}

/** The trace with one stream part folded in; the same object for the parts it does not record. */
export function traceWith(trace: Trace, part: TextStreamPart<ToolSet>, now: number): Trace {
  switch (part.type) {
    case 'start-step':
      return { ...trace, steps: [...trace.steps, { startedAt: now, endedAt: null, calls: [], text: '', usage: null }] }
    case 'text-start': // each paragraph becomes its own message: keep them apart here too
      return withLastStep(trace, (step) => (step.text ? { ...step, text: `${step.text}\n\n` } : step))
    case 'text-delta':
      return withLastStep(trace, (step) => ({ ...step, text: clip(step.text + part.text, SHOWN_CHARS) }))
    case 'tool-call': {
      const call = { id: part.toolCallId, name: part.toolName, input: shown(part.input ?? {}), output: null }
      return withLastStep(trace, (step) => ({
        ...step,
        calls: [...step.calls, { ...call, outputChars: 0, isError: false }],
      }))
    }
    case 'tool-result':
      return withOutput(trace, part.toolCallId, part.toolName, part.output, false)
    case 'tool-error':
      return withOutput(trace, part.toolCallId, part.toolName, String(part.error), true)
    case 'finish-step':
      return withLastStep(trace, (step) => ({ ...step, endedAt: now, usage: usageOf(part.usage) }))
    case 'finish':
      return { ...trace, finishReason: part.finishReason, usage: usageOf(part.totalUsage) }
    default:
      return trace
  }
}

/** The trace of a run that is over: a step cut off by a failure or a stop ends with it. */
export function endTrace(trace: Trace, now: number, error: string | null): Trace {
  const steps = trace.steps.map((step) => (step.endedAt === null ? { ...step, endedAt: now } : step))
  return { ...trace, steps, endedAt: now, error }
}

function withLastStep(trace: Trace, change: (step: TraceStep) => TraceStep): Trace {
  const last = trace.steps.at(-1)
  return last ? { ...trace, steps: [...trace.steps.slice(0, -1), change(last)] } : trace
}

function withOutput(trace: Trace, callId: string, name: string, output: unknown, isError: boolean): Trace {
  const text = typeof output === 'string' ? output : (JSON.stringify(output) ?? '')
  const result = { output: clip(text, SHOWN_CHARS), outputChars: text.length, isError }
  return withLastStep(trace, (step) => {
    const isKnown = step.calls.some((call) => call.id === callId)
    // a call the model got wrong may fail before it was ever reported as a call
    const calls = isKnown
      ? step.calls.map((call) => (call.id === callId ? { ...call, ...result } : call))
      : [...step.calls, { id: callId, name, input: '', ...result }]
    return { ...step, calls }
  })
}

const shown = (value: unknown) => clip(JSON.stringify(value) ?? '', SHOWN_CHARS)
