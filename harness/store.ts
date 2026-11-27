import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { z } from 'zod'
import { type Bot, MAIN_BOT_ID, type NewBot } from '../shared/bot'
import { Entry } from '../shared/bridge'
import { pendingDecisions } from '../shared/decisions'
import { dutyOf } from '../shared/duty'
import { strings } from '../shared/strings'
import { SidebarState } from '../shared/sidebar'
import { type BotBrain, type EntryInput, HarnessState, Task, type UsageCall, UsageRun } from './types'

// The manager starts with a fixed duty as the main bot; every other bot is shaped by its name and the user.
const defaultPurpose = (id: string) => (id === MAIN_BOT_ID ? strings().harness.store.mainBotDuty : '')

const EMPTY: HarnessState = { userFacts: [], bots: {}, roster: [], pending: [], onboardedAt: null }

// Applied in order on open; a database's `user_version` is how many of them it has seen. Append only, never edit.
// A new kind of stored JSON gets one too, even an empty one: older builds then refuse the file instead of dropping what
// they cannot parse.
const MIGRATIONS = [
  `create table entries (bot_id text not null, seq integer not null, data text not null, primary key (bot_id, seq)) strict;
   create table kv (key text primary key, value text not null) strict;`,
  `alter table entries rename column bot_id to transcript_id;
   create table tasks (id text primary key, bot_id text not null, data text not null) strict;
   create index tasks_by_bot on tasks (bot_id);`,
  'select 1; -- entries of kind task-result',
  'select 1; -- bot flows, and the flow a task or routine follows',
  `create table usage (at integer not null, run_id text not null, transcript_id text not null, bot_id text not null,
     model text not null, input integer not null, cached integer not null, output integer not null) strict;
   create index usage_by_time on usage (at);`,
  'create table deleted (transcript_id text not null, seq integer not null, primary key (transcript_id, seq)) strict;',
  'select 1; -- bot mini apps, and the mini app a task changes',
  'select 1; -- bot skills, and entries of kind skill-answer',
  'select 1; -- bot duties, and entries of kind duty-answer',
]

// entries stay as written; a message the user deleted is listed in `deleted` and every read of messages skips it
const NOT_DELETED =
  'not exists (select 1 from deleted where deleted.transcript_id = entries.transcript_id and deleted.seq = entries.seq)'

const UNFINISHED_FIRST =
  "case when json_valid(data) then json_extract(data, '$.status') in ('waiting', 'running') end desc, case when json_valid(data) then json_extract(data, '$.createdAt') end desc"

const newBrain = (id: string, name: string): BotBrain => ({
  id,
  name,
  duty: dutyOf(defaultPurpose(id)),
  memories: [],
  summary: '',
  summarizedUpTo: 0,
  routines: [],
  flows: [],
  miniApps: [],
  skills: [],
})

/**
 * One SQLite file: transcripts in `entries` (append-only), a bot's chat under its id and a task's run under the task's id,
 * the messages the user deleted from them in `deleted`;
 * tasks in `tasks`; bot brains and the sidebar as JSON values in `kv`.
 */
