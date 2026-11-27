import { AnimatePresence, MotionConfig } from 'motion/react'
import { useReducer, useState } from 'react'
import { z } from 'zod'
import { BotId, MAIN_BOT_ID, secretary } from '../shared/bot'
import { isUnfinished, type NengyongBotBridge } from '../shared/bridge'
import { latestVersion, type MiniApp } from '../shared/miniApp'
import type { SidebarState } from '../shared/sidebar'
import { BotPanel } from './bot/BotPanel'
import { BotActivityContext, useBotActivities } from './bot/botActivity'
import { PanelFrame } from './bot/PanelFrame'
import { PanelWidth, panelMaxWidth } from './bot/PanelResizer'
import { usePanelNav } from './bot/usePanelNav'
import { ChatView } from './chat/ChatView'
import { createDrafts, fillWith } from './chat/drafts'
import { PairingDialog } from './devices/PairingDialog'
import { BotIsland } from './island/BotIsland'
import { useIslandNotices } from './island/useIslandNotices'
import { MiniAppHost } from './miniApp/MiniAppHost'
import { EMPTY_RUNS, miniAppRuns, rectOf } from './miniApp/miniAppRuns'
import { NavigationContext } from './NavigationContext'
import { Onboarding } from './onboarding/Onboarding'
import { Preferences } from './preferences'
import { SettingsDialog } from './settings/SettingsDialog'
import { UpdatePopup } from './settings/UpdatePopup'
import { popupOf } from './settings/updateState'
import { useSettings } from './settings/useSettings'
import { useUpdate } from './settings/useUpdate'
import { Sidebar } from './sidebar/Sidebar'
import { SkillFilesDialog, type SkillFilesTarget } from './skills/SkillFilesDialog'
import { SkillsContext } from './skills/SkillsContext'
import { COLLAPSED_RAIL_WIDTH, RAIL_WIDTH, SidebarWidth } from './sidebar/sidebarLayout'
import {
  addUnread,
  createBot,
  INITIAL_SIDEBAR,
  markSeen,
  markUnseenAsSeen,
  renameBot,
  setBotAvatar,
  setBotLook,
  setBotOutfit,
  setUnread,
  togglePin,
} from './sidebar/sidebarState'
import { useDocumentTheme } from './ui/useDocumentTheme'
import { usePersistentState } from './ui/usePersistentState'
import { useWindowFocus } from './ui/useWindowFocus'
import { useWindowWidth } from './ui/useWindowWidth'
import { useHarness } from './useHarness'
import { strings } from '../shared/strings'

// any well-formed id is accepted: it may be a bot created in the app; the lookup below falls back when it is gone
const StoredBotId = BotId.catch(MAIN_BOT_ID)
const Closed = z.boolean().catch(false)

interface Props {
  bridge: NengyongBotBridge
  initialSidebar?: SidebarState // the saved one, or the demo's pre-filled one
  needsOnboarding?: boolean // the onboarding has not run yet: it comes first
}

