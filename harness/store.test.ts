// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MAIN_BOT } from '../shared/bot'
import { SidebarState } from '../shared/sidebar'
import { checkDatabase, createStore } from './store'
import type { Task } from './types'

let file: string
beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'store-')), 'data', 'nengyongbot.db')
})

/** Writes straight into the database, the way a hand edit or an older build would. */
function raw(sql: string, ...params: string[]) {
  const db = new DatabaseSync(file)
  db.prepare(sql).run(...params)
  db.close()
}

const texts = (entries: { kind: string }[]) => entries.map((entry) => ('text' in entry ? entry.text : ''))

it('keeps entries in order across a reopen and continues their numbering', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'user', text: 'a' })
  store.close()
  const reopened = createStore(file)
  expect(reopened.append('chief', { kind: 'bot', text: 'b' }).seq).toBe(2)
  expect(texts(reopened.history('chief'))).toEqual(['a', 'b'])
})

it('leaves the tool audit trail out of the history', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'user', text: 'a' })
  store.append('chief', { kind: 'tool', name: 'fetch_url', output: 'page' })
  store.append('chief', { kind: 'bot', text: 'b' })
  store.append('chief', { kind: 'user', text: 'c' })
  expect(texts(store.history('chief'))).toEqual(['a', 'b', 'c'])
})

it('keeps save_flow records in the history, since the level counts the flows saved', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'tool', name: 'fetch_url', output: 'page' })
  store.append('chief', {
    kind: 'tool',
    name: 'save_flow',
    output: { saved: 'f1', isNew: true, mention: '[发版](flow:f1)' },
  })
  expect(store.history('chief').map((entry) => entry.kind === 'tool' && entry.name)).toEqual(['save_flow'])
})

it('reads a stretch of a transcript by seq, tool records included', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'user', text: 'a' })
  store.append('chief', { kind: 'tool', name: 'fetch_url', input: {}, output: 'page' })
  store.append('chief', { kind: 'bot', text: 'b' })
  store.append('chief', { kind: 'user', text: 'c' })
  expect(store.range('chief', 2, 3).map((entry) => entry.kind)).toEqual(['tool', 'bot'])
})

it('finds the last reply of a bot, past later user and tool entries', () => {
  const store = createStore(file)
  expect(store.lastReply('chief')).toBeUndefined()
  store.append('chief', { kind: 'bot', text: '旧' })
  store.append('chief', { kind: 'bot', text: '新' })
  store.append('chief', { kind: 'tool', name: 'set_status' })
  store.append('chief', { kind: 'user', text: '还在吗' })
  expect(store.lastReply('chief')).toBe('新')
})

it('refuses to change the brain of a bot it does not know', () => {
  expect(() => createStore(file).updateBot('ghost', { instructions: 'x' })).toThrow('未知的 Bot')
})

it('numbers each bot on its own', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'user', text: 'a' })
  expect(store.append('bnew', { kind: 'user', text: 'b' }).seq).toBe(1)
})

it('skips stored entries that are valid JSON but not entries', () => {
  createStore(file).append('chief', { kind: 'user', text: 'a' })
  raw(
    `insert into entries (transcript_id, seq, data) values ('chief', 2, '{"kind":"alien"}'), ('chief', 3, 'not json')`,
  )
  expect(createStore(file).history('chief')).toHaveLength(1)
})

it('reads back a tool entry whose tool returned nothing', () => {
  createStore(file).append('chief', { kind: 'tool', name: 'set_status', input: { text: '核对' }, output: undefined })
  expect(createStore(file).toolEntries('chief', 'set_status')).toMatchObject([{ kind: 'tool', name: 'set_status' }])
})

it('keeps an unreadable state aside instead of overwriting it', () => {
  createStore(file).close()
  raw(`insert into kv (key, value) values ('state', '{"userFacts": [ broken')`)
  createStore(file).syncRoster([{ id: 'chief', name: 'CEO' }])
  const db = new DatabaseSync(file)
  const keys = db
    .prepare('select key from kv')
    .all()
    .map((row) => String(row.key))
  db.close()
  expect(keys.some((key) => key.startsWith('state.corrupt-'))).toBe(true)
})

it('fills in what a stored state leaves out and ignores fields it does not know', () => {
  createStore(file).close()
  raw(
    `insert into kv (key, value) values ('state', ?)`,
    JSON.stringify({ bots: { chief: { id: 'chief', name: 'CEO', mood: 'fine' } }, theme: 'dark' }),
  )
  expect(createStore(file).get()).toEqual({
    userFacts: [],
    bots: {
      chief: {
        id: 'chief',
        name: 'CEO',
        instructions: '',
        memories: [],
        summary: '',
        summarizedUpTo: 0,
        routines: [],
        flows: [],
        miniApps: [],
        skills: [],
      },
    },
    roster: [],
    pending: [],
    onboardedAt: null,
  })
})

