import path from 'node:path'
import { app, autoUpdater, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell, Tray } from 'electron'
import { scheduleRoutines } from '../harness/routines'
import { createStore, type Store } from '../harness/store'
import type { Workspace } from '../harness/workspace'
import type { HarnessEvent } from '../shared/bridge'
import { setLanguage } from '../shared/language'
import { strings } from '../shared/strings'
import { appHome, DATABASE_FILE, LIBRARY_DIR, resolveDataDir } from './dataDir'
import { createDataDirHandlers } from './dataDirHandlers'
import { createHandlers, type Handler } from './handlers'
import { lockHome } from './homeLock'
import { savedLanguage } from './language'
import { createLanAccess, type LanAccess } from './lanAccess'
import { imageResponse, miniAppResponse } from './libraryResponses'

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const ATTACHMENT_SCHEME = 'nengyongbot-attachment' // preload.ts builds the URLs
const MINI_APP_SCHEME = 'nengyongbot-app' // preload.ts builds the URLs
// set by scripts/dev.mjs, which starts Electron again when it exits with this code
const DEV_RESTART_CODE = process.env.NENGYONGBOT_DEV_RESTART_CODE

// the installed app holds the profile's localStorage lock while it runs; a dev app sharing it silently keeps localStorage in memory
if (DEV_URL) app.setPath('userData', `${app.getPath('userData')}-dev`)
// a second copy in the same profile hands over to the running one; one with another profile needs lockHome, taken below
if (!app.requestSingleInstanceLock()) app.exit(0)

let win: BrowserWindow | null = null
let tray: Tray | null = null // an unreferenced Tray is garbage-collected and its icon disappears
let lan: LanAccess | null = null // set once the handlers it serves to devices exist
let isQuitting = false
let releaseHome: (() => void) | null = null

const emit = (event: HarnessEvent) => {
  win?.webContents.send('nengyongbot:event', event)
  lan?.broadcast(event)
}

function restart() {
  // free the home now: the copy this one relaunches takes it as soon as this process ends
  releaseHome?.()
  // app.relaunch() would outlive the dev server that scripts/dev.mjs stops when Electron exits
  if (DEV_RESTART_CODE) return app.exit(Number(DEV_RESTART_CODE))
  app.relaunch()
  app.exit(0)
}

function registerIpc(home: string, dataDir: string, store: Store) {
  const onLanguageChange = () => {
    buildMenu(dataDir)
    tray?.setContextMenu(trayMenu())
  }
  const core = createHandlers({ home, dataDir, store, emit, window: () => win, onLanguageChange })
  const access = createLanAccess({
    home,
    handlers: core.handlers,
    store,
    workspace: core.workspace,
    limits: core.limits,
    emit,
    devUrl: DEV_URL,
  })
  const handlers: Record<string, Handler> = {
    ...core.handlers,
    ...access.handlers,
    ...createDataDirHandlers({ window: () => win, home, dataDir, store, restart }),
  }
  for (const [name, handle] of Object.entries(handlers))
    ipcMain.handle(`nengyongbot:${name}`, (_e, ...args: unknown[]) => handle(...args))
  serveAttachments(core.workspace)
  serveMiniApps(store, core.workspace)
  scheduleRoutines(store, emit, core.harness.startRoutine)
  lan = access
  app.on('will-quit', access.close)
  void access.start()
}

function serveAttachments(workspace: Workspace) {
  protocol.handle(ATTACHMENT_SCHEME, (request) => imageResponse(workspace, new URL(request.url).pathname.slice(1)))
}

// nengyongbot-app://page/<botId>/<miniAppId>/<version>
function serveMiniApps(store: Store, workspace: Workspace) {
  protocol.handle(MINI_APP_SCHEME, (request) =>
    miniAppResponse(store, workspace, new URL(request.url).pathname.slice(1)),
  )
}

function buildMenu(dataDir: string) {
  if (process.platform !== 'darwin') return Menu.setApplicationMenu(null)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        role: 'appMenu',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: strings().main.menu.settings, click: () => emit({ kind: 'open-settings' }) },
          {
            label: strings().main.menu.openLibrary,
            click: () => shell.openPath(path.join(dataDir, LIBRARY_DIR)),
          },
          { label: strings().main.menu.openDataDir, click: () => shell.openPath(dataDir) },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  )
}

