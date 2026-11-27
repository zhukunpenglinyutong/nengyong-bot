import { MAIN_BOT_ID, secretary } from '../../shared/bot'
import {
  EMPTY_MCP_CONFIG,
  type Entry,
  type HarnessEvent,
  type PanelData,
  type Quote,
  type NengyongBotBridge,
  type TaskView,
} from '../../shared/bridge'
import type { DevicesView } from '../../shared/devices'
import type { FlowSaved } from '../../shared/flow'
import { latestVersion, type MiniApp } from '../../shared/miniApp'
import { miniAppPage } from '../../shared/miniAppPage'
import { DEFAULT_LIMITS } from '../../shared/limits'
import { DEEPSEEK_MODEL } from '../../shared/modelServices'
import { newId } from '../../shared/newId'
import { bySkillFileOrder, isScript, Skill, type SkillOffer, type SkillRef, type SkillView } from '../../shared/skill'
import type { SidebarState } from '../../shared/sidebar'
import type { Price } from '../../shared/usage'
import { browserLanguage, saveBrowserLanguage } from '../browserLanguage'
import {
  DEMO_BOT_MODELS,
  DEMO_LEARNED_FLOW,
  DEMO_MODEL_SERVICES,
  DEMO_MODELS,
  DEMO_PANELS,
  DEMO_REVIEW_ROUTINE,
  DEMO_TRANSCRIPTS,
  demoDutyPlan,
} from './demoData'
import { demoContext, demoTraces } from './demoDebug'
import { DEMO_MINI_APP_FILES } from './demoMiniApps'
import { DEMO_SKILL_FILES, demoOffer, demoSkills, demoUpload } from './demoSkills'
import { demoUsage } from './demoUsage'
import { type DutyOffer, dutyOf } from '../../shared/duty'
import { TIMEZONE } from '../../shared/timezone'
import { strings } from '../../shared/strings'

const words = strings().demo.bridge

const REPLY_DELAY_MS = 1200 // long enough to see the avatar 'thinking'
const DEMO_NEXT_RUN_MS = 60 * 60_000
const AUTO_REPLY = words.autoReply
const EMPTY_PANEL: PanelData = {
  duty: dutyOf(''),
  routines: [],
  flows: [],
  skills: [],
  miniApps: [],
  library: [],
  tasks: [],
  models: DEMO_BOT_MODELS,
}
const SKILL_LINK = 'github.com/' // a message with one makes the demo bot offer its spreadsheet skill
const LEARN_WORD = words.learnWord // a message with it makes the demo bot save DEMO_LEARNED_FLOW
type Said =
  | { kind: 'user'; text: string; attachments?: string[]; quote?: Quote; miniApp?: SentFrom }
  | { kind: 'bot'; text: string; suggestions?: string[]; model?: string; requestId?: string }
  | { kind: 'tool'; name: string; input: unknown; output: unknown }
  | { kind: 'skill-answer'; offer: string; botId: string; names: string[] }
  | { kind: 'duty-answer'; offer: string; botId: string; isAccepted: boolean }
type SentFrom = { id: string; name: string; version: number; isSentByApp: boolean }
const MINI_APP_REPLY = words.miniAppReply
const webOnly = () => Promise.reject(new Error(words.webOnly))
const DEMO_ADDRESS = 'http://192.168.1.23:4317'
const DEMO_DEVICES_OFF: DevicesView = { isLanOn: false, address: null, error: null, devices: [] }
const DEMO_DEVICES: DevicesView['devices'] = [
  { id: 'demo-iphone', name: 'iPhone', kind: 'phone', isOnline: true, lastSeenAt: Date.now() },
  { id: 'demo-ipad', name: 'iPad', kind: 'tablet', isOnline: false, lastSeenAt: Date.now() - 26 * 60 * 60_000 },
]

