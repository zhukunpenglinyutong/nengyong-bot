import { generateText } from 'ai'
import type { AttachmentFile } from '../shared/attachment'
import type { BotModels, Entry, HarnessEvent, Quote } from '../shared/bridge'
import { type Compaction, type ContextView, joinSections } from '../shared/debug'
import type { Limits } from '../shared/limits'
import { currentLanguage, type Language } from '../shared/language'
import { strings } from '../shared/strings'
import { latestVersion } from '../shared/miniApp'
import type { ModelChoice } from '../shared/modelServices'
import { newId } from '../shared/newId'
import { saveAttachments } from './attachments'
import { chatTools } from './chatTools'
import { describeContext, GUESSED_TOKENS_PER_CHAR, withMeasure } from './context'
import { describeError, NoKeyError } from './describeError'
import { historyTools } from './historyTools'
import type { Mcp } from './mcp'
import { miniAppOf } from './miniApps'
import { modelTools } from './modelTools'
import { systemSections } from './prompt'
import { type ModelChoices, type ModelObject, modelIdOf, runModel } from './runModel'
import { sessionHeaders } from './sessionHeaders'
import type { Skills } from './skills'
import { skillChatTools } from './skillTools'
import type { Store } from './store'
import { createTaskRunner, RECENT_TASKS } from './tasks'
import { clip } from './textWindow'
import { entryText, speaker, toMessages } from './transcriptText'
import { runTurn } from './turn'
import type { EntryInput } from './types'
import { usageOf } from './usage'
import type { Workspace } from './workspace'

const QUOTE_CHARS = 200 // of a quoted message: enough to tell which one it is; its ref opens the rest

interface HarnessOptions {
  store: Store
  workspace: Workspace
  getModel: () => ModelObject | null // the main model; null = none chosen yet
  models: ModelChoices
  searchKey: () => string | null
  windowTokensOf: (model: string) => number
  mcp: Mcp
  skills: Skills
  emit: (e: HarnessEvent) => void
  limits: () => Limits // read at the start of every turn and task: a change applies from the next one
}

/** Inputs waiting for a bot's running turn to end (user messages, task results); the next turn reads them all at once. */
interface Batch {
  inputs: EntryInput[]
  turn: Promise<void>
  isShown: boolean // its user messages are on screen as queued; false when the turn starts right away
}

// the model reads it whatever the app's language; the summary comes in the app's language
const SUMMARY_INSTRUCTIONS: Record<Language, string> = {
  zh: '把对话压缩成中文要点摘要：保留决定、约定、待办、事实和数字，去掉寒暄。只输出摘要。',
  en: '把对话压缩成英文要点摘要：保留决定、约定、待办、事实和数字，去掉寒暄。只输出摘要。',
}

// a message of attachments only still shows up as a queued bubble
const queuedTexts = (inputs: EntryInput[]) =>
  inputs.flatMap((input) => (input.kind === 'user' ? [input.text || strings().harness.chat.attachment] : []))

