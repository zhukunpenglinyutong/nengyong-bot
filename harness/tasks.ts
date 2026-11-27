import { type HarnessEvent, isUnfinished, type TaskView } from '../shared/bridge'
import type { Limits } from '../shared/limits'
import { strings } from '../shared/strings'
import { newId } from '../shared/newId'
import { describeError, NoKeyError } from './describeError'
import { historyTools } from './historyTools'
import type { Mcp } from './mcp'
import { miniAppTools } from './miniApps'
import { taskSystem } from './prompt'
import { type ModelChoices, type ModelObject, type RunModel, runModel } from './runModel'
import type { Skills } from './skills'
import { skillTaskTools } from './skillTools'
import type { Store } from './store'
import { clip } from './textWindow'
import { runTurn } from './turn'
import type { EntryInput, Task } from './types'
import { workTools } from './workTools'
import type { Workspace } from './workspace'

export const RECENT_TASKS = 20
const TIMED_OUT = 'timed-out'

interface TaskRunnerOptions {
  store: Store
  workspace: Workspace
  getModel: () => ModelObject | null // the main model
  models: ModelChoices
  getApiKey: () => string | null
  mcp: Mcp
  skills: Skills
  emit: (event: HarnessEvent) => void
  deliver: (botId: string, input: EntryInput) => void
  limits: () => Limits
}

type NewTask = Pick<Task, 'botId' | 'requestedBy' | 'source' | 'title' | 'flowId' | 'miniAppId' | 'model'> & {
  brief: string
}