it('keeps state changes across a reopen', () => {
  const store = createStore(file)
  store.update((state) => ({ ...state, userFacts: [{ id: 'u1', text: '偏好北京时间', at: 1 }] }))
  store.close()
  expect(createStore(file).get().userFacts).toEqual([{ id: 'u1', text: '偏好北京时间', at: 1 }])
})

it('hands back bots the sidebar missed and keeps them in the roster until it shows them', () => {
  const store = createStore(file)
  store.addBot({ id: 'bnew', name: '周报', shape: 'diamond', color: '#1E1E22' }, '写周报')
  expect(store.syncRoster([{ id: 'chief', name: 'CEO' }]).map((bot) => bot.id)).toEqual(['bnew'])
  expect(store.get().roster).toContain('bnew')
  expect(
    store.syncRoster([
      { id: 'chief', name: 'CEO' },
      { id: 'bnew', name: '周报' },
    ]),
  ).toEqual([])
})

it('has no sidebar until one is saved, then keeps it across a reopen', () => {
  const store = createStore(file)
  expect(store.sidebar()).toBeNull()
  const sidebar = SidebarState.parse({ bots: [MAIN_BOT], sections: [{ id: 's1', name: '工作', collapsed: true }] })
  store.saveSidebar(sidebar)
  store.close()
  expect(createStore(file).sidebar()).toEqual(sidebar)
})

it('syncs the roster with the bots of a saved sidebar', () => {
  const store = createStore(file)
  store.saveSidebar(SidebarState.parse({ bots: [MAIN_BOT] }))
  expect(store.get().roster).toEqual(['chief'])
})

it('backs up into a database that opens with the same data', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'user', text: 'a' })
  const copy = path.join(path.dirname(file), 'copy.db')
  store.backupTo(copy)
  expect(() => checkDatabase(copy)).not.toThrow()
  expect(texts(createStore(copy).history('chief'))).toEqual(['a'])
})

it('refuses a file that is not a Nengyong Bot database', () => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'hello')
  expect(() => checkDatabase(file)).toThrow('不是 Nengyong Bot 的数据')
})

it('refuses a database written by a newer version', () => {
  createStore(file).close()
  raw('pragma user_version = 999')
  expect(() => checkDatabase(file)).toThrow('更新版本')
  expect(() => createStore(file)).toThrow('更新版本')
})

it('reads only the tool entries with the given name, skipping rows that are not JSON', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'user', text: 'write_file' })
  store.append('chief', { kind: 'tool', name: 'read_file', output: 'x' })
  store.append('chief', { kind: 'tool', name: 'write_file', output: { written: 'a.md' } })
  store.close()
  raw('insert into entries (transcript_id, seq, data) values (?, ?, ?)', 'chief', '9', 'not json')
  const reopened = createStore(file)
  expect(reopened.toolEntries('chief', 'write_file').map((entry) => entry.seq)).toEqual([3])
})

const task = (patch: Partial<Task> = {}): Task => ({
  id: 't1',
  botId: 'chief',
  requestedBy: 'chief',
  source: { kind: 'chat' },
  title: '日报',
  status: 'running',
  statusText: '',
  createdAt: 1,
  ...patch,
})

afterEach(() => {
  vi.useRealTimers()
})

it('keeps the entries of a database from before tasks existed, under their bot', () => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(`create table entries (bot_id text not null, seq integer not null, data text not null, primary key (bot_id, seq)) strict;
    create table kv (key text primary key, value text not null) strict;
    pragma user_version = 1;`)
  db.prepare('insert into entries (bot_id, seq, data) values (?, ?, ?)').run(
    'chief',
    1,
    JSON.stringify({ kind: 'user', text: '旧消息', seq: 1, at: 1 }),
  )
  db.close()
  const store = createStore(file)
  expect(texts(store.history('chief'))).toEqual(['旧消息'])
  expect(store.append('chief', { kind: 'bot', text: '新回复' }).seq).toBe(2)
})

it('reads a saved task back, with its latest state', () => {
  const store = createStore(file)
  store.saveTask(task())
  store.saveTask(task({ status: 'done', endedAt: 2 }))
  expect(store.task('t1')).toEqual(task({ status: 'done', endedAt: 2 }))
  expect(store.task('t2')).toBeUndefined()
})

it('lists the tasks of one bot, newest first and up to a limit', () => {
  const store = createStore(file)
  store.saveTask(task({ id: 't1', createdAt: 1 }))
  store.saveTask(task({ id: 't2', createdAt: 3 }))
  store.saveTask(task({ id: 't3', createdAt: 2 }))
  store.saveTask(task({ id: 't4', botId: 'secretary', createdAt: 4 }))
  expect(store.tasksOf('chief', 2).map((saved) => saved.id)).toEqual(['t2', 't3'])
})

