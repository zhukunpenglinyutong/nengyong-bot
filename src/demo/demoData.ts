import { MAIN_BOT, PALETTE, secretary } from '../../shared/bot'
import type { BotModels, Entry, PanelData } from '../../shared/bridge'
import { DEEPSEEK_MODEL, type ModelServicesView } from '../../shared/modelServices'
import { type Duty, type DutyPlan, dutyOf } from '../../shared/duty'
import type { Flow } from '../../shared/flow'
import type { SidebarState } from '../../shared/sidebar'
import { DEMO_MINI_APP_BOT, DEMO_MINI_APP_TRANSCRIPT, DEMO_MINI_APPS } from './demoMiniApps'
import { strings } from '../../shared/strings'

const words = strings().demo

const colorById = Object.fromEntries(PALETTE.map((color) => [color.id, color.value]))

/** The sidebar the browser demo and the interface tests start from. */
export const DEMO_SIDEBAR: SidebarState = {
  bots: [
    { ...MAIN_BOT, name: words.bots.chief },
    secretary(),
    { id: 'repo', name: words.bots.repo, shape: 'mushroom', color: colorById.ink },
    { id: 'content', name: words.bots.content, shape: 'blob', color: colorById.slate },
    { id: 'support', name: words.bots.support, shape: 'blob', color: colorById.slate },
    { id: 'release', name: words.bots.release, shape: 'onigiri', color: colorById.mint },
    { id: 'travel', name: words.bots.travel, shape: 'bell', color: colorById.coral },
    { id: 'fitness', name: words.bots.fitness, shape: 'blob', color: colorById.mint },
    { id: 'ledger', name: words.bots.ledger, shape: 'diamond', color: colorById.rose },
    { id: 'ideas', name: words.bots.ideas, shape: 'bell', color: colorById.rose },
  ],
  sections: [
    { id: 's1', name: words.sections.myApp, collapsed: false },
    { id: 's2', name: words.sections.life, collapsed: false },
    { id: 's3', name: words.sections.family, collapsed: false },
  ],
  placement: {
    repo: 's1',
    content: 's1',
    support: 's1',
    release: 's1',
    travel: 's2',
    fitness: 's2',
    ledger: 's3',
  },
  pinned: [MAIN_BOT.id, secretary().id],
  hidden: [],
  unread: {},
  seenAt: { support: Date.now() - 60 * 60_000 },
  ungroupedCollapsed: false,
  hiddenCollapsed: true,
  dismissed: [],
}

const MINUTE_MS = 60_000
const loadedAt = Date.now()

type Line = [minutesAgo: number, kind: 'user' | 'bot', text: string]

function transcript(lines: Line[]): Entry[] {
  return lines.map(([minutesAgo, kind, text], index) => ({
    seq: index + 1,
    at: loadedAt - minutesAgo * MINUTE_MS,
    kind,
    text,
  }))
}

const CHIEF_TRANSCRIPT = transcript([
  [190, 'bot', words.chief.plan],
  [188, 'user', words.chief.agree],
  [187, 'bot', words.chief.handingOut],
  [186, 'bot', words.chief.feedbackStarted],
  [184, 'bot', words.chief.allSet],
  [42, 'user', words.chief.askIdeaBot],
  [41, 'bot', words.chief.willCreate],
  [40, 'bot', words.chief.created],
])

// what each of the other bots last said; it doubles as its sidebar preview
const LAST_REPLIES: Record<string, string> = {
  secretary: words.lastReplies.secretary,
  repo: words.lastReplies.repo,
  support: words.lastReplies.support,
  travel: words.lastReplies.travel,
  fitness: words.lastReplies.fitness,
  ledger: words.lastReplies.ledger,
  ideas: words.lastReplies.ideas,
}

const DAY_MINUTES = 24 * 60

const RELEASE_TRANSCRIPT = transcript([
  [DAY_MINUTES + 30, 'user', words.release.askNotes],
  [DAY_MINUTES + 25, 'bot', words.release.notesDone],
  [DAY_MINUTES + 3, 'user', words.release.keepDoing],
  [DAY_MINUTES, 'bot', words.release.flowSaved],
])

export const DEMO_TRANSCRIPTS: Record<string, Entry[]> = {
  [MAIN_BOT.id]: CHIEF_TRANSCRIPT,
  release: RELEASE_TRANSCRIPT,
  [DEMO_MINI_APP_BOT]: DEMO_MINI_APP_TRANSCRIPT,
  ...Object.fromEntries(
    Object.entries(LAST_REPLIES).map(([botId, reply]) => [
      botId,
      transcript([
        [DAY_MINUTES + 1, 'user', words.chats.askProgress],
        [DAY_MINUTES, 'bot', reply],
      ]),
    ]),
  ),
  travel: [
    ...transcript([
      [DAY_MINUTES + 1, 'user', words.chats.askProgress],
      [DAY_MINUTES, 'bot', words.lastReplies.travel],
    ]),
    {
      seq: 3,
      at: loadedAt - DAY_MINUTES * MINUTE_MS,
      kind: 'tool',
      name: 'ask_user',
      input: {},
      output: {
        question: words.travelQuestion.question,
        answers: [words.travelQuestion.book, words.travelQuestion.skip],
      },
    },
  ],
}

