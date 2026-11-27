import type { Entry } from '../../shared/bridge'
import type { ContextMessage, ContextView, Trace } from '../../shared/debug'
import { DEEPSEEK_MODEL } from '../../shared/modelServices'
import { strings } from '../../shared/strings'

const words = strings().demo

const DEMO_TOOLS = [
  {
    name: 'remember',
    description: words.debugTools.remember,
  },
  {
    name: 'forget',
    description: words.debugTools.forget,
  },
  {
    name: 'propose_duty',
    description: words.debugTools.proposeDuty,
  },
  {
    name: 'update_my_name',
    description: words.debugTools.updateMyName,
  },
  {
    name: 'create_bot',
    description: words.debugTools.createBot,
  },
  {
    name: 'create_routine',
    description: words.debugTools.createRoutine,
  },
  {
    name: 'start_task',
    description: words.debugTools.startTask,
  },
]

/** What debug mode shows for a demo bot's chat: a short system prompt and its canned transcript. */
export function demoContext(entries: Entry[]): ContextView {
  const kinds = (kind: Entry['kind']) => entries.filter((entry) => entry.kind === kind).length
  return {
    model: DEEPSEEK_MODEL,
    windowTokens: 131_072,
    sections: [
      {
        heading: null,
        text: words.debugPrompt.intro,
      },
      {
        heading: words.debugPrompt.jobHeading,
        text: words.debugPrompt.job,
      },
      {
        heading: words.debugPrompt.userHeading,
        text: words.debugPrompt.userFacts,
      },
      {
        heading: words.debugPrompt.memoryHeading,
        text: words.debugPrompt.memories,
      },
      {
        heading: words.debugPrompt.workHeading,
        text: words.debugPrompt.workRules,
      },
    ],
    transcript: {
      from: entries[0]?.seq ?? 0,
      to: entries.at(-1)?.seq ?? 0,
      messages: entries.flatMap((entry): ContextMessage[] =>
        'text' in entry ? [{ role: entry.kind === 'bot' ? 'assistant' : 'user', text: entry.text }] : [],
      ),
      counts: {
        user: kinds('user'),
        bot: kinds('bot'),
        'from-bot': kinds('from-bot'),
        routine: kinds('routine'),
        'task-result': kinds('task-result'),
        'skill-answer': kinds('skill-answer'),
        'duty-answer': kinds('duty-answer'),
        tool: kinds('tool'),
      },
    },
    tools: { definitions: DEMO_TOOLS, chars: 4200 },
    keepRecent: 40,
    compactAbove: 80,
    tokensPerChar: 0.5,
    measured: null,
  }
}

/** The demo's one fixed turn as it would be reported: started, a history search, the reply, the end. */
export function demoTraces(botId: string, text: string, startedAt: number): Trace[] {
  const base: Trace = {
    id: botId,
    title: words.debugTrace.title,
    startedAt,
    endedAt: null,
    maxSteps: 12,
    inputs: [words.debugTrace.input(text)],
    compaction: { pending: 3, threshold: 80, folded: 0 },
    steps: [],
    finishReason: null,
    error: null,
    usage: null,
  }
  const call = {
    id: 'c1',
    name: 'search_history',
    input: words.debugTrace.searchQuery,
    isError: false,
  }
  const searched = {
    startedAt,
    endedAt: startedAt + 400,
    calls: [{ ...call, output: '[]', outputChars: 2 }],
    text: '',
    usage: { input: 2310, cached: 1980, output: 24 },
  }
  const replied = {
    startedAt: startedAt + 420,
    endedAt: startedAt + 1100,
    calls: [],
    text: words.debugTrace.reply,
    usage: { input: 2380, cached: 2304, output: 31 },
  }
  return [
    base,
    {
      ...base,
      steps: [{ ...searched, endedAt: null, calls: [{ ...call, output: null, outputChars: 0 }], usage: null }],
    },
    { ...base, steps: [searched] },
    {
      ...base,
      steps: [searched, replied],
      endedAt: startedAt + 1100,
      finishReason: 'stop',
      usage: { input: 4690, cached: 4284, output: 55 },
    },
  ]
}
