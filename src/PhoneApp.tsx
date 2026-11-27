import { AnimatePresence, MotionConfig } from 'motion/react'
import { useReducer, useState, useSyncExternalStore } from 'react'
import { BotId, MAIN_BOT_ID } from '../shared/bot'
import type { NengyongBotBridge } from '../shared/bridge'
import { latestVersion, type MiniApp } from '../shared/miniApp'
import type { SidebarState } from '../shared/sidebar'
import { BotPanel } from './bot/BotPanel'
import { BotActivityContext, useBotActivities } from './bot/botActivity'
import { usePanelNav } from './bot/usePanelNav'
import { ChatView } from './chat/ChatView'
import { createDrafts, fillWith } from './chat/drafts'
import { useIslandNotices } from './island/useIslandNotices'
import { MiniAppHost } from './miniApp/MiniAppHost'
import { EMPTY_RUNS, miniAppRuns, rectOf } from './miniApp/miniAppRuns'
import { NavigationContext } from './NavigationContext'
import { Preferences } from './preferences'
import { ConnectionBanner } from './remote/ConnectionBanner'
import { PhoneSheet } from './remote/PhoneSheet'
import { PhoneTitle } from './remote/PhoneTitle'
import { RemovedPage } from './remote/RemovedPage'
import type { ConnectionStore } from './remote/remoteBridge'
import { ReplyNotice } from './remote/ReplyNotice'
import { PhoneBotList } from './sidebar/PhoneBotList'
import { SkillFilesDialog, type SkillFilesTarget } from './skills/SkillFilesDialog'
import { SkillsContext } from './skills/SkillsContext'
import { createBot, renameBot } from './sidebar/sidebarState'
import { IconButton } from './ui/IconButton'
import { useDocumentTheme } from './ui/useDocumentTheme'
import { usePersistentState } from './ui/usePersistentState'
import { useHarness } from './useHarness'
import { strings } from '../shared/strings'

// the chat open on this phone survives the page starting over after the connection came back
const OpenBotId = BotId.nullable().catch(null)
const PREFERENCES = Preferences.parse(undefined) // a phone has no settings: the ones a computer starts with

interface Props {
  bridge: NengyongBotBridge
  connection: ConnectionStore
  initialSidebar: SidebarState
}

