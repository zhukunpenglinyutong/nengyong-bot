import path from 'node:path'
import { app, type BrowserWindow, shell } from 'electron'
import { z } from 'zod'
import { createHarness } from '../harness/agent'
import { libraryFile, libraryItems } from '../harness/library'
import { createLimits } from '../harness/limits'
import { createMcp } from '../harness/mcp'
import { deleteMiniApp, miniAppHtml, restoreMiniApp, saveMiniAppData } from '../harness/miniApps'
import { createModelCatalog } from '../harness/modelCatalog'
import { needsOnboarding, onboard } from '../harness/onboarding'
import { createPrices } from '../harness/prices'
import { patchRoutine, routineViews } from '../harness/routines'
import type { Store } from '../harness/store'
import { taskViews } from '../harness/tasks'
import { createSkills } from '../harness/skills'
import { usageView } from '../harness/usage'
import { createWorkspace } from '../harness/workspace'
import { BotId, MAIN_BOT_ID } from '../shared/bot'
import {
  type HarnessEvent,
  OnboardingChoices,
  type PanelData,
  type NengyongBotBridge,
  type TasksAndRoutines,
} from '../shared/bridge'
import { BYTES_PER_MB, type Limits, MESSAGE_MAX_CHARS } from '../shared/limits'
import { currentLanguage, setLanguage } from '../shared/language'
import { strings } from '../shared/strings'
import type { ModelServicesView } from '../shared/modelServices'
import { SidebarState, unreadTotal } from '../shared/sidebar'
import { SKILL_FILE, SkillName, SkillRef, SkillUploadKind } from '../shared/skill'
import { type ModelPrice, ModelName, Price } from '../shared/usage'
import { LIBRARY_DIR, SKILLS_DIR } from './dataDir'
import { saveLanguage } from './language'
import { MiniAppId, Version } from './libraryResponses'
import { createModelServices } from './modelServices'
import { createNotifier } from './notifications'
import { pickSkill } from './pickSkill'
import { createUpdates } from './updates'

export type Handler = (...args: unknown[]) => unknown

interface Context {
  home: string
  dataDir: string
  store: Store
  emit: (event: HarnessEvent) => void
  window: () => BrowserWindow | null
  onLanguageChange: () => void // what the main process shows outside the window, like the menus, is made again
}

const RoutineId = z.string().min(1).max(100)
const AskText = z.string().trim().min(1).max(MESSAGE_MAX_CHARS)
const LibraryPath = z.string().min(1).max(1000)
const TaskId = z.string().min(1).max(100)
const RunId = z.string().min(1).max(100)
const Seqs = z.array(z.number().int().min(1)).min(1)
const OfferId = z.string().min(1).max(100)
const SkillFilePath = z.string().min(1).max(1000)

/**
 * The bridge methods the main process answers, by name: preload calls them over IPC, a paired device over HTTP.
 * Everything that comes in is untrusted input.
 */