export function App({ bridge, initialSidebar = INITIAL_SIDEBAR, needsOnboarding = false }: Props) {
  const [botId, setBotId] = usePersistentState('botId', StoredBotId)
  const [collapsed, setCollapsed] = usePersistentState('sidebarCollapsed', Closed)
  const [sidebarWidth, setSidebarWidth] = usePersistentState('sidebarWidth', SidebarWidth)
  const [panelOpen, setPanelOpen] = usePersistentState('panelOpen', Closed)
  const panelNav = usePanelNav(() => setPanelOpen(true))
  const [skillFiles, setSkillFiles] = useState<SkillFilesTarget | null>(null)
  const [drafts] = useState(createDrafts)
  const [sidebar, setSidebar] = useState(() => markUnseenAsSeen(initialSidebar, Date.now()))
  const [onboarding, setOnboarding] = useState<'deciding' | 'hired' | null>(needsOnboarding ? 'deciding' : null)
  const [panelWidth, setPanelWidth] = usePersistentState('panelWidth', PanelWidth)
  const [preferences, setPreferences] = usePersistentState('preferences', Preferences)
  const [miniAppRunsState, dispatchMiniAppRuns] = useReducer(miniAppRuns, EMPTY_RUNS)
  const windowWidth = useWindowWidth()
  const theme = useDocumentTheme(preferences.theme)
  const activity = useBotActivities()
  const notices = useIslandNotices()

  const bots = sidebar.bots
  const bot = bots.find((candidate) => candidate.id === botId) ?? bots[0] // falls back if the selected bot was deleted; the main bot always exists

  const openBot = (id: string) => {
    const now = Date.now()
    setBotId(id)
    panelNav.showList()
    setSidebar((state) => markSeen(setUnread(state, id, false), [bot.id, id], now))
    notices.seen(id)
  }
  const revealOf = ({ ref }: SkillFilesTarget) =>
    ref.kind === 'installed' ? () => bridge.revealSkill(ref.botId, ref.name) : undefined
  const fill = (id: string, text: string) => drafts.edit(id, fillWith(text))
  const harness = useHarness(bridge, {
    activeId: bot.id,
    sidebar,
    canSave: onboarding !== 'deciding',
    isDebug: preferences.isDebug,
    onBotCreated: (created) => setSidebar((state) => createBot(state, created)),
    onBotRenamed: (id, name) => setSidebar((state) => renameBot(state, id, name)),
    onEntry: (id, entry, before) => {
      if (entry.kind === 'bot' && (id !== bot.id || !document.hasFocus())) setSidebar((state) => addUnread(state, id))
      notices.onEntry(id, bot.id, entry, before, preferences.isDebug)
    },
    onTrace: (id, trace, before) => {
      if (preferences.isDebug) notices.onTrace(id, bot.id, trace, before)
    },
    onBusy: activity.onBusy,
    onOpenBot: openBot,
  })
  const settings = useSettings(bridge, !needsOnboarding, harness.reportFailure)
  useWindowFocus(() => setSidebar((state) => setUnread(state, bot.id, false)))
  const update = useUpdate(bridge)
  const updatePopup = popupOf(update.state)
  const busyBots = bots
    .filter(({ id }) => harness.thread(id).progress || harness.thread(id).panel.tasks.some(isUnfinished))
    .map(({ name }) => name)
  const thread = harness.thread(bot.id)
  const openMiniApp = (miniAppId: string, from: Element) =>
    dispatchMiniAppRuns({ kind: 'open', botId: bot.id, miniAppId, at: Date.now(), origin: rectOf(from) })
  const thumbUrl = (app: MiniApp) => bridge.miniAppUrl(bot.id, app.id, latestVersion(app).version, app.dataAt)
  const front = miniAppRunsState.runs.find((run) => run.status === 'front')
  const viewing = front?.botId === bot.id ? thread.panel.miniApps.find((app) => app.id === front.miniAppId) : undefined
  const navigation = {
    openBot,
    openFlow: panelNav.openFlow,
    openSkill: panelNav.openSkill,
    openSkillFiles: setSkillFiles,
    openMiniApp,
  }

  return (
    <MotionConfig reducedMotion="user">
      <BotActivityContext value={activity.activities}>
        <NavigationContext value={navigation}>
          <SkillsContext value={{ reader: bridge, manager: bridge }}>
            <div inert={onboarding !== null} className="flex min-h-0 flex-1 overflow-hidden">
              <Sidebar
                activeId={bot.id}
                sidebar={sidebar}
                isMac={bridge.isMac}
                thread={harness.thread}
                onSidebarChange={setSidebar}
                collapsed={collapsed}
                width={sidebarWidth}
                onSelect={openBot}
                onToggle={() => setCollapsed((isCollapsed) => !isCollapsed)}
                onUsage={() => settings.open('usage')}
                onSettings={() => settings.open('model')}
                onLayout={(next) => {
                  setCollapsed(next.collapsed)
                  if (!next.collapsed) setSidebarWidth(next.width)
                }}
              />
              <ChatView
                bot={bot}
                sidebar={sidebar}
                thread={thread}
                bubbleColor={preferences.accent === 'bot' ? bot.color : undefined}
                sendKey={preferences.sendKey}
                attachmentUrl={bridge.attachmentUrl}
                onOpenFile={(path) => harness.openLibraryItem(bot.id, path)}
                onSend={(text, files, quoteSeq) => harness.send(bot.id, text, files, quoteSeq, viewing?.id ?? null)}
                onStopReply={() => harness.stopReply(bot.id)}
                onDelete={(seqs) => harness.deleteMessages(bot.id, seqs)}
                thumbUrl={thumbUrl}
                viewing={viewing}
                drafts={drafts}
                island={
                  <BotIsland
                    bot={bot}
                    bots={bots}
                    entries={thread.entries}
                    tasks={thread.panel.tasks}
                    flows={thread.panel.flows}
                    isBusy={Boolean(thread.progress)}
                    isDebug={preferences.isDebug}
                    context={thread.context}
                    traces={thread.traces}
                    notice={notices.current}
                    onDismissNotice={notices.dismiss}
                    onDebugChange={(isDebug) => setPreferences((current) => ({ ...current, isDebug }))}
                  />
                }
                isPanelOpen={panelOpen}
                onTogglePanel={() => setPanelOpen((isOpen) => !isOpen)}
              />
              <PanelFrame
                isOpen={panelOpen}
                width={panelWidth}
                maxWidth={panelMaxWidth(windowWidth, collapsed ? COLLAPSED_RAIL_WIDTH : RAIL_WIDTH + sidebarWidth)}
                onCommit={setPanelWidth}
                onClose={() => setPanelOpen(false)}
              >
                <BotPanel
                  key={bot.id}
                  bot={bot}
                  entries={thread.entries}
                  panel={thread.panel}
                  isDebug={preferences.isDebug}
                  tab={panelNav.tab}
                  ability={panelNav.ability}
                  onTab={panelNav.changeTab}
                  onAbility={panelNav.setAbility}
                  onFill={(text) => fill(bot.id, text)}
                  miniAppRuns={miniAppRunsState.runs.filter((run) => run.botId === bot.id)}
                  thumbUrl={thumbUrl}
                  onToggleRoutine={(routineId, isEnabled) => harness.setRoutineEnabled(bot.id, routineId, isEnabled)}
                  onOpenLibraryItem={(path) => harness.openLibraryItem(bot.id, path)}
                  onStopTask={(taskId) => harness.stopTask(bot.id, taskId)}
                  onRename={(name) => setSidebar((state) => renameBot(state, bot.id, name))}
                  onPickLook={(look) => setSidebar((state) => setBotLook(state, bot.id, look))}
                  onPickAvatar={(avatar) => setSidebar((state) => setBotAvatar(state, bot.id, avatar))}
                  onPickOutfit={(outfit) => setSidebar((state) => setBotOutfit(state, bot.id, outfit))}
                  bots={bots}
                />
              </PanelFrame>
            </div>
            <AnimatePresence>
              {skillFiles && (
                <SkillFilesDialog
                  target={skillFiles}
                  reader={bridge}
                  onReveal={revealOf(skillFiles)}
                  onClose={() => setSkillFiles(null)}
                />
              )}
            </AnimatePresence>
            <MiniAppHost
              runs={miniAppRunsState}
              dispatch={dispatchMiniAppRuns}
              bridge={bridge}
              threadOf={harness.thread}
              botName={(id) => bots.find((candidate) => candidate.id === id)?.name ?? id}
              onEditInChat={(run, app) => {
                openBot(run.botId)
                fill(run.botId, strings().app.editMiniApp(app.name))
              }}
            />
            {onboarding && (
              <Onboarding
                modelServices={settings.modelServices}
                onConnectModel={settings.connectDeepSeek}
                onHire={async (choices) => {
                  setSidebar((state) => renameBot(state, MAIN_BOT_ID, choices.bossName))
                  const hired = await bridge.onboard(choices)
                  setSidebar((state) => togglePin(state, secretary().id))
                  setOnboarding('hired')
                  return hired
                }}
                onDone={() => setOnboarding(null)}
                theme={theme}
                onThemeChange={(theme) => setPreferences((current) => ({ ...current, theme }))}
              />
            )}
            <AnimatePresence>
              {settings.page && settings.modelServices && (
                <SettingsDialog
                  initialPage={settings.page}
                  services={settings.modelServices}
                  onServicesChange={settings.setModelServices}
                  onClose={settings.close}
                  bridge={bridge}
                  bots={bots}
                  preferences={preferences}
                  onPreferencesChange={setPreferences}
                  limits={harness.limits}
                  onLimitsChange={harness.saveLimits}
                  devices={settings.devices}
                  update={update.state}
                  busyBots={busyBots}
                  onCheckUpdate={update.check}
                  onInstallUpdate={update.install}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {updatePopup && onboarding === null && (
                <UpdatePopup
                  popup={updatePopup}
                  busyBots={busyBots}
                  onInstall={update.install}
                  onClose={update.closePopup}
                  onOpenNotes={() => {
                    update.closePopup()
                    settings.open('releases')
                  }}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {settings.pairing && (
                <PairingDialog key={settings.pairing.id} request={settings.pairing} bridge={bridge} />
              )}
            </AnimatePresence>
          </SkillsContext>
        </NavigationContext>
      </BotActivityContext>
    </MotionConfig>
  )
}