/** The bridge behind `npm run dev` in a browser: canned conversations and one fixed reply, kept in memory only. */
export function createDemoBridge(): NengyongBotBridge {
  const listeners = new Set<(event: HarnessEvent) => void>()
  const transcripts = new Map(Object.entries(DEMO_TRANSCRIPTS))
  const panels = new Map(Object.entries(DEMO_PANELS))
  const attachmentUrls = new Map<string, string>() // library path → blob: URL of the bytes sent
  const miniAppFiles = new Map(Object.entries(DEMO_MINI_APP_FILES))
  let sidebar: SidebarState | null = null
  let filledPrices = new Map<string, Price>()
  let devices: DevicesView = DEMO_DEVICES_OFF
  let skills = demoSkills(Date.now()) // by the bot that has them
  const offers = new Map<string, SkillOffer>()
  const dutyOffers = new Map<string, DutyOffer>()
  const stopped = new Set<string>() // run ids of the replies the user stopped before they were written
  const emit = (event: HarnessEvent) => listeners.forEach((listener) => listener(event))
  const append = (botId: string, said: Said) => {
    const known = transcripts.get(botId) ?? []
    const entry: Entry = { ...said, seq: (known.at(-1)?.seq ?? 0) + 1, at: Date.now() }
    transcripts.set(botId, [...known, entry])
    emit({ kind: 'entry', botId, entry })
  }
  const miniAppOf = (botId: string, miniAppId: string): MiniApp => {
    const app = (panels.get(botId) ?? EMPTY_PANEL).miniApps.find((candidate) => candidate.id === miniAppId)
    if (!app) throw new Error(words.noMiniApp(miniAppId))
    return app
  }
  const setMiniApps = (botId: string, change: (apps: MiniApp[]) => MiniApp[]) => {
    const panel = panels.get(botId) ?? EMPTY_PANEL
    const miniApps = change(panel.miniApps)
    panels.set(botId, { ...panel, miniApps })
    emit({ kind: 'mini-apps', botId, miniApps })
  }
  const sentFrom = (botId: string, miniAppId: string, isSentByApp: boolean): SentFrom => {
    const app = miniAppOf(botId, miniAppId)
    return { id: app.id, name: app.name, version: latestVersion(app).version, isSentByApp }
  }
  const pageOf = (miniAppId: string, version: number) => {
    const files = miniAppFiles.get(miniAppId)
    return miniAppPage(files?.pages[version] ?? words.pageMissing, files?.data)
  }
  // the main bot can use every bot's skills, so its panel lists them all
  const skillsOf = (botId: string): SkillView[] =>
    botId === MAIN_BOT_ID ? Object.values(skills).flat() : (skills[botId] ?? [])
  const setSkills = (botId: string, change: (list: SkillView[]) => SkillView[]) => {
    skills = { ...skills, [botId]: change(skills[botId] ?? []) }
    emit({ kind: 'skills', botId, skills: skillsOf(botId) })
    if (botId !== MAIN_BOT_ID) emit({ kind: 'skills', botId: MAIN_BOT_ID, skills: skillsOf(MAIN_BOT_ID) })
  }
  const offerSkill = (botId: string): string => {
    const offer = demoOffer(botId, newId('k'))
    offers.set(offer.offer, offer)
    append(botId, { kind: 'tool', name: 'install_skill', input: {}, output: offer })
    return words.skillOffer
  }
  const offerDuty = (botId: string): string => {
    const { version } = (panels.get(botId) ?? EMPTY_PANEL).duty
    const offer = {
      offer: newId('d'),
      botId,
      baseVersion: version,
      plan: demoDutyPlan(),
      changes: [],
      isReviewOn: true,
    }
    dutyOffers.set(offer.offer, offer)
    append(botId, { kind: 'tool', name: 'propose_duty', input: {}, output: offer })
    return words.dutyOffer
  }
  const agreeDuty = (offer: DutyOffer, isReviewOn: boolean) => {
    const panel = panels.get(offer.botId) ?? EMPTY_PANEL
    const review = {
      id: DEMO_REVIEW_ROUTINE,
      name: strings().harness.duty.reviewName,
      timezone: TIMEZONE,
      isEnabled: isReviewOn,
      nextRunAt: isReviewOn ? Date.now() + DEMO_NEXT_RUN_MS : null,
    }
    const routines = [...panel.routines.filter((routine) => routine.id !== review.id), review]
    const duty = { ...offer.plan, version: offer.baseVersion + 1, reviewRoutineId: review.id }
    panels.set(offer.botId, { ...panel, duty, routines })
    emit({ kind: 'duty', botId: offer.botId, duty })
    emit({ kind: 'routines', botId: offer.botId, routines })
  }
  const replyTo = (botId: string, text: string) => {
    if (text.toLowerCase().includes(LEARN_WORD)) return learnFlow(botId)
    if (text.includes(SKILL_LINK)) return offerSkill(botId)
    if (text.includes(strings().bot.duty.planStarter)) return offerDuty(botId)
    return AUTO_REPLY
  }
  // the card's answer: installs the skills ticked; either way the card is spent
  const settleOffer = (offerId: string, names: string[]): SkillOffer => {
    const offer = offers.get(offerId)
    if (!offer) throw new Error(strings().harness.skills.offerGone)
    offers.delete(offerId)
    const chosen = offer.skills
      .filter((skill) => names.includes(skill.name))
      .map((skill) => Skill.parse({ ...skill, installedAt: Date.now() })) // drops what only the card needs
    if (chosen.length)
      setSkills(offer.botId, (list) => [
        ...list.filter((each) => !names.includes(each.name)),
        ...chosen.map((skill) => ({ ...skill, botId: offer.botId, uses: 0, lastUsedAt: null })),
      ])
    return offer
  }
  const filesOf = (ref: SkillRef): Record<string, string> => {
    if (ref.kind === 'offer' && !offers.has(ref.offer)) throw new Error(strings().harness.skills.offerGone)
    return DEMO_SKILL_FILES[ref.name] ?? {}
  }
  const learnFlow = (botId: string): string => {
    const flow = { ...DEMO_LEARNED_FLOW, id: newId('f'), updatedAt: Date.now() }
    const mention = `[${flow.name}](flow:${flow.id})`
    const panel = panels.get(botId) ?? EMPTY_PANEL
    const flows = [...panel.flows, flow]
    panels.set(botId, { ...panel, flows })
    emit({ kind: 'flows', botId, flows })
    append(botId, {
      kind: 'tool',
      name: 'save_flow',
      input: { name: flow.name },
      output: { saved: flow.id, isNew: true, mention } satisfies FlowSaved,
    })
    return words.flowSaved(mention, flow.steps.length)
  }

  return {
    isMac: false,
    getLanguage: async () => browserLanguage(),
    setLanguage: async (language) => saveBrowserLanguage(language),
    async send(botId, text, files, quoteSeq, miniAppId) {
      const attachments = files.map((file) => {
        const path = `uploads/${attachmentUrls.size}/${file.name}`
        attachmentUrls.set(path, URL.createObjectURL(new Blob([new Uint8Array(file.data)])))
        return path
      })
      const quoted = transcripts.get(botId)?.find((entry) => entry.seq === quoteSeq)
      const quote = quoted && 'text' in quoted ? { seq: quoted.seq, text: quoted.text } : undefined
      const miniApp = miniAppId === null ? undefined : sentFrom(botId, miniAppId, false)
      append(botId, {
        kind: 'user',
        text,
        ...(attachments.length ? { attachments } : {}),
        ...(quote ? { quote } : {}),
        ...(miniApp ? { miniApp } : {}),
      })
      const runId = newId('demo-run-')
      emit({ kind: 'busy', botId, busy: true, runId })
      const reply = replyTo(botId, text)
      emit({ kind: 'context', botId, context: demoContext(transcripts.get(botId) ?? []) })
      const traces = demoTraces(botId, text, Date.now())
      for (const trace of traces.slice(0, -1)) {
        emit({ kind: 'trace', botId, trace })
        await new Promise((resolve) => setTimeout(resolve, REPLY_DELAY_MS / (traces.length - 1)))
        if (stopped.has(runId)) return emit({ kind: 'busy', botId, busy: false, runId })
      }
      append(botId, { kind: 'bot', text: reply, model: DEEPSEEK_MODEL, requestId: newId('demo-') })
      traces.slice(-1).forEach((trace) => emit({ kind: 'trace', botId, trace }))
      emit({ kind: 'busy', botId, busy: false, runId })
    },
    attachmentUrl: (path) => attachmentUrls.get(path) ?? '',
    // a data: URL, not a blob: one, so the interface tests' jsdom can render it too
    miniAppUrl: (_botId, miniAppId, version) =>
      `data:text/html;charset=utf-8,${encodeURIComponent(pageOf(miniAppId, version))}`,
    async askFromMiniApp(botId, miniAppId, text) {
      append(botId, { kind: 'user', text, miniApp: sentFrom(botId, miniAppId, true) })
      append(botId, { kind: 'bot', text: MINI_APP_REPLY })
    },
    async saveMiniAppData(botId, miniAppId, data) {
      const files = miniAppFiles.get(miniAppId)
      if (files) miniAppFiles.set(miniAppId, { ...files, data })
      setMiniApps(botId, (apps) => apps.map((app) => (app.id === miniAppId ? { ...app, dataAt: Date.now() } : app)))
    },
    async restoreMiniApp(botId, miniAppId, version) {
      const next = latestVersion(miniAppOf(botId, miniAppId)).version + 1
      const files = miniAppFiles.get(miniAppId)
      if (files)
        miniAppFiles.set(miniAppId, { ...files, pages: { ...files.pages, [next]: files.pages[version] ?? '' } })
      const restored = {
        version: next,
        change: words.restored(version),
        at: Date.now(),
      }
      setMiniApps(botId, (apps) =>
        apps.map((app) => (app.id === miniAppId ? { ...app, versions: [...app.versions, restored] } : app)),
      )
    },
    async deleteMiniApp(botId, miniAppId) {
      setMiniApps(botId, (apps) => apps.filter((app) => app.id !== miniAppId))
    },
    miniAppHtml: async (_botId, miniAppId, version) => pageOf(miniAppId, version),
    history: async (botId) => transcripts.get(botId) ?? [],
    deleteMessages: async (botId, seqs) => {
      transcripts.set(
        botId,
        (transcripts.get(botId) ?? []).filter((entry) => !seqs.includes(entry.seq)),
      )
    },
    previews: async () =>
      Object.fromEntries(
        [...transcripts].flatMap(([botId, entries]) => {
          const last = entries.findLast((entry) => entry.kind === 'bot')
          return last ? [[botId, last.text]] : []
        }),
      ),
    panel: async (botId) => ({ ...(panels.get(botId) ?? EMPTY_PANEL), skills: skillsOf(botId) }),
    tasksAndRoutines: async () =>
      Object.fromEntries([...panels].map(([botId, { tasks, routines }]) => [botId, { tasks, routines }])),
    context: async (botId) => demoContext(transcripts.get(botId) ?? []),
    setDebug: async () => {}, // the demo always reports: there is nothing to save
    async setRoutineEnabled(botId, routineId, isEnabled) {
      const panel = panels.get(botId) ?? EMPTY_PANEL
      const routines = panel.routines.map((routine) =>
        routine.id === routineId
          ? { ...routine, isEnabled, nextRunAt: isEnabled ? Date.now() + DEMO_NEXT_RUN_MS : null }
          : routine,
      )
      panels.set(botId, { ...panel, routines })
      emit({ kind: 'routines', botId, routines })
    },
    async answerDutyOffer(botId, offerId, isAccepted, isReviewOn) {
      const offer = dutyOffers.get(offerId)
      if (!offer) throw new Error(strings().harness.duty.offerGone)
      dutyOffers.delete(offerId)
      append(botId, { kind: 'duty-answer', offer: offerId, botId: offer.botId, isAccepted })
      if (isAccepted) agreeDuty(offer, isReviewOn)
      append(botId, { kind: 'bot', text: isAccepted ? words.dutyAgreed : words.dutyDeclined })
    },
    async setDutyReview(botId, isOn) {
      const panel = panels.get(botId) ?? EMPTY_PANEL
      const routines = panel.routines.map((routine) =>
        routine.id === panel.duty.reviewRoutineId
          ? { ...routine, isEnabled: isOn, nextRunAt: isOn ? Date.now() + DEMO_NEXT_RUN_MS : null }
          : routine,
      )
      panels.set(botId, { ...panel, routines })
      emit({ kind: 'routines', botId, routines })
    },
    async answerSkillOffer(botId, offerId, names) {
      const offer = settleOffer(offerId, names)
      append(botId, { kind: 'skill-answer', offer: offerId, botId: offer.botId, names })
      const [name] = names
      append(botId, {
        kind: 'bot',
        text: name ? words.skillInstalled(`[${name}](skill:${name})`) : words.skillDeclined,
      })
    },
    async uploadSkill(botId) {
      const offer = demoUpload(botId, newId('k'), Date.now())
      offers.set(offer.offer, offer)
      return offer
    },
    async answerSkillUpload(_botId, offerId, names) {
      settleOffer(offerId, names)
    },
    async removeSkills(botId, names) {
      setSkills(botId, (list) => list.filter((skill) => !names.includes(skill.name)))
    },
    skillFiles: async (ref) =>
      Object.entries(filesOf(ref))
        .map(([path, text]) => ({ path, bytes: text.length, isScript: isScript(path) }))
        .sort(bySkillFileOrder),
    async skillFile(ref, path) {
      const text = filesOf(ref)[path]
      if (text === undefined) throw new Error(strings().harness.skills.fileGone(path))
      return text
    },
    revealSkill: webOnly,
    async stopReply(_botId, runId) {
      stopped.add(runId)
    },
    async stopTask(botId, taskId) {
      const panel = panels.get(botId) ?? EMPTY_PANEL
      const tasks = panel.tasks.map(
        (task): TaskView => (task.id === taskId ? { ...task, status: 'stopped', endedAt: Date.now() } : task),
      )
      panels.set(botId, { ...panel, tasks })
      emit({ kind: 'tasks', botId, tasks })
    },
    getSidebar: async () => sidebar,
    needsOnboarding: async () => false, // main.tsx starts the demo's onboarding from the URL instead
    async saveSidebar(next) {
      sidebar = next
      return []
    },
    async deleteBot(botId) {
      transcripts.delete(botId)
      panels.delete(botId)
      skills = Object.fromEntries(Object.entries(skills).filter(([id]) => id !== botId))
    },
    getDataDir: async () => words.noDataDir,
    openDataDir: webOnly,
    moveDataDir: webOnly,
    openLibraryItem: webOnly,
    exportData: webOnly,
    importData: webOnly,
    getModelServices: async () => DEMO_MODEL_SERVICES,
    listModels: async () => DEMO_MODELS,
    saveAccount: webOnly,
    removeAccount: webOnly,
    setChatModel: webOnly,
    setSearchAccount: webOnly,
    getMcpConfig: async () => ({ text: EMPTY_MCP_CONFIG, servers: [] }),
    setMcpConfig: webOnly,
    getLimits: async () => DEFAULT_LIMITS,
    setLimits: async (limits) => limits, // kept by the settings page only: the demo replies are scripted
    usage: async () => demoUsage(filledPrices),
    async setModelPrice(model, price) {
      filledPrices = new Map(filledPrices).set(model, price)
      return demoUsage(filledPrices)
    },
    async onboard({ bossName, hires, suggestions }) {
      const bots = [
        secretary(),
        ...hires.map(({ duty: _duty, ...look }, index) => ({ ...look, id: `demo-hire-${index}` })),
      ]
      for (const bot of bots) emit({ kind: 'bot-created', bot })
      const team = bots.map((bot) => `[${bot.name}](bot:${bot.id})`)
      append(MAIN_BOT_ID, {
        kind: 'bot',
        text: words.greeting(bossName, team),
        suggestions,
      })
      return bots
    },
    getDevices: async () => devices,
    async setLanAccess(isOn) {
      devices = isOn ? { ...devices, isLanOn: true, address: DEMO_ADDRESS, devices: DEMO_DEVICES } : DEMO_DEVICES_OFF
      emit({ kind: 'devices', devices })
      return devices
    },
    async removeDevice(deviceId) {
      devices = { ...devices, devices: devices.devices.filter((device) => device.id !== deviceId) }
      emit({ kind: 'devices', devices })
      return devices
    },
    answerPairing: webOnly,
    checkForUpdate: webOnly,
    installUpdate: webOnly,
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