export function createHandlers({ home, dataDir, store, emit, window, onLanguageChange }: Context) {
  const modelServices = createModelServices(home)
  const limits = createLimits(home)
  const mcp = createMcp(home, limits.get)
  app.on('will-quit', () => void mcp.close())
  const workspace = createWorkspace(path.join(dataDir, LIBRARY_DIR))
  const catalog = createModelCatalog()
  const prices = createPrices(home)
  const priceOf = (model: string): ModelPrice => {
    const custom = prices.get(model)
    return custom ? { model, price: custom, isCustom: true } : { model, price: catalog.priceOf(model), isCustom: false }
  }
  const notify = createNotifier({
    window,
    botName: (botId) => store.get().bots[botId]?.name ?? 'Nengyong Bot',
    onOpen: (botId) => emit({ kind: 'open-bot', botId }),
  })
  const skills = createSkills({ dir: path.join(dataDir, SKILLS_DIR), store, emit })
  const harness = createHarness({
    store,
    workspace,
    getModel: modelServices.model,
    models: modelServices,
    searchKey: modelServices.searchKey,
    windowTokensOf: catalog.windowTokensOf,
    mcp,
    skills,
    emit: (event) => {
      emit(event)
      notify(event)
    },
    limits: limits.get,
  })
  const updates = createUpdates(emit)
  const miniAppContext = (botId: unknown) => ({ botId: BotId.parse(botId), store, workspace, emit })
  // every bot's panel shows the models it runs on, the main one included
  const withModelsShown = (view: ModelServicesView) => {
    harness.modelsChanged()
    return view
  }

  const handlers = {
    getLanguage: () => currentLanguage(),
    setLanguage: (language) => {
      setLanguage(saveLanguage(home, language))
      onLanguageChange()
    },
    send: (botId, text, attachments, quoteSeq, miniAppId) => {
      const parsed = messageOf(limits.get()).safeParse({ text, attachments, quoteSeq })
      if (!parsed.success) throw new Error(parsed.error.issues[0].message)
      const message = parsed.data
      const viewing = MiniAppId.nullable().parse(miniAppId)
      return harness.send(BotId.parse(botId), message.text, message.attachments, message.quoteSeq, viewing)
    },
    askFromMiniApp: (botId, miniAppId, text) =>
      harness.askFromMiniApp(BotId.parse(botId), MiniAppId.parse(miniAppId), AskText.parse(text)),
    saveMiniAppData: (botId, miniAppId, data) =>
      saveMiniAppData(miniAppContext(botId), MiniAppId.parse(miniAppId), data),
    restoreMiniApp: (botId, miniAppId, version) =>
      restoreMiniApp(miniAppContext(botId), MiniAppId.parse(miniAppId), Version.parse(version)),
    deleteMiniApp: (botId, miniAppId) => deleteMiniApp(miniAppContext(botId), MiniAppId.parse(miniAppId)),
    miniAppHtml: (botId, miniAppId, version) =>
      miniAppHtml(store, workspace, BotId.parse(botId), MiniAppId.parse(miniAppId), Version.parse(version)),
    history: (botId) => store.history(BotId.parse(botId)),
    deleteMessages: (botId, seqs) => store.deleteMessages(BotId.parse(botId), Seqs.parse(seqs)),
    previews: () =>
      Object.fromEntries(
        store.get().roster.flatMap((id) => {
          const reply = store.lastReply(id)
          return reply === undefined ? [] : [[id, reply]]
        }),
      ),
    panel: (botId): PanelData => {
      const id = BotId.parse(botId)
      return {
        routines: routineViews(store.get().bots[id]?.routines ?? []),
        flows: store.get().bots[id]?.flows ?? [],
        skills: skills.views(id),
        miniApps: store.get().bots[id]?.miniApps ?? [],
        library: libraryItems(store, workspace, id),
        tasks: taskViews(store, id),
        models: harness.botModels(id),
      }
    },
    tasksAndRoutines: (): Record<string, TasksAndRoutines> =>
      Object.fromEntries(
        store
          .get()
          .roster.map((id) => [
            id,
            { tasks: taskViews(store, id), routines: routineViews(store.get().bots[id]?.routines ?? []) },
          ]),
      ),
    context: (botId) => harness.context(BotId.parse(botId)),
    setDebug: (isOn) => harness.setDebug(z.boolean().parse(isOn)),
    openLibraryItem: async (file) => {
      const { absolute, kind } = libraryFile(workspace, LibraryPath.parse(file))
      // a bot can write a .command or .html file; opening it would run what the model wrote
      if (kind === 'file') return shell.showItemInFolder(absolute)
      const failure = await shell.openPath(absolute)
      const name = path.basename(absolute)
      if (failure) throw new Error(strings().main.library.cannotOpen(name, failure))
    },
    setRoutineEnabled: (botId, routineId, isEnabled) =>
      patchRoutine(store, emit, BotId.parse(botId), RoutineId.parse(routineId), {
        isEnabled: z.boolean().parse(isEnabled),
      }),
    stopReply: (botId, runId) => harness.stopReply(BotId.parse(botId), RunId.parse(runId)),
    stopTask: (botId, taskId) => harness.stopTask(BotId.parse(botId), TaskId.parse(taskId)),
    answerSkillOffer: (botId, offer, names) =>
      harness.answerSkillOffer(BotId.parse(botId), OfferId.parse(offer), SkillName.array().parse(names)),
    uploadSkill: async (botId, kind) => {
      const id = BotId.parse(botId)
      const picked = await pickSkill(window(), SkillUploadKind.parse(kind))
      return picked === null ? null : skills.upload(id, picked)
    },
    answerSkillUpload: (botId, offer, names) =>
      skills.answerUpload(BotId.parse(botId), OfferId.parse(offer), SkillName.array().parse(names)),
    removeSkills: (botId, names) => skills.remove(BotId.parse(botId), z.array(SkillName).min(1).parse(names)),
    skillFiles: (ref) => skills.files(SkillRef.parse(ref)),
    skillFile: (ref, file) => skills.file(SkillRef.parse(ref), SkillFilePath.parse(file)),
    revealSkill: (botId, name) =>
      shell.showItemInFolder(path.join(skills.folder(BotId.parse(botId), SkillName.parse(name)), SKILL_FILE)),
    getSidebar: () => store.sidebar(),
    needsOnboarding: () => needsOnboarding(store),
    saveSidebar: (sidebar) => {
      const parsed = SidebarState.parse(sidebar)
      app.setBadgeCount(unreadTotal(parsed))
      return store.saveSidebar(parsed)
    },
    getModelServices: () => modelServices.view(),
    listModels: (accountId) => modelServices.listModels(accountId),
    saveAccount: async (input, use) => withModelsShown(await modelServices.saveAccount(input, use)),
    removeAccount: (accountId) => withModelsShown(modelServices.removeAccount(accountId)),
    setChatModel: (choice) => withModelsShown(modelServices.setChatModel(choice)),
    setSearchAccount: (accountId) => modelServices.setSearchAccount(accountId),
    getMcpConfig: () => mcp.view(),
    setMcpConfig: (text) => mcp.save(text),
    getLimits: () => limits.get(),
    setLimits: (input) => {
      const saved = limits.save(input)
      harness.startWaitingTasks()
      return saved
    },
    usage: () => usageView(store, priceOf),
    setModelPrice: (model, price) => {
      prices.set(ModelName.parse(model), Price.parse(price))
      return usageView(store, priceOf)
    },
    onboard: (choices) => {
      const { bots, greeting } = onboard(store, OnboardingChoices.parse(choices), modelServices.model() !== null)
      for (const bot of bots) emit({ kind: 'bot-created', bot })
      emit({ kind: 'entry', botId: MAIN_BOT_ID, entry: greeting })
      return bots
    },
    checkForUpdate: updates.checkForUpdate,
    installUpdate: updates.installUpdate,
  } satisfies Partial<Record<keyof NengyongBotBridge, Handler>>

  return { handlers, harness, workspace, limits: limits.get }
}

function messageOf({ attachmentsPerMessage, attachmentMegabytes }: Limits) {
  const maxBytes = attachmentMegabytes * BYTES_PER_MB
  const Attachment = z.object({
    name: z.string().min(1).max(255),
    data: z
      .instanceof(Uint8Array)
      .refine((data) => data.byteLength <= maxBytes, strings().main.send.attachmentTooLarge),
  })
  return z
    .object({
      text: z.string().trim().max(MESSAGE_MAX_CHARS, strings().main.send.tooLong(MESSAGE_MAX_CHARS)),
      attachments: z
        .array(Attachment)
        .max(attachmentsPerMessage, strings().main.send.tooManyAttachments(attachmentsPerMessage)),
      quoteSeq: z.number().int().min(1).nullable(),
    })
    .refine((message) => message.text !== '' || message.attachments.length > 0, strings().main.send.empty)
}