// a name ending in Template makes macOS tint it for a light or dark menu bar; electron-builder.yml packs build/tray*
function createTray() {
  tray = new Tray(path.join(__dirname, '../build', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'))
  tray.setToolTip('Nengyong Bot')
  tray.setContextMenu(trayMenu())
  tray.on('click', showWindow)
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: strings().main.menu.openApp, click: showWindow },
    { type: 'separator' },
    { label: strings().main.menu.quit, click: () => app.quit() },
  ])
}

function showWindow() {
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

const openOutside = (url: string) => {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 23 }, // y centres the buttons in the 60px top bar; the system default (y 11) sits too high
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win?.show())
  // closing only hides the window: bots keep replying and running routines until the user quits from the menu or tray
  win.on('close', (e) => {
    if (isQuitting || !win) return
    e.preventDefault()
    if (!win.isFullScreen()) return win.hide()
    // hiding a full-screen window on macOS leaves a black space behind
    win.once('leave-full-screen', () => win?.hide())
    win.setFullScreen(false)
  })
  win.on('closed', () => (win = null))
  // links in bot replies open in the browser, never inside the app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  // a mini app's page stays its own: a link in it opens in the browser instead of replacing it
  win.webContents.on('will-frame-navigate', (e) => {
    if (e.isMainFrame || e.url.startsWith(`${MINI_APP_SCHEME}:`)) return
    e.preventDefault()
    openOutside(e.url)
  })
  win.webContents.on('will-navigate', (e, url) => {
    // Vite's full reload is a navigation to the dev server itself; blocking it would open the app in a browser tab
    if (DEV_URL && new URL(url).origin === new URL(DEV_URL).origin) return
    e.preventDefault()
    openOutside(url)
  })
  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(path.join(__dirname, '../dist/index.html'))
}

protocol.registerSchemesAsPrivileged([
  { scheme: ATTACHMENT_SCHEME, privileges: { standard: true, secure: true } },
  { scheme: MINI_APP_SCHEME, privileges: { standard: true, secure: true } },
])

app.whenReady().then(() => {
  app.setAppUserModelId('com.nengyongbot.app')
  const home = appHome()
  setLanguage(savedLanguage(home, app.getPreferredSystemLanguages()[0] ?? app.getLocale()))
  try {
    releaseHome = lockHome(home)
  } catch (error) {
    dialog.showErrorBox(strings().main.cannotOpenData, error instanceof Error ? error.message : String(error))
    return app.exit(1)
  }
  if (!releaseHome) {
    dialog.showErrorBox(strings().main.homeInUse.title, strings().main.homeInUse.detail(home))
    return app.exit(0)
  }
  app.on('will-quit', releaseHome)
  let dataDir: string
  let store: Store
  try {
    dataDir = resolveDataDir(home)
    store = createStore(path.join(dataDir, DATABASE_FILE))
  } catch (error) {
    // nothing is opened on an unreadable database: an empty start would look like lost data
    dialog.showErrorBox(strings().main.cannotOpenData, error instanceof Error ? error.message : String(error))
    return app.exit(1)
  }
  // Electron grants every permission unless told otherwise; the only frames inside the window are mini apps' pages
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback, details) =>
    callback(details.isMainFrame),
  )
  session.defaultSession.setPermissionCheckHandler((_contents, _permission, _origin, details) => details.isMainFrame)
  registerIpc(home, dataDir, store)
  buildMenu(dataDir)
  createWindow()
  createTray()
  app.on('activate', showWindow)
  app.on('second-instance', showWindow)
})

app.on('before-quit', () => {
  isQuitting = true
})
// quitAndInstall closes the windows before before-quit comes: hiding the window instead would call off the update
autoUpdater.on('before-quit-for-update', () => {
  isQuitting = true
})
// without a listener Electron quits once the window is gone; only quitting from the menu or tray ends the app
app.on('window-all-closed', () => {})
