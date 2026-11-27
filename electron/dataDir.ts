import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkDatabase, type Store } from '../harness/store'
import { strings } from '../shared/strings'
import { TIMEZONE } from '../shared/timezone'

export const DATABASE_FILE = 'nengyongbot.db'
export const LIBRARY_DIR = 'library'
export const SKILLS_DIR = 'skills' // one folder per bot, one per skill in it: harness/skills.ts
const DATA_DIR_FILE = 'data-dir.txt'
const LEGACY_DATABASE_FILE = 'superbot.db' // what backups exported while the app was called Super Bot hold

/** The app home: the model key and `data/`, the data dir, live here. */
export const appHome = () => process.env.NENGYONGBOT_HOME ?? path.join(os.homedir(), '.nengyongbot')

/** The data dir (database + library): `data/` under the home, unless the user moved it elsewhere. */
export function resolveDataDir(home: string): string {
  const moved = movedDataDir(home)
  if (moved === null) {
    const dataDir = path.join(home, 'data')
    fs.mkdirSync(dataDir, { recursive: true })
    return dataDir
  }
  // never create a moved dir that is gone: an empty start would look like lost data
  if (!fs.existsSync(moved)) {
    const file = path.join(home, DATA_DIR_FILE)
    throw new Error(strings().main.data.missing(moved, file))
  }
  return moved
}

function movedDataDir(home: string): string | null {
  const file = path.join(home, DATA_DIR_FILE)
  if (!fs.existsSync(file)) return null
  const dir = fs.readFileSync(file, 'utf8').trim()
  if (!path.isAbsolute(dir)) throw new Error(strings().main.data.notAbsolute(file))
  return dir
}

/** Throws a readable reason unless the data dir can move into `parent`; returns where it would go. */
export function moveTarget(parent: string, dataDir: string): string {
  const target = path.join(parent, strings().main.data.folderName)
  if (isInside(target, dataDir)) throw new Error(strings().main.data.moveInside)
  if (fs.existsSync(target)) throw new Error(strings().main.data.folderExists(target))
  return target
}

/**
 * Moves the data dir to `target` (check it with `moveTarget` first) and has the next start open it there.
 * Closes the store: the app has to restart afterwards, whether this succeeds or throws.
 */
export function moveData(store: Store, home: string, dataDir: string, target: string) {
  store.close()
  try {
    fs.cpSync(dataDir, target, { recursive: true })
    checkDatabase(path.join(target, DATABASE_FILE))
  } catch (error) {
    fs.rmSync(target, { recursive: true, force: true })
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(strings().main.data.moveFailed(reason))
  }
  fs.writeFileSync(path.join(home, DATA_DIR_FILE), target)
  fs.rmSync(dataDir, { recursive: true, force: true })
}

/** A full copy into a new dated folder under `parent`; returns its path. */
export function exportData(store: Store, from: string, parent: string, now = new Date()): string {
  const target = path.join(parent, strings().main.data.backupName(stamp(now)))
  if (fs.existsSync(target)) throw new Error(strings().main.data.backupExists(target))
  copyData(store, from, target)
  return target
}

/** Throws a readable reason unless `source` is a backup that can replace the data in `dataDir`. */
export function checkBackup(source: string, dataDir: string) {
  if (isInside(source, dataDir) || isInside(dataDir, source)) throw new Error(strings().main.data.importInUse)
  const file = [DATABASE_FILE, LEGACY_DATABASE_FILE].map((name) => path.join(source, name)).find(fs.existsSync)
  if (!file) throw new Error(strings().main.data.noData(DATABASE_FILE))
  checkDatabase(file)
}

/**
 * Replaces the data dir with a copy of `source` (check it with `checkBackup` first) and returns where the current
 * data was kept. Closes the store: the app has to restart afterwards, whether this succeeds or throws.
 */
export function importData(store: Store, dataDir: string, source: string, now = new Date()): string {
  store.close()
  const kept = `${dataDir}.before-import-${stamp(now)}`
  fs.renameSync(dataDir, kept)
  try {
    fs.cpSync(source, dataDir, { recursive: true })
    renameLegacyDatabase(dataDir)
  } catch (error) {
    fs.rmSync(dataDir, { recursive: true, force: true })
    fs.renameSync(kept, dataDir)
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(strings().main.data.importFailed(reason))
  }
  return kept
}

function renameLegacyDatabase(dir: string) {
  // a -wal beside another database would be replayed into it, so the legacy one moves only with its own database
  if (fs.existsSync(path.join(dir, DATABASE_FILE))) return
  for (const suffix of ['-wal', '-shm', '']) {
    const legacy = path.join(dir, LEGACY_DATABASE_FILE + suffix)
    if (fs.existsSync(legacy)) fs.renameSync(legacy, path.join(dir, DATABASE_FILE + suffix))
  }
}

function copyData(store: Store, from: string, to: string) {
  fs.mkdirSync(to, { recursive: true })
  const folders = [LIBRARY_DIR, SKILLS_DIR]
  try {
    store.backupTo(path.join(to, DATABASE_FILE))
    for (const folder of folders)
      if (fs.existsSync(path.join(from, folder)))
        fs.cpSync(path.join(from, folder), path.join(to, folder), { recursive: true })
  } catch (error) {
    // remove only what this copy wrote: the folder itself may be one the user just made
    fs.rmSync(path.join(to, DATABASE_FILE), { force: true })
    for (const folder of folders) fs.rmSync(path.join(to, folder), { recursive: true, force: true })
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(strings().main.data.copyFailed(reason))
  }
}

const isInside = (child: string, parent: string) => {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** App time as `2026-11-18 2305`: sortable, and without the colons Finder cannot show in a name. */
const stamp = (date: Date) => date.toLocaleString('sv-SE', { timeZone: TIMEZONE }).slice(0, 16).replace(':', '')