/** Runs tasks in the background, a few at a time; each hands its conclusion to the chat that started it. */
export function createTaskRunner(options: TaskRunnerOptions) {
  const { store, workspace, getModel, getApiKey, emit, deliver, limits } = options
  const running = new Map<string, AbortController>()
  let waiting: string[] = []
  const publish = (botId: string) => emit({ kind: 'tasks', botId, tasks: taskViews(store, botId) })
  for (const task of store.unfinishedTasks()) {
    store.saveTask({ ...task, status: 'interrupted', endedAt: Date.now() })
    store.append(task.requestedBy, {
      kind: 'task-result',
      taskId: task.id,
      title: task.title,
      status: 'failed',
      text: strings().harness.tasks.interrupted,
      flowId: task.flowId,
    })
  }

  function start({ brief, ...fields }: NewTask): Task {
    const status = running.size < limits().runningTasks ? 'running' : 'waiting'
    const bot = store.get().bots[fields.botId]
    const flow = bot?.flows.find((candidate) => candidate.id === fields.flowId)
    const model = fields.model ?? flow?.model ?? bot?.taskModel
    const task: Task = { ...fields, model, id: newId('t'), status, statusText: '', createdAt: Date.now() }
    store.saveTask(task)
    store.append(task.id, { kind: 'from-bot', from: task.requestedBy, text: brief })
    publish(task.botId)
    if (status === 'running') launch(task)
    else waiting = [...waiting, task.id]
    return task
  }

  function startRoutine(botId: string, routineId: string) {
    const routine = store.get().bots[botId]?.routines.find((candidate) => candidate.id === routineId)
    if (!routine?.isEnabled) return
    const isRunning = store
      .unfinishedTasks()
      .some((task) => task.source.kind === 'routine' && task.source.routineId === routineId)
    if (isRunning) return
    const source = { kind: 'routine', routineId } as const
    const { name: title, prompt: brief, flowId, model } = routine
    start({ botId, requestedBy: botId, source, title, brief, flowId, model })
  }

  function launch(task: Task) {
    const controller = new AbortController()
    running.set(task.id, controller)
    const timer = setTimeout(() => controller.abort(TIMED_OUT), limits().taskTimeoutMinutes * 60_000)
    work(task, controller.signal)
      .finally(() => {
        clearTimeout(timer)
        running.delete(task.id)
        startWaiting()
      })
      .catch((error: unknown) => console.error('task bookkeeping failed:', error))
  }

  /** Starts waiting tasks while there is room: when one ends, and when the limit is raised. */
  function startWaiting() {
    while (running.size < limits().runningTasks) {
      const [id, ...rest] = waiting
      if (!id) return
      waiting = rest
      const task = store.task(id)
      if (task?.status !== 'waiting') continue
      const started: Task = { ...task, status: 'running' }
      store.saveTask(started)
      publish(started.botId)
      launch(started)
    }
  }

  async function work(task: Task, abortSignal: AbortSignal) {
    const main = getModel()
    const run = main && runModel(main, task.model, options.models)
    try {
      if (!run) throw new NoKeyError()
      const { said, finishReason } = await runTask(task, run, abortSignal)
      if (abortSignal.aborted) return endAborted(task.id, abortSignal, run)
      const conclusion = said.at(-1)
      if (finishReason === 'tool-calls') return finish(task.id, 'failed', outOfSteps(task.id), run)
      if (!conclusion) return finish(task.id, 'failed', strings().harness.tasks.noConclusion, run)
      finish(task.id, 'done', resultText(task.id, conclusion, limits().taskResultChars), run)
    } catch (error) {
      if (abortSignal.aborted) return endAborted(task.id, abortSignal, run)
      finish(task.id, 'failed', clip(describeError(error).message, limits().taskResultChars), run)
    }
  }

  function endAborted(taskId: string, abortSignal: AbortSignal, run: RunModel | null) {
    if (abortSignal.reason === TIMED_OUT) finish(taskId, 'failed', strings().harness.tasks.timedOut, run)
  }

  function outOfSteps(taskId: string): string {
    const lastStatus = store.task(taskId)?.statusText
    return strings().harness.tasks.outOfSteps(lastStatus)
  }

  async function runTask(task: Task, model: RunModel, abortSignal: AbortSignal) {
    const mcp = await options.mcp.toolbox()
    const current = limits()
    const state = store.get()
    const bot = state.bots[task.botId]
    if (!bot) throw new Error(strings().harness.unknownBot(task.botId))
    const [first] = store.range(task.id, 1, 1)
    const brief = first?.kind === 'from-bot' ? first.text : ''
    const from =
      task.source.kind === 'routine'
        ? `例行任务「${task.title}」到点了`
        : `来自「${state.bots[task.requestedBy]?.name ?? task.requestedBy}」`
    return runTurn({
      store,
      workspace,
      emit,
      botId: task.botId,
      transcriptId: task.id,
      runId: task.id,
      model,
      system: taskSystem(
        state,
        bot,
        mcp.servers,
        bot.flows.find((flow) => flow.id === task.flowId),
        bot.miniApps.find((app) => app.id === task.miniAppId),
      ),
      messages: [{ role: 'user', content: `任务说明（${from}）：\n${brief}` }],
      tools: {
        ...mcp.tools,
        ...workTools({
          workspace,
          apiKey: getApiKey,
          limits: current,
          onStatus: (text) => updateRunning(task.id, { statusText: text }),
        }),
        ...historyTools(store, current),
        ...miniAppTools({ botId: task.botId, store, workspace, emit }),
        ...skillTaskTools({ botId: task.botId, skills: options.skills }),
      },
      maxSteps: current.taskSteps,
      silenceSeconds: current.modelSilenceSeconds,
      abortSignal,
      trace: { title: task.title, inputs: [brief], compaction: null },
      onTrace: (trace) => emit({ kind: 'trace', botId: task.botId, trace }),
    })
  }

  function updateRunning(taskId: string, patch: Partial<Task>): Task | undefined {
    const task = store.task(taskId)
    if (task?.status !== 'running') return undefined
    const next = { ...task, ...patch }
    store.saveTask(next)
    publish(next.botId)
    return next
  }

  function finish(taskId: string, status: 'done' | 'failed', text: string, run: RunModel | null) {
    const failureReason = status === 'failed' ? text : undefined
    const task = updateRunning(taskId, { status, endedAt: Date.now(), failureReason })
    if (!task) return
    const fallbackFrom = run?.fallbackFrom()
    deliver(task.requestedBy, {
      kind: 'task-result',
      taskId,
      title: task.title,
      status,
      text,
      flowId: task.flowId,
      model: run?.name(),
      ...(fallbackFrom ? { fallbackFrom } : {}),
    })
  }

  function stop(taskId: string) {
    const task = store.task(taskId)
    if (!task) throw new Error(strings().harness.noRunningTask(taskId))
    if (isUnfinished(task)) {
      store.saveTask({ ...task, status: 'stopped', endedAt: Date.now() })
      waiting = waiting.filter((id) => id !== taskId)
      running.get(taskId)?.abort()
    }
    publish(task.botId)
  }

  return { start, startRoutine, stop, startWaiting }
}

export type TaskRunner = ReturnType<typeof createTaskRunner>

export function taskViews(store: Store, botId: string): TaskView[] {
  return store.tasksOf(botId, RECENT_TASKS).map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    statusText: task.statusText,
    createdAt: task.createdAt,
    endedAt: task.endedAt ?? null,
    requestedBy: task.requestedBy === task.botId ? null : task.requestedBy,
    isRoutine: task.source.kind === 'routine',
    flowId: task.flowId,
    miniAppId: task.miniAppId,
    model: task.model?.model,
    failureReason: task.failureReason,
  }))
}

function resultText(taskId: string, conclusion: { seq: number; text: string }, maxChars: number): string {
  const { text, seq } = conclusion
  if (text.length <= maxChars) return text
  const ref = `${taskId}#${seq}`
  return `${clip(text, maxChars)}…${strings().harness.tasks.resultClipped(text.length, ref)}`
}
