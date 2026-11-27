// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import { createStore, type Store } from '../harness/store'
import {
  checkBackup,
  DATABASE_FILE,
  exportData,
  importData,
  LIBRARY_DIR,
  moveData,
  moveTarget,
  resolveDataDir,
  SKILLS_DIR,
} from './dataDir'

let home: string
let dataDir: string
let store: Store
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'))
  dataDir = resolveDataDir(home)
  store = createStore(path.join(dataDir, DATABASE_FILE))
  store.append('chief', { kind: 'user', text: '你好' })
  fs.mkdirSync(path.join(dataDir, LIBRARY_DIR))
  fs.writeFileSync(path.join(dataDir, LIBRARY_DIR, '周报.md'), '# 周报')
})

const entriesIn = (dir: string) => createStore(path.join(dir, DATABASE_FILE)).history('chief')

it('keeps the data in data/ under the app home', () => {
  expect(dataDir).toBe(path.join(home, 'data'))
})

it('exports a dated folder with the database and the library', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'export-'))
  const target = exportData(store, dataDir, parent, new Date('2026-11-18T23:05:00+08:00'))
  expect(path.basename(target)).toBe('Nengyong Bot 备份 2026-11-18 2305')
  expect(entriesIn(target)).toMatchObject([{ text: '你好' }])
  expect(fs.existsSync(path.join(target, LIBRARY_DIR, '周报.md'))).toBe(true)
})

it('exports the skills of the bots with the rest', () => {
  fs.mkdirSync(path.join(dataDir, SKILLS_DIR, 'chief', 'pdf'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, SKILLS_DIR, 'chief', 'pdf', 'SKILL.md'), '# PDF')
  const target = exportData(store, dataDir, fs.mkdtempSync(path.join(os.tmpdir(), 'export-')))
  expect(fs.readFileSync(path.join(target, SKILLS_DIR, 'chief', 'pdf', 'SKILL.md'), 'utf8')).toBe('# PDF')
})

it('imports a backup in place of the current data and keeps the current data next to it', () => {
  const backup = exportData(store, dataDir, fs.mkdtempSync(path.join(os.tmpdir(), 'export-')))
  store.append('chief', { kind: 'user', text: '导出之后的消息' })
  checkBackup(backup, dataDir)
  const kept = importData(store, dataDir, backup, new Date('2026-11-18T23:05:00+08:00'))
  expect(entriesIn(dataDir)).toMatchObject([{ text: '你好' }])
  expect(kept).toBe(`${dataDir}.before-import-2026-11-18 2305`)
  expect(entriesIn(kept)).toHaveLength(2)
})

it('refuses to import a folder that holds no Nengyong Bot database', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'random-'))
  expect(() => checkBackup(folder, dataDir)).toThrow('没有 Nengyong Bot 的数据')
})

it('refuses to import the data dir into itself', () => {
  expect(() => checkBackup(dataDir, dataDir)).toThrow('当前')
})

it('moves the data dir into the chosen folder and opens it there from then on', () => {
  const target = moveTarget(fs.mkdtempSync(path.join(os.tmpdir(), 'move-')), dataDir)
  moveData(store, home, dataDir, target)
  expect(resolveDataDir(home)).toBe(target)
  expect(entriesIn(target)).toMatchObject([{ text: '你好' }])
  expect(fs.existsSync(path.join(target, LIBRARY_DIR, '周报.md'))).toBe(true)
  expect(fs.existsSync(dataDir)).toBe(false)
})

it('refuses to move the data dir into itself', () => {
  expect(() => moveTarget(path.join(dataDir, LIBRARY_DIR), dataDir)).toThrow('当前数据目录里面')
})

it('refuses to move onto a folder that already exists', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'move-'))
  fs.mkdirSync(moveTarget(parent, dataDir))
  expect(() => moveTarget(parent, dataDir)).toThrow('已有同名的文件夹')
})

it('refuses to start on a moved data dir that is gone, instead of creating an empty one', () => {
  const target = moveTarget(fs.mkdtempSync(path.join(os.tmpdir(), 'move-')), dataDir)
  moveData(store, home, dataDir, target)
  fs.rmSync(target, { recursive: true })
  expect(() => resolveDataDir(home)).toThrow('找不到数据目录')
  expect(fs.existsSync(target)).toBe(false)
})

it('imports a folder an older Super Bot version used, with the writes still in its -wal', () => {
  store.append('chief', { kind: 'user', text: '还在 -wal 里' })
  const legacy = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-'))
  for (const suffix of ['', '-wal', '-shm']) {
    fs.copyFileSync(path.join(dataDir, DATABASE_FILE + suffix), path.join(legacy, `superbot.db${suffix}`))
  }
  checkBackup(legacy, dataDir)
  importData(store, dataDir, legacy)
  expect(entriesIn(dataDir)).toMatchObject([{ text: '你好' }, { text: '还在 -wal 里' }])
})

it('leaves an older -wal alone when the imported folder already holds the new database', () => {
  const backup = exportData(store, dataDir, fs.mkdtempSync(path.join(os.tmpdir(), 'export-')))
  fs.writeFileSync(path.join(backup, 'superbot.db-wal'), 'not this database’s log')
  importData(store, dataDir, backup)
  expect(fs.readFileSync(path.join(dataDir, 'superbot.db-wal'), 'utf8')).toBe('not this database’s log')
  expect(entriesIn(dataDir)).toMatchObject([{ text: '你好' }])
})

it('imports a backup an older Super Bot version exported', () => {
  const backup = exportData(store, dataDir, fs.mkdtempSync(path.join(os.tmpdir(), 'export-')))
  fs.renameSync(path.join(backup, DATABASE_FILE), path.join(backup, 'superbot.db'))
  checkBackup(backup, dataDir)
  importData(store, dataDir, backup)
  expect(entriesIn(dataDir)).toMatchObject([{ text: '你好' }])
})