export function createStore(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  try {
    db.exec('pragma journal_mode = wal')
    migrate(db)
  } catch (error) {
    db.close()
    throw error
  }

  const readValue = db.prepare('select value from kv where key = ?')
  const writeValue = db.prepare(
    'insert into kv (key, value) values (?, ?) on conflict (key) do update set value = excluded.value',
  )
  // case, not and: sqlite may evaluate json_extract first, and it throws on a hand-edited row that is not JSON
  const readHistory = db.prepare(
    `select data from entries where transcript_id = ? and ${NOT_DELETED} and case when json_valid(data) then json_extract(data, '$.kind') <> 'tool' or json_extract(data, '$.name') in ('save_flow', 'install_skill', 'propose_duty', 'ask_user') end order by seq`,
  )
  const readLastReply = db.prepare(
    `select data from entries where transcript_id = ? and ${NOT_DELETED} and case when json_valid(data) then json_extract(data, '$.kind') = 'bot' end order by seq desc limit 1`,
  )
  // what tells which asks still wait on the user: the asks, the answers to cards, and the user's last message
  const readDecisionEntries = db.prepare(
    `select data from entries where transcript_id = ? and ${NOT_DELETED} and case when json_valid(data) then json_extract(data, '$.kind') in ('duty-answer', 'skill-answer') or (json_extract(data, '$.kind') = 'tool' and json_extract(data, '$.name') in ('install_skill', 'propose_duty', 'ask_user')) end order by seq`,
  )
  const readLastUserEntry = db.prepare(
    `select data from entries where transcript_id = ? and ${NOT_DELETED} and case when json_valid(data) then json_extract(data, '$.kind') = 'user' end order by seq desc limit 1`,
  )
  const readToolEntries = db.prepare(
    "select data from entries where (transcript_id = ? or transcript_id in (select id from tasks where bot_id = ?)) and case when json_valid(data) then json_extract(data, '$.kind') = 'tool' and json_extract(data, '$.name') = ? end order by json_extract(data, '$.at'), seq",
  )
  const readRange = db.prepare(
    `select data from entries where transcript_id = ? and seq between ? and ? and ${NOT_DELETED} order by seq`,
  )
  const countMessages = db.prepare(
    `select count(*) as count from entries where transcript_id = ? and seq in (select value from json_each(?)) and ${NOT_DELETED} and case when json_valid(data) then json_extract(data, '$.kind') in ('user', 'bot') end`,
  )
  const insertDeleted = db.prepare('insert into deleted (transcript_id, seq) select ?, value from json_each(?)')
  const nextSeq = db.prepare('select coalesce(max(seq), 0) + 1 as seq from entries where transcript_id = ?')
  const insertEntry = db.prepare('insert into entries (transcript_id, seq, data) values (?, ?, ?)')
  const writeTask = db.prepare('insert or replace into tasks (id, bot_id, data) values (?, ?, ?)')
  const readTask = db.prepare('select data from tasks where id = ?')
  const readTasksOf = db.prepare(`select data from tasks where bot_id = ? order by ${UNFINISHED_FIRST} limit ?`)
  const readTasksRequestedBy = db.prepare(
    `select data from tasks where case when json_valid(data) then json_extract(data, '$.requestedBy') = ? end order by ${UNFINISHED_FIRST} limit ?`,
  )
  const readUnfinishedTasks = db.prepare(
    "select data from tasks where case when json_valid(data) then json_extract(data, '$.status') in ('waiting', 'running') end",
  )
  const insertUsage = db.prepare(
    'insert into usage (at, run_id, transcript_id, bot_id, model, input, cached, output) values (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const readUsageRuns = db.prepare(
    'select min(at) as at, run_id as runId, transcript_id as transcriptId, bot_id as botId, model, sum(input) as input, sum(cached) as cached, sum(output) as output from usage where at >= ? group by run_id, transcript_id, bot_id, model',
  )
  const readFirstUsage = db.prepare('select min(at) as at from usage')
  const deleteEntries = db.prepare(
    'delete from entries where transcript_id = ? or transcript_id in (select id from tasks where bot_id = ?)',
  )
  const deleteDeleted = db.prepare(
    'delete from deleted where transcript_id = ? or transcript_id in (select id from tasks where bot_id = ?)',
  )
  const deleteTasks = db.prepare('delete from tasks where bot_id = ?')
  const deleteUsage = db.prepare('delete from usage where bot_id = ?')

  const value = (key: string) => readValue.get(key)?.value
  let state: HarnessState = load()

  function load(): HarnessState {
    const stored = value('state')
    if (typeof stored !== 'string') return EMPTY
    try {
      return HarnessState.parse(JSON.parse(stored))
    } catch (error) {
      // keep the broken value (e.g. a hand edit with a typo) instead of overwriting memories with an empty state
      const backup = `state.corrupt-${Date.now()}`
      writeValue.run(backup, stored)
      console.error(`stored state unreadable, kept as ${backup}:`, error)
      return EMPTY
    }
  }

  function save(next: HarnessState) {
    writeValue.run('state', JSON.stringify(next))
    state = next
  }

  function syncRoster(bots: Pick<Bot, 'id' | 'name'>[]): NewBot[] {
    const ids = new Set(bots.map((b) => b.id))
    const pending = state.pending.filter((p) => !ids.has(p.id))
    const next = { ...state.bots }
    for (const b of bots) next[b.id] = next[b.id] ? { ...next[b.id], name: b.name } : newBrain(b.id, b.name)
    save({ ...state, bots: next, roster: [...ids, ...pending.map((p) => p.id)], pending })
    return pending
  }

  /** null until the renderer saves one. */
  function readSidebar(): SidebarState | null {
    const stored = value('sidebar')
    if (typeof stored !== 'string') return null
    try {
      const parsed = SidebarState.safeParse(JSON.parse(stored))
      return parsed.success ? parsed.data : null
    } catch {
      return null // not JSON: the renderer starts from its initial sidebar and overwrites it on the next change
    }
  }

  return {
    get: () => state,
    update: (fn: (s: HarnessState) => HarnessState) => save(fn(state)),
    updateBot(botId: string, patch: Partial<BotBrain>) {
      const bot = state.bots[botId]
      if (!bot) throw new Error(strings().harness.unknownBot(botId))
      save({ ...state, bots: { ...state.bots, [botId]: { ...bot, ...patch } } })
    },
    /** The transcript without the tool audit trail: filtered in SQL, so tool outputs are never loaded. */
    history: (transcriptId: string) => parseRows(Entry, readHistory.all(transcriptId)),
    /** Entries `from`..`to` by seq (to the end by default), tool records included. */
    range: (transcriptId: string, from: number, to = Number.MAX_SAFE_INTEGER) =>
      parseRows(Entry, readRange.all(transcriptId, from, to)),
    lastReply(transcriptId: string): string | undefined {
      const [entry] = parseRows(Entry, readLastReply.all(transcriptId))
      return entry?.kind === 'bot' ? entry.text : undefined
    },
    toolEntries: (botId: string, name: string) => parseRows(Entry, readToolEntries.all(botId, botId, name)),
    /** How many asks in a chat still wait on the user, read from only the entries that tell. */
    decisionCount: (botId: string) =>
      pendingDecisions(
        [...parseRows(Entry, readDecisionEntries.all(botId)), ...parseRows(Entry, readLastUserEntry.all(botId))],
        Date.now(),
      ).length,
    append(transcriptId: string, input: EntryInput): Entry {
      const entry: Entry = { ...input, seq: Number(nextSeq.get(transcriptId)?.seq), at: Date.now() }
      insertEntry.run(transcriptId, entry.seq, JSON.stringify(entry))
      return entry
    },
    /** Hides user and bot messages of a chat from every read; the entries themselves are kept as written. */
    deleteMessages(transcriptId: string, seqs: number[]) {
      const unique = [...new Set(seqs)]
      const list = JSON.stringify(unique)
      if (Number(countMessages.get(transcriptId, list)?.count) !== unique.length)
        throw new Error(strings().harness.store.chatOnly)
      insertDeleted.run(transcriptId, list)
    },
    saveTask(task: Task) {
      writeTask.run(task.id, task.botId, JSON.stringify(task))
    },
    task(id: string): Task | undefined {
      const [task] = parseRows(Task, readTask.all(id))
      return task
    },
    tasksOf: (botId: string, limit: number) => parseRows(Task, readTasksOf.all(botId, limit)),
    tasksRequestedBy: (botId: string, limit: number) => parseRows(Task, readTasksRequestedBy.all(botId, limit)),
    unfinishedTasks: () => parseRows(Task, readUnfinishedTasks.all()),
    /** One model call: what the API counted, under the run (chat turn or task) it belongs to. */
    addUsage(call: UsageCall) {
      const { at, runId, transcriptId, botId, model, input, cached, output } = call
      insertUsage.run(at, runId, transcriptId, botId, model, input, cached, output)
    },
    /** The calls since `at`, summed per run and model. */
    usageRuns: (at: number) => UsageRun.array().parse(readUsageRuns.all(at)),
    firstUsageAt(): number | null {
      const at = readFirstUsage.get()?.at
      return typeof at === 'number' ? at : null
    },
    /**
     * Bots shown in the sidebar; brains are created on first sight and kept (with their memories) when a bot is removed.
     * Returns bots created by the harness that the sidebar has not shown yet (its event was missed, e.g. during a reload).
     */
    syncRoster,
    addBot(bot: NewBot, purpose: string) {
      save({
        ...state,
        bots: { ...state.bots, [bot.id]: { ...newBrain(bot.id, bot.name), duty: dutyOf(purpose) } },
        roster: [...state.roster, bot.id],
        pending: [...state.pending, bot],
      })
    },
    /** null until the renderer saves one: it then starts from its initial sidebar. */
    sidebar: readSidebar,
    /** Saves the sidebar and syncs the roster with its bots; returns what `syncRoster` returns. */
    saveSidebar(sidebar: SidebarState): NewBot[] {
      writeValue.run('sidebar', JSON.stringify(sidebar))
      return syncRoster(sidebar.bots)
    },
    /** Deletes a bot's brain, its chats and tasks with what became of them, its usage, and its place in the recycle bin. */
    deleteBot(botId: string) {
      if (!state.bots[botId]) throw new Error(strings().harness.unknownBot(botId))
      db.exec('begin')
      try {
        deleteDeleted.run(botId, botId)
        deleteEntries.run(botId, botId)
        deleteTasks.run(botId)
        deleteUsage.run(botId)
        db.exec('commit')
      } catch (error) {
        db.exec('rollback')
        throw error
      }
      const bots = Object.fromEntries(Object.entries(state.bots).filter(([id]) => id !== botId))
      save({
        ...state,
        bots,
        roster: state.roster.filter((id) => id !== botId),
        pending: state.pending.filter((bot) => bot.id !== botId),
      })
      const sidebar = readSidebar()
      if (sidebar?.dismissed.some(({ bot }) => bot.id === botId))
        writeValue.run(
          'sidebar',
          JSON.stringify({ ...sidebar, dismissed: sidebar.dismissed.filter(({ bot }) => bot.id !== botId) }),
        )
    },
    /** A consistent copy into a new file, safe while the app keeps writing. */
    backupTo(target: string) {
      db.prepare('vacuum into ?').run(target)
    },
    close: () => db.close(),
  }
}

