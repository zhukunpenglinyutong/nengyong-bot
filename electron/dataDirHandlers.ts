import { type BrowserWindow, dialog, shell } from 'electron'
import type { Store } from '../harness/store'
import type { NengyongBotBridge } from '../shared/bridge'
import { strings } from '../shared/strings'
import { checkBackup, exportData, importData, moveData, moveTarget } from './dataDir'
import type { Handler } from './handlers'

interface Options {
  window: () => BrowserWindow | null
  home: string
  dataDir: string
  store: Store
  restart: () => void
}

/** The data dir actions of the settings window. Folders come from native dialogs, never as paths from the renderer. */
export function createDataDirHandlers({ window, home, dataDir, store, restart }: Options) {
  const pickFolder = async (title: string, buttonLabel: string) => {
    const options = { title, buttonLabel, properties: ['openDirectory' as const, 'createDirectory' as const] }
    const parent = window()
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }
  const confirm = async (message: string, detail: string, confirmLabel: string) => {
    const options = {
      type: 'warning' as const,
      message,
      detail,
      buttons: [strings().main.dataDialogs.cancel, confirmLabel],
      defaultId: 1,
      cancelId: 0,
    }
    const parent = window()
    const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
    return result.response === 1
  }

  // the restart that has to follow closes the window before a thrown error could reach the settings page
  const showFailure = (title: string, error: unknown) =>
    dialog.showErrorBox(title, error instanceof Error ? error.message : String(error))

  return {
    getDataDir: () => dataDir,
    openDataDir: async () => {
      const error = await shell.openPath(dataDir)
      if (error) throw new Error(strings().main.dataDialogs.cannotOpen(error))
    },
    moveDataDir: async () => {
      const parent = await pickFolder(strings().main.dataDialogs.movePick, strings().main.dataDialogs.movePickButton)
      if (!parent) return
      const target = moveTarget(parent, dataDir)
      const detail = strings().main.dataDialogs.moveDetail(target, dataDir)
      const isConfirmed = await confirm(
        strings().main.dataDialogs.moveConfirm,
        detail,
        strings().main.dataDialogs.moveButton,
      )
      if (!isConfirmed) return
      try {
        moveData(store, home, dataDir, target)
      } catch (error) {
        showFailure(strings().main.dataDialogs.moveFailed, error)
      } finally {
        restart() // the store is closed either way; the next start opens whichever data dir data-dir.txt names
      }
    },
    exportData: async () => {
      const parent = await pickFolder(
        strings().main.dataDialogs.exportPick,
        strings().main.dataDialogs.exportPickButton,
      )
      if (!parent) return null
      const target = exportData(store, dataDir, parent)
      shell.showItemInFolder(target)
      return target
    },
    importData: async () => {
      const source = await pickFolder(
        strings().main.dataDialogs.importPick,
        strings().main.dataDialogs.importPickButton,
      )
      if (!source) return
      checkBackup(source, dataDir)
      const detail = strings().main.dataDialogs.importDetail(dataDir)
      const isConfirmed = await confirm(
        strings().main.dataDialogs.importConfirm,
        detail,
        strings().main.dataDialogs.importButton,
      )
      if (!isConfirmed) return
      try {
        importData(store, dataDir, source)
      } catch (error) {
        showFailure(strings().main.dataDialogs.importFailed, error)
      } finally {
        restart() // the store is closed either way; the next start opens whichever data is in place
      }
    },
  } satisfies Partial<Record<keyof NengyongBotBridge, Handler>>
}