it('lists the tasks that were waiting or running, across bots', () => {
  const store = createStore(file)
  store.saveTask(task({ id: 't1', status: 'running' }))
  store.saveTask(task({ id: 't2', status: 'done' }))
  store.saveTask(task({ id: 't3', botId: 'secretary', status: 'waiting' }))
  expect(
    store
      .unfinishedTasks()
      .map((saved) => saved.id)
      .sort(),
  ).toEqual(['t1', 't3'])
})

it('skips a stored task that does not parse', () => {
  createStore(file).close()
  raw(`insert into tasks (id, bot_id, data) values ('t1', 'chief', 'not json'), ('t2', 'chief', '{"id":"t2"}')`)
  const store = createStore(file)
  expect(store.task('t1')).toBeUndefined()
  expect(store.tasksOf('chief', 10)).toEqual([])
})

it('numbers the entries of a task on their own and reads them back by its id', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'user', text: 'a' })
  expect(store.append('t1', { kind: 'from-bot', from: 'chief', text: '查日程' }).seq).toBe(1)
  expect(texts(store.range('t1', 1))).toEqual(['查日程'])
})

it("finds a bot's tool entries in its own chat and in its tasks, in the order they were written", () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const store = createStore(file)
  store.saveTask(task({ id: 't1', botId: 'chief' }))
  store.saveTask(task({ id: 't2', botId: 'secretary' }))
  const write = (transcriptId: string, written: string, at: number) => {
    vi.setSystemTime(at)
    store.append(transcriptId, { kind: 'tool', name: 'write_file', output: { written } })
  }
  write('chief', 'chat.md', 3)
  write('t1', 'task.md', 2)
  write('t2', 'other.md', 1)
  write('secretary', 'theirs.md', 1)
  expect(store.toolEntries('chief', 'write_file').map((entry) => entry.at)).toEqual([2, 3])
})

it('lists the tasks a bot asked for, whichever bot runs them, newest first', () => {
  const store = createStore(file)
  store.saveTask(task({ id: 't1', botId: 'secretary', requestedBy: 'chief', createdAt: 1 }))
  store.saveTask(task({ id: 't2', botId: 'chief', requestedBy: 'chief', createdAt: 2 }))
  store.saveTask(task({ id: 't3', botId: 'chief', requestedBy: 'secretary', createdAt: 3 }))
  expect(store.tasksRequestedBy('chief', 10).map((saved) => saved.id)).toEqual(['t2', 't1'])
})

it('lists unfinished tasks before ended ones, so a long task is never cut off by the limit', () => {
  const store = createStore(file)
  store.saveTask(task({ id: 't1', status: 'running', createdAt: 1 }))
  store.saveTask(task({ id: 't2', status: 'done', createdAt: 2 }))
  store.saveTask(task({ id: 't3', status: 'done', createdAt: 3 }))
  expect(store.tasksOf('chief', 2).map((saved) => saved.id)).toEqual(['t1', 't3'])
  expect(store.tasksRequestedBy('chief', 2).map((saved) => saved.id)).toEqual(['t1', 't3'])
})

it('leaves deleted messages out of the history, a stretch by seq and the last reply', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'user', text: 'a' })
  store.append('chief', { kind: 'bot', text: 'b' })
  store.append('chief', { kind: 'user', text: 'c' })
  store.append('chief', { kind: 'bot', text: 'd' })
  store.deleteMessages('chief', [2, 4])
  expect(texts(store.history('chief'))).toEqual(['a', 'c'])
  expect(texts(store.range('chief', 1))).toEqual(['a', 'c'])
  expect(store.lastReply('chief')).toBeUndefined()
})

it('keeps numbering after a deleted last message, so a new one never takes its seq', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'user', text: 'a' })
  store.append('chief', { kind: 'bot', text: 'b' })
  store.deleteMessages('chief', [2])
  expect(store.append('chief', { kind: 'bot', text: 'c' }).seq).toBe(3)
  expect(texts(store.history('chief'))).toEqual(['a', 'c'])
})

it('deletes only messages of that chat, leaving the tool records the panel reads', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'user', text: 'a' })
  store.append('chief', { kind: 'tool', name: 'write_file', input: { path: 'a.md' } })
  expect(() => store.deleteMessages('chief', [1, 2])).toThrow('只能删除聊天里的消息')
  expect(() => store.deleteMessages('chief', [9])).toThrow('只能删除聊天里的消息')
  expect(texts(store.history('chief'))).toEqual(['a'])
  expect(store.toolEntries('chief', 'write_file')).toHaveLength(1)
})

it('keeps deletions across a reopen', () => {
  const store = createStore(file)
  store.append('chief', { kind: 'user', text: 'a' })
  store.append('chief', { kind: 'bot', text: 'b' })
  store.deleteMessages('chief', [1])
  store.close()
  expect(texts(createStore(file).history('chief'))).toEqual(['b'])
})