export type Store = ReturnType<typeof createStore>

function parseRows<T>(schema: z.ZodType<T>, rows: Record<string, unknown>[]): T[] {
  return rows.flatMap((row) => {
    try {
      const parsed = schema.safeParse(JSON.parse(String(row.data)))
      return parsed.success ? [parsed.data] : []
    } catch {
      return [] // a hand-edited row that is not JSON is skipped, not fatal
    }
  })
}

/** Throws a readable reason unless `file` is a Nengyong Bot database this version can open. */
export function checkDatabase(file: string) {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const name = path.basename(file)
    if (!hasTables(db)) throw new Error(strings().harness.store.notDataFile(name))
    checkVersion(db)
  } finally {
    db.close()
  }
}

function hasTables(db: DatabaseSync): boolean {
  try {
    return (
      db.prepare("select name from sqlite_master where type = 'table' and name in ('entries', 'kv')").all().length === 2
    )
  } catch {
    return false // not a database file at all
  }
}

function migrate(db: DatabaseSync) {
  const version = checkVersion(db)
  for (const [index, sql] of MIGRATIONS.entries()) {
    if (index < version) continue
    db.exec('begin')
    try {
      db.exec(sql)
      db.exec(`pragma user_version = ${index + 1}`)
      db.exec('commit')
    } catch (error) {
      db.exec('rollback')
      throw error
    }
  }
}

function checkVersion(db: DatabaseSync): number {
  const version = Number(db.prepare('pragma user_version').get()?.user_version)
  if (version > MIGRATIONS.length) throw new Error(strings().harness.store.newerVersion)
  return version
}