export function createHarness(options: HarnessOptions) {
  const { store, workspace, getModel, limits } = options
  let isDebug = false // context and trace events cost a copy of the prompt and of every step: sent only while someone looks
  const emit = (event: HarnessEvent) => {
    if (isDebug || (event.kind !== 'context' && event.kind !== 'trace')) options.emit(event)
  }
  const queues = new Map<string, Promise<unknown>>()
  const inFlight = new Map<string, number>() // waiting + running turns per bot
  const batches = new Map<string, Batch>() // per bot: the waiting turn that later messages join
  const replies = new Map<string, { runId: string; stop: AbortController }>() // per bot: the running turn, which the user can stop
  const track = (id: string, d: number) => inFlight.set(id, (inFlight.get(id) ?? 0) + d)
  const tasks = createTaskRunner({ ...options, emit, deliver })
  const tokensPerChar = new Map<string, number>() // per bot, from the API's count of its last turn
  const lineOf = (entry: Entry, botName: string) => `${speaker(entry, store.get(), botName)}：${entryText(entry)}`

  async function compact(
    botId: string,
    model: ModelObject,
    runId: string,
    abortSignal: AbortSignal,
  ): Promise<Compaction> {
    const bot = store.get().bots[botId]
    const { keepRecent, compactAbove } = recentWindow()
    const pending = store.range(botId, bot.summarizedUpTo + 1)
    const old = pending.slice(0, -keepRecent)
    const lastFolded = old.at(-1)
    const skipped = { pending: pending.length, threshold: compactAbove, folded: 0 }
    if (pending.length <= compactAbove || !lastFolded) return skipped
    const lines = old.map((entry) => lineOf(entry, bot.name))
    const { text, usage } = await generateText({
      model,
      system: SUMMARY_INSTRUCTIONS[currentLanguage()],
      prompt: [bot.summary && `已有摘要：\n${bot.summary}`, `新增对话：\n${lines.join('\n')}`]
        .filter(Boolean)
        .join('\n\n'),
      headers: sessionHeaders(botId),
      abortSignal,
    })
    const counted = usageOf(usage)
    if (counted)
      store.addUsage({ at: Date.now(), runId, transcriptId: botId, botId, model: modelIdOf(model), ...counted })
    store.updateBot(botId, { summary: text.trim(), summarizedUpTo: lastFolded.seq })
    return { ...skipped, folded: old.length }
  }

  /** What a chat turn of this bot sends the model, built from the store as it is now. */
  function chatInput(botId: string) {
    const state = store.get()
    const bot = state.bots[botId]
    const entries = store.range(botId, bot.summarizedUpTo + 1)
    const current = limits()
    const tasksOfBot = store.tasksRequestedBy(botId, RECENT_TASKS + current.endedTasksShown)
    const main = modelName(getModel())
    const model = bot.model?.model ?? main
    const sections = systemSections(
      state,
      store.sidebar(),
      bot,
      tasksOfBot,
      options.mcp.configured(),
      current.endedTasksShown,
      { main, chat: bot.model, tasks: bot.taskModel, accounts: options.models.accounts() },
    )
    const messages = toMessages(botId, entries, state, workspace)
    const tools = {
      ...chatTools({ botId, store, emit, tasks, limits: current, models: options.models }),
      ...modelTools({ botId, store, emit, choices: options.models, onBotModels: showModels }),
      ...skillChatTools({ botId, store, skills: options.skills }),
      ...historyTools(store, current),
    }
    const parts = { model, windowTokens: options.windowTokensOf(model), sections, entries, messages, tools }
    const context = describeContext(
      { ...parts, ...recentWindow() },
      tokensPerChar.get(botId) ?? GUESSED_TOKENS_PER_CHAR,
    )
    return { system: joinSections(sections), messages, tools, context }
  }

  /** One turn: record the inputs, let the model work with tools, and stream every paragraph it writes as its own message. */
  async function run(botId: string, inputs: EntryInput[]) {
    const main = getModel()
    if (!main) throw new NoKeyError()
    const brain = store.get().bots[botId]
    if (!brain) throw new Error(strings().harness.unknownBot(botId))
    const read = inputs.map((input) => store.append(botId, input))
    for (const entry of read) emit({ kind: 'entry', botId, entry })
    const runId = newId('run')
    emit({ kind: 'busy', botId, busy: true, runId })
    const stop = new AbortController()
    replies.set(botId, { runId, stop })
    try {
      const compaction = await compact(botId, main, runId, stop.signal)
      const { system, messages, tools, context } = chatInput(botId)
      let counted: ContextView = context
      emit({ kind: 'context', botId, context })
      const maxSteps = limits().chatSteps
      const { finishReason } = await runTurn({
        store,
        botId,
        transcriptId: botId,
        runId,
        model: runModel(main, brain.model, options.models),
        system,
        messages,
        tools,
        maxSteps,
        silenceSeconds: limits().modelSilenceSeconds,
        stopSignal: stop.signal,
        onStreaming: (text) => emit({ kind: 'streaming', botId, text }),
        onEntry: (entry) => emit({ kind: 'entry', botId, entry }),
        onActivity: (activity) => emit({ kind: 'activity', botId, activity }),
        trace: {
          title: strings().harness.chat.traceTitle,
          inputs: read.map((entry) => lineOf(entry, brain.name)),
          compaction,
        },
        onTrace: (trace) => {
          emit({ kind: 'trace', botId, trace })
          const usage = trace.steps[0]?.usage
          if (!usage || counted.measured) return
          counted = withMeasure(counted, usage)
          tokensPerChar.set(botId, counted.tokensPerChar)
          emit({ kind: 'context', botId, context: counted })
        },
      })
      if (isDebug) emit({ kind: 'context', botId, context: chatInput(botId).context }) // with this turn's reply in it
      if (finishReason === 'tool-calls') throw new Error(strings().harness.chat.outOfSteps(maxSteps))
    } catch (error) {
      if (!stop.signal.aborted) throw error
    } finally {
      replies.delete(botId)
      emit({ kind: 'busy', botId, busy: false, runId })
    }
  }

  /** Turns of the same bot run one after another; different bots run in parallel. Inputs are read when the turn starts. */
  function enqueue(botId: string, inputs: () => EntryInput[]): Promise<void> {
    track(botId, 1)
    const turn = (queues.get(botId) ?? Promise.resolve())
      .catch(() => undefined) // a failed turn has already reported its error; the next one runs regardless
      .then(() => run(botId, inputs()))
      .then(
        () => undefined,
        (error: unknown) => emit({ kind: 'error', botId, ...describeError(error) }),
      )
      .finally(() => track(botId, -1))
    queues.set(botId, turn)
    return turn
  }

  /**
   * Inputs that arrive while a turn runs wait for the next turn, which reads them all at once: a burst gets one reply.
   * They are recorded only when that turn starts; recorded earlier, they would land between the paragraphs of the
   * running reply, and the model would take them as already answered.
   */
  function deliver(botId: string, input: EntryInput): Promise<void> {
    const waiting = batches.get(botId)
    const batch = waiting ? { ...waiting, inputs: [...waiting.inputs, input] } : openBatch(botId, [input])
    batches.set(botId, batch)
    if (batch.isShown && input.kind === 'user') emit({ kind: 'queued', botId, texts: queuedTexts(batch.inputs) })
    return batch.turn
  }

  /** A turn that reads what is already recorded (the answer to an install card): the waiting turn, or a new one. */
  function wake(botId: string): Promise<void> {
    return (batches.get(botId) ?? openBatch(botId, [])).turn
  }

  /** The next turn of this bot, which later inputs join until it starts. */
  function openBatch(botId: string, inputs: EntryInput[]): Batch {
    const isShown = Boolean(inFlight.get(botId))
    const turn = enqueue(botId, () => {
      const batch = batches.get(botId)
      batches.delete(botId)
      const read = batch?.inputs ?? []
      if (batch?.isShown && queuedTexts(read).length) emit({ kind: 'queued', botId, texts: [] })
      return read
    })
    const batch = { inputs, turn, isShown }
    batches.set(botId, batch)
    return batch
  }

  /** How many entries a chat sends verbatim; past twice as many, the older ones are folded into the bot's summary. */
  function recentWindow() {
    const keepRecent = limits().recentEntries
    return { keepRecent, compactAbove: keepRecent * 2 }
  }

  /** What its panel shows of the models it works with. */
  function botModels(botId: string): BotModels {
    const main = getModel()
    const bot = store.get().bots[botId]
    const shown = (choice: ModelChoice | undefined) =>
      choice ? { model: choice.model, isGone: options.models.modelOf(choice) === null } : null
    return { main: main && modelIdOf(main), chat: shown(bot?.model), tasks: shown(bot?.taskModel) }
  }

  function showModels(botId: string) {
    emit({ kind: 'models', botId, models: botModels(botId) })
  }

  function quoteOf(botId: string, seq: number): Quote {
    const [entry] = store.range(botId, seq, seq)
    if (!entry || !('text' in entry)) throw new Error(strings().harness.chat.quoteMissing)
    return { seq, text: clip(entry.text, QUOTE_CHARS) }
  }

  function miniAppRef(botId: string, id: string, isSentByApp: boolean) {
    const app = miniAppOf(store, botId, id)
    return { id, name: app.name, version: latestVersion(app).version, isSentByApp }
  }

  return {
    send(
      botId: string,
      text: string,
      files: AttachmentFile[] = [],
      quoteSeq: number | null = null,
      miniAppId: string | null = null,
    ) {
      const quote = quoteSeq === null ? undefined : quoteOf(botId, quoteSeq)
      const miniApp = miniAppId === null ? undefined : miniAppRef(botId, miniAppId, false)
      const attachments = saveAttachments(workspace, files)
      return deliver(botId, {
        kind: 'user',
        text,
        ...(attachments.length ? { attachments } : {}),
        ...(quote ? { quote } : {}),
        ...(miniApp ? { miniApp } : {}),
      })
    },
    /** nengyongbot.ask: the page sends its bot a message in the user's name, marked as coming from it. */
    askFromMiniApp(botId: string, miniAppId: string, text: string) {
      return deliver(botId, { kind: 'user', text, miniApp: miniAppRef(botId, miniAppId, true) })
    },
    startRoutine: tasks.startRoutine,
    /** For debug mode: null for a bot the harness does not know (yet). */
    context: (botId: string): ContextView | null => (store.get().bots[botId] ? chatInput(botId).context : null),
    setDebug(isOn: boolean) {
      isDebug = isOn
    },
    startWaitingTasks: tasks.startWaiting,
    botModels,
    /** The main model or the accounts changed: every bot's panel shows what it runs on now. */
    modelsChanged() {
      for (const botId of store.get().roster) showModels(botId)
    },
    /**
     * The user answered an install card in this bot's chat. The answer is recorded at once, not with the next turn: the
     * card shows it from then on, whatever becomes of that turn, in which the bot reads it and says so.
     */
    answerSkillOffer(botId: string, offer: string, names: string[]) {
      const answered = options.skills.answer(botId, offer, names)
      const entry = store.append(botId, { kind: 'skill-answer', offer, ...answered })
      emit({ kind: 'entry', botId, entry })
      void wake(botId)
    },
    /**
     * Stops the turn the user saw running, keeping what it wrote so far; a stop that comes after that turn ended leaves
     * the next one alone. Messages queued behind it still get their turn.
     */
    stopReply(botId: string, runId: string) {
      const running = replies.get(botId)
      if (running?.runId === runId) running.stop.abort()
    },
    stopTask(botId: string, taskId: string) {
      if (store.task(taskId)?.botId !== botId) throw new Error(strings().harness.noRunningTask(taskId))
      tasks.stop(taskId)
    },
  }
}

const modelName = (model: ModelObject | null) => (model === null ? strings().harness.chat.noModel : modelIdOf(model))
