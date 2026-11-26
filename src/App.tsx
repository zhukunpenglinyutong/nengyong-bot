import { AnimatePresence, MotionConfig } from 'motion/react'
import { useReducer, useState } from 'react'
import { z } from 'zod'
import { BotId, MAIN_BOT_ID, secretary } from '../shared/bot'
import { isUnfinished, type NengyongBotBridge } from '../shared/bridge'
import { latestVersion, type MiniApp } from '../shared/miniApp'
import type { SidebarState } from '../shared/sidebar'
import { BotPanel, PanelTab } from './bot/BotPanel'
import { BotActivityContext, useBotActivities } from './bot/botActivity'
import { PanelFrame } from './bot/PanelFrame'
import { PanelWidth, panelMaxWidth } from './bot/PanelResizer'
import { activityLabel } from './activityLabel'
import { ChatView, type ComposerFill } from './chat/ChatView'
import { chatMessages } from './chat/chatMessages'
import { PairingDialog } from './devices/PairingDialog'
import { BotIsland } from './island/BotIsland'
import { useIslandNotices } from './island/useIslandNotices'
import { MiniAppHost } from './miniApp/MiniAppHost'
import { EMPTY_RUNS, miniAppRuns, rectOf } from './miniApp/miniAppRuns'
import { Onboarding } from './onboarding/Onboarding'
import { Preferences } from './preferences'
import { SettingsDialog } from './settings/SettingsDialog'
import { UpdatePopup } from './settings/UpdatePopup'
import { popupOf } from './settings/updateState'
import { useUpdate } from './settings/useUpdate'
import { Sidebar } from './sidebar/Sidebar'
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
  const [panelTab, setPanelTab] = usePersistentState('panelTab', PanelTab)
  const [openFlowId, setOpenFlowId] = useState<string | null>(null)
  const [composerFill, setComposerFill] = useState<ComposerFill>({ text: '', count: 0 })
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
    setOpenFlowId(null)
    setSidebar((state) => markSeen(setUnread(state, id, false), [bot.id, id], now))
    notices.seen(id)
  }
  const openFlow = (flowId: string | null) => {
    setPanelOpen(true)
    setPanelTab('flows')
    setOpenFlowId(flowId)
  }
  const fillComposer = (text: string) => setComposerFill(({ count }) => ({ text, count: count + 1 }))
  const harness = useHarness(bridge, {
    activeId: bot.id,
    sidebar,
    canSave: onboarding !== 'deciding',
    canAskForKey: !needsOnboarding,
    isDebug: preferences.isDebug,
    onBotCreated: (created) => setSidebar((state) => createBot(state, created)),
    onBotRenamed: (id, name) => setSidebar((state) => renameBot(state, id, name)),
    onEntry: (id, entry, before) => {
      if (entry.kind === 'bot' && id !== bot.id) setSidebar((state) => addUnread(state, id))
      notices.onEntry(id, bot.id, entry, before, preferences.isDebug)
    },
    onTrace: (id, trace, before) => {
      if (preferences.isDebug) notices.onTrace(id, bot.id, trace, before)
    },
    onBusy: activity.onBusy,
    onOpenBot: openBot,
  })
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
  const progress = thread.progress && {
    label: activityLabel(thread.progress.activity, thread.progress.draw),
    since: thread.progress.since,
  }

  return (
    <MotionConfig reducedMotion="user">
      <BotActivityContext value={activity.activities}>
        <div inert={onboarding !== null} className="flex h-screen overflow-hidden">
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
            onUsage={() => harness.openSettings('usage')}
            onSettings={() => harness.openSettings('model')}
            onLayout={(next) => {
              setCollapsed(next.collapsed)
              if (!next.collapsed) setSidebarWidth(next.width)
            }}
          />
          <ChatView
            bot={bot}
            sidebar={sidebar}
            messages={chatMessages(thread, bot, bots)}
            bubbleColor={preferences.accent === 'bot' ? bot.color : undefined}
            sendKey={preferences.sendKey}
            progress={progress}
            tasks={thread.panel.tasks}
            attachmentUrl={bridge.attachmentUrl}
            onOpenFile={(path) => harness.openLibraryItem(bot.id, path)}
            onSend={(text, files, quoteSeq) => harness.send(bot.id, text, files, quoteSeq, viewing?.id ?? null)}
            onDelete={(seqs) => harness.deleteMessages(bot.id, seqs)}
            onOpenBot={openBot}
            flows={thread.panel.flows}
            onOpenFlow={openFlow}
            miniApps={thread.panel.miniApps}
            onOpenMiniApp={openMiniApp}
            thumbUrl={thumbUrl}
            viewing={viewing}
            fill={composerFill}
            onFill={fillComposer}
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
                onOpenBot={openBot}
                onOpenFlow={openFlow}
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
              tab={panelTab}
              openFlowId={openFlowId}
              onTab={(tab) => {
                setPanelTab(tab)
                setOpenFlowId(null)
              }}
              onOpenFlow={openFlow}
              onFill={fillComposer}
              miniAppRuns={miniAppRunsState.runs.filter((run) => run.botId === bot.id)}
              thumbUrl={thumbUrl}
              onOpenMiniApp={openMiniApp}
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
        <MiniAppHost
          runs={miniAppRunsState}
          dispatch={dispatchMiniAppRuns}
          bridge={bridge}
          threadOf={harness.thread}
          botName={(id) => bots.find((candidate) => candidate.id === id)?.name ?? id}
          onEditInChat={(run, app) => {
            openBot(run.botId)
            fillComposer(strings().app.editMiniApp(app.name))
          }}
        />
        {onboarding && (
          <Onboarding
            modelServices={harness.modelServices}
            onConnectModel={harness.connectDeepSeek}
            onHire={async (choices) => {
              setSidebar((state) => renameBot(state, MAIN_BOT_ID, choices.bossName))
              const hired = await harness.onboard(choices)
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
          {harness.settingsPage && harness.modelServices && (
            <SettingsDialog
              initialPage={harness.settingsPage}
              services={harness.modelServices}
              onServicesChange={harness.setModelServices}
              onClose={harness.closeSettings}
              bridge={bridge}
              bots={bots}
              preferences={preferences}
              onPreferencesChange={setPreferences}
              limits={harness.limits}
              onLimitsChange={harness.saveLimits}
              devices={harness.devices}
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
                harness.openSettings('releases')
              }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {harness.pairing && <PairingDialog key={harness.pairing.id} request={harness.pairing} bridge={bridge} />}
        </AnimatePresence>
      </BotActivityContext>
    </MotionConfig>
  )
}