/** A paired phone's app: the bot list, a chat opened from it, its panel as a sheet. The settings stay on the computer. */
export function PhoneApp({ bridge, connection, initialSidebar }: Props) {
  const [sidebar, setSidebar] = useState(initialSidebar)
  const [openId, setOpenId] = usePersistentState('phoneBotId', OpenBotId)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const panelNav = usePanelNav(() => setIsPanelOpen(true))
  const [skillFiles, setSkillFiles] = useState<SkillFilesTarget | null>(null)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [drafts] = useState(createDrafts)
  const [runs, dispatchRuns] = useReducer(miniAppRuns, EMPTY_RUNS)
  const status = useSyncExternalStore(connection.subscribe, connection.get)
  useDocumentTheme(PREFERENCES.theme)
  const activity = useBotActivities()
  const notices = useIslandNotices()
  const bot = sidebar.bots.find((candidate) => candidate.id === openId)
  const shownId = bot?.id ?? MAIN_BOT_ID // on the list no chat is open: the harness reads and reports into the main bot's

  const openBot = (id: string) => {
    setOpenId(id)
    setIsPanelOpen(false)
    panelNav.showList()
    setUnread(({ [id]: _seen, ...rest }) => rest)
    notices.seen(id)
  }
  const backToList = () => {
    setOpenId(null)
    // the computer may have renamed, added or moved bots meanwhile; offline, the banner already says why nothing changes
    bridge.getSidebar().then(
      (saved) => saved && setSidebar(saved),
      () => {},
    )
  }
  const fill = (id: string, text: string) => {
    setIsPanelOpen(false)
    drafts.edit(id, fillWith(text))
  }
  const harness = useHarness(bridge, {
    activeId: shownId,
    sidebar,
    canSave: false, // the computer keeps the sidebar: a phone reads it and never writes it back
    isDebug: false,
    onBotCreated: (created) => setSidebar((state) => createBot(state, created)),
    onBotRenamed: (id, name) => setSidebar((state) => renameBot(state, id, name)),
    onBotMoved: () => {}, // a phone lists bots without sections
    onBotDismissed: () => {}, // the computer keeps the sidebar; the phone's list catches up when it reloads
    onEntry: (id, entry, before) => {
      if (entry.kind !== 'bot' || id === bot?.id) return
      setUnread((counts) => ({ ...counts, [id]: (counts[id] ?? 0) + 1 }))
      notices.onEntry(id, bot?.id ?? '', entry, before, false)
    },
    onTrace: () => {},
    onBusy: activity.onBusy,
    onOpenBot: openBot,
  })
  const thread = harness.thread(shownId)
  const thumbUrl = (app: MiniApp) => bridge.miniAppUrl(shownId, app.id, latestVersion(app).version, app.dataAt)
  const openMiniApp = (miniAppId: string, from: Element) => {
    if (!bot) return
    setIsPanelOpen(false)
    dispatchRuns({ kind: 'open', botId: bot.id, miniAppId, at: Date.now(), origin: rectOf(from) })
  }
  const front = runs.runs.find((run) => run.status === 'front')
  const viewing =
    front && front.botId === bot?.id ? thread.panel.miniApps.find((app) => app.id === front.miniAppId) : undefined
  const navigation = {
    openBot,
    openFlow: panelNav.openFlow,
    openSkill: panelNav.openSkill,
    openSkillFiles: setSkillFiles,
    openMiniApp,
  }
  const notice = notices.current
  const replyBot =
    notice?.kind === 'reply' ? sidebar.bots.find((candidate) => candidate.id === notice.botId) : undefined

  if (status === 'removed') return <RemovedPage />
  return (
    <MotionConfig reducedMotion="user">
      <BotActivityContext value={activity.activities}>
        <NavigationContext value={navigation}>
          <SkillsContext value={{ reader: bridge }}>
            <div data-list={!bot || undefined} className="flex h-dvh flex-col overflow-hidden data-list:bg-side">
              {status === 'offline' && <ConnectionBanner />}
              {bot ? (
                <div className="relative flex min-h-0 flex-1">
                  <ChatView
                    bot={bot}
                    sidebar={sidebar}
                    thread={thread}
                    bubbleColor={PREFERENCES.accent === 'bot' ? bot.color : undefined}
                    sendKey={PREFERENCES.sendKey}
                    attachmentUrl={bridge.attachmentUrl}
                    onOpenFile={(path) => harness.openLibraryItem(bot.id, path)}
                    onSend={(text, files, quoteSeq) => harness.send(bot.id, text, files, quoteSeq, viewing?.id ?? null)}
                    onStopReply={() => harness.stopReply(bot.id)}
                    onDelete={(seqs) => harness.deleteMessages(bot.id, seqs)}
                    thumbUrl={thumbUrl}
                    viewing={viewing}
                    drafts={drafts}
                    island={<PhoneTitle bot={bot} entries={thread.entries} />}
                    isPanelOpen={false}
                    onTogglePanel={() => setIsPanelOpen(true)}
                  />
                  <IconButton
                    icon="arrowLeft"
                    label={strings().remote.back}
                    onClick={backToList}
                    className="absolute top-3 left-3 z-[3]"
                  />
                </div>
              ) : (
                <PhoneBotList sidebar={sidebar} thread={harness.thread} unread={unread} onOpen={openBot} />
              )}
            </div>
            <AnimatePresence>
              {bot && isPanelOpen && (
                <PhoneSheet title={strings().remote.panelTitle(bot.name)} onClose={() => setIsPanelOpen(false)}>
                  <BotPanel
                    bot={bot}
                    bots={sidebar.bots}
                    entries={thread.entries}
                    panel={thread.panel}
                    isDebug={false}
                    tab={panelNav.tab}
                    ability={panelNav.ability}
                    onTab={panelNav.changeTab}
                    onAbility={panelNav.setAbility}
                    onFill={(text) => fill(bot.id, text)}
                    miniAppRuns={runs.runs.filter((run) => run.botId === bot.id)}
                    thumbUrl={thumbUrl}
                    onToggleRoutine={(routineId, isEnabled) => harness.setRoutineEnabled(bot.id, routineId, isEnabled)}
                    onOpenLibraryItem={(path) => harness.openLibraryItem(bot.id, path)}
                    onStopTask={(taskId) => harness.stopTask(bot.id, taskId)}
                  />
                </PhoneSheet>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {skillFiles && (
                <SkillFilesDialog target={skillFiles} reader={bridge} onClose={() => setSkillFiles(null)} />
              )}
            </AnimatePresence>
            <MiniAppHost
              runs={runs}
              dispatch={dispatchRuns}
              bridge={bridge}
              threadOf={harness.thread}
              botName={(id) => sidebar.bots.find((candidate) => candidate.id === id)?.name ?? id}
              onEditInChat={(run, app) => {
                openBot(run.botId)
                fill(run.botId, strings().app.editMiniApp(app.name))
              }}
            />
            <ReplyNotice
              reply={
                notice?.kind === 'reply' && replyBot ? { id: notice.id, bot: replyBot, text: notice.text } : undefined
              }
              onOpen={openBot}
              onDismiss={notices.dismiss}
            />
          </SkillsContext>
        </NavigationContext>
      </BotActivityContext>
    </MotionConfig>
  )
}