const daysAgo = (days: number) => Date.now() - days * DAY_MINUTES * 60_000

const RELEASE_NOTES_FLOW: Flow = {
  id: 'release-notes',
  name: words.releaseNotesFlow.name,
  when: words.releaseNotesFlow.when,
  steps: [
    words.releaseNotesFlow.listPrs,
    words.releaseNotesFlow.groupPrs,
    words.releaseNotesFlow.rewrite,
    words.releaseNotesFlow.confirmFirst,
  ],
  notes: [words.releaseNotesFlow.note],
  updatedAt: daysAgo(1),
  model: { accountId: 'deepseek', model: 'deepseek-pro' },
}

const PRE_MERGE_FLOW: Flow = {
  id: 'pre-merge',
  name: words.preMergeFlow.name,
  when: words.preMergeFlow.when,
  steps: [
    words.preMergeFlow.checkCi,
    words.preMergeFlow.readDiff,
    words.preMergeFlow.checkCommits,
    words.preMergeFlow.verdict,
  ],
  notes: [words.preMergeFlow.note],
  updatedAt: daysAgo(4),
}

/** What a demo bot saves when it is told to: see createDemoBridge. */
export const DEMO_LEARNED_FLOW: Omit<Flow, 'id' | 'updatedAt'> = {
  name: words.learnedFlow.name,
  when: words.learnedFlow.when,
  steps: [words.learnedFlow.gather, words.learnedFlow.group, words.learnedFlow.nextWeek],
  notes: [words.learnedFlow.note],
}

/** What a bot's panel shows of its models while it chats on the main one. */
export const DEMO_BOT_MODELS: BotModels = { main: DEEPSEEK_MODEL, chat: null, tasks: null }

/** 发版助理's duty, agreed twice already, its weekly review on: what the 职责 list looks like once settled. */
function releaseDuty(): Duty {
  const duty = words.duty
  const progress = (text: string, ratio: number, verdict: 'met' | 'onTrack' | 'behind') => ({
    text,
    ratio,
    verdict,
    at: Date.now(),
  })
  return {
    purpose: duty.purpose,
    version: 2,
    reviewRoutineId: DEMO_REVIEW_ROUTINE,
    objectives: [
      {
        id: 'notes',
        name: duty.notesObjective,
        keyResults: [
          {
            text: duty.notesEarly,
            window: duty.eachRelease,
            source: duty.selfCounted,
            progress: progress(duty.notesEarlyNow, 1, 'met'),
          },
          {
            text: duty.fewEdits,
            window: duty.eachRelease,
            source: duty.editsCompared,
            progress: progress(duty.fewEditsNow, 0.6, 'behind'),
          },
        ],
      },
      {
        id: 'safe',
        name: duty.safeObjective,
        keyResults: [
          {
            text: duty.checksRun,
            window: duty.eachPr,
            source: duty.selfCounted,
            progress: progress(duty.checksRunNow, 0.8, 'onTrack'),
          },
        ],
      },
    ],
    outOfScope: [duty.notFeatures, duty.notIssues],
  }
}

export const DEMO_REVIEW_ROUTINE = 'weekly-review'

/** The duty a demo bot proposes when asked to plan one: its first version. */
export function demoDutyPlan(): DutyPlan {
  const duty = words.duty
  return {
    purpose: duty.planPurpose,
    objectives: [
      {
        id: 'daily',
        name: duty.planObjective,
        keyResults: [
          { text: duty.dailyBy9, window: duty.everyDay, source: duty.selfCounted },
          { text: duty.issuesLabeled, window: duty.everyDay, source: duty.selfCounted },
        ],
      },
    ],
    outOfScope: [duty.planOutOfScope],
  }
}

export const DEMO_PANELS: Record<string, PanelData> = {
  release: {
    duty: releaseDuty(),
    skills: [],
    routines: [
      {
        id: DEMO_REVIEW_ROUTINE,
        name: strings().harness.duty.reviewName,
        timezone: 'Asia/Shanghai',
        isEnabled: true,
        nextRunAt: Date.now() + 3 * DAY_MINUTES * 60_000,
      },
      {
        id: 'friday-release',
        name: words.routines.fridayRelease,
        timezone: 'Asia/Shanghai',
        isEnabled: true,
        nextRunAt: Date.now() + 2 * DAY_MINUTES * 60_000,
        flowId: RELEASE_NOTES_FLOW.id,
      },
    ],
    flows: [RELEASE_NOTES_FLOW, PRE_MERGE_FLOW],
    miniApps: [],
    library: [{ kind: 'doc', path: 'release/v0.8.md', writtenAt: daysAgo(1) }],
    tasks: [
      {
        id: 'pr-491',
        title: words.tasks.pr491,
        status: 'running',
        statusText: words.tasks.pr491Status,
        createdAt: Date.now() - 60_000,
        endedAt: null,
        requestedBy: null,
        isRoutine: false,
        flowId: PRE_MERGE_FLOW.id,
      },
      {
        id: 'pr-487',
        title: words.tasks.pr487,
        status: 'done',
        statusText: '',
        createdAt: daysAgo(2),
        endedAt: daysAgo(2) + 3 * 60_000,
        requestedBy: null,
        isRoutine: false,
        flowId: PRE_MERGE_FLOW.id,
      },
    ],
    models: { main: DEEPSEEK_MODEL, chat: { model: 'deepseek-pro', isGone: false }, tasks: null },
  },
  repo: {
    duty: dutyOf(''),
    skills: [],
    routines: [
      {
        id: 'daily-stars',
        name: words.routines.githubDaily,
        timezone: 'Asia/Shanghai',
        isEnabled: true,
        nextRunAt: Date.now() + 3 * 60 * MINUTE_MS,
      },
    ],
    flows: [],
    miniApps: [],
    library: [],
    tasks: [],
    models: DEMO_BOT_MODELS,
  },
  support: {
    duty: dutyOf(''),
    skills: [],
    routines: [],
    flows: [],
    miniApps: [],
    library: [],
    tasks: [
      {
        id: 'bug-digest',
        title: words.tasks.bugDigest,
        status: 'failed',
        statusText: '',
        createdAt: Date.now() - 25 * MINUTE_MS,
        endedAt: Date.now() - 20 * MINUTE_MS,
        requestedBy: null,
        isRoutine: true,
        failureReason: words.tasks.bugDigestFailure,
      },
    ],
    models: DEMO_BOT_MODELS,
  },
  [DEMO_MINI_APP_BOT]: {
    duty: dutyOf(''),
    skills: [],
    routines: [],
    flows: [],
    miniApps: DEMO_MINI_APPS,
    library: [],
    tasks: [],
    models: DEMO_BOT_MODELS,
  },
  [MAIN_BOT.id]: {
    duty: dutyOf(''),
    flows: [],
    miniApps: [],
    skills: [],
    routines: [
      {
        id: 'ai',
        name: words.routines.aiBriefing,
        timezone: 'Asia/Shanghai',
        isEnabled: false,
        nextRunAt: null,
      },
    ],
    library: [
      {
        kind: 'file',
        path: words.library.export,
        writtenAt: daysAgo(0),
      },
      { kind: 'doc', path: words.library.syncPlan, writtenAt: daysAgo(1) },
      {
        kind: 'doc',
        path: words.library.feedback,
        writtenAt: daysAgo(2),
      },
      {
        kind: 'media',
        path: words.library.settingsShot,
        writtenAt: daysAgo(3),
      },
      {
        kind: 'media',
        path: words.library.conflictShot,
        writtenAt: daysAgo(3),
      },
    ],
    tasks: [
      {
        id: 'sync-plan',
        title: words.tasks.syncPlan,
        status: 'running',
        statusText: words.tasks.syncPlanStatus,
        createdAt: Date.now() - 3 * 60_000,
        endedAt: null,
        requestedBy: null,
        isRoutine: false,
      },
      {
        id: 'weekly-report',
        title: words.tasks.weeklyReport,
        status: 'done',
        statusText: '',
        createdAt: daysAgo(1),
        endedAt: daysAgo(1) + 4 * 60_000,
        requestedBy: null,
        isRoutine: true,
      },
      {
        id: 'invoice-check',
        title: words.tasks.invoiceCheck,
        status: 'failed',
        statusText: '',
        createdAt: daysAgo(2),
        endedAt: daysAgo(2) + 60_000,
        requestedBy: 'secretary',
        isRoutine: false,
      },
    ],
    models: DEMO_BOT_MODELS,
  },
}

// a chat model must be chosen, or the app would open the settings window on start
export const DEMO_MODEL_SERVICES: ModelServicesView = {
  accounts: [
    { id: 'deepseek', service: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com', keyHint: '••••demo' },
  ],
  chat: { accountId: 'deepseek', model: DEEPSEEK_MODEL },
  searchAccountId: 'deepseek',
}

export const DEMO_MODELS = [DEEPSEEK_MODEL, 'deepseek-pro']
