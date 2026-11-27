import { AnimatePresence, motion } from 'motion/react'
import { type DragEvent, type ReactNode, useReducer, useRef, useState } from 'react'
import type { Bot } from '../../shared/bot'
import { isUnfinished, type TaskView } from '../../shared/bridge'
import type { Flow } from '../../shared/flow'
import type { MiniApp } from '../../shared/miniApp'
import { plainText } from '../../shared/plainText'
import type { SidebarState } from '../../shared/sidebar'
import type { SkillView } from '../../shared/skill'
import type { SkillFilesTarget } from '../skills/SkillFilesDialog'
import type { SendKey } from '../preferences'
import { BotAvatar } from '../bot/BotAvatar'
import { ViewingMiniApp } from '../miniApp/ViewingMiniApp'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { EASE_SHARP, ENTER } from '../ui/motion'
import { ELAPSED_REFRESH_MS, elapsedLabel } from '../elapsedLabel'
import { taskProgressLabel } from '../taskProgressLabel'
import { useKeyDown } from '../ui/useKeyDown'
import { useNow } from '../ui/useNow'
import { useStickToBottom } from '../ui/useStickToBottom'
import type { Message } from './chatMessages'
import { Composer } from './Composer'
import { MentionContext } from './MentionContext'
import { MessageList } from './MessageList'
import { SelectBar } from './SelectBar'
import { selectableMessages, selectionOf } from './selection'
import { ShareDialog } from './ShareDialog'
import { strings } from '../../shared/strings'

interface Props {
  bot: Bot
  sidebar: SidebarState // its bots resolve [name](bot:id) mentions in replies; an @ in the message box offers them
  messages: Message[]
  bubbleColor?: string // fills the user's bubbles; without one they are ink
  sendKey: SendKey
  progress?: { label: string; since: number } // set while the bot is working
  tasks: TaskView[] // its background tasks; the unfinished ones show under the chat while it is not replying
  attachmentUrl: (path: string) => string
  onOpenFile: (path: string) => void // a file a reply links to, in the library
  onSend: (text: string, files: File[], quoteSeq: number | null) => boolean // false: refused (the thread says why), keep what was typed
  onStopReply: () => void
  onDelete: (seqs: number[]) => void
  onOpenBot: (botId: string) => void
  flows: Flow[] // for resolving [name](flow:id) mentions in replies
  onOpenFlow: (flowId: string) => void
  skills: SkillView[] // for resolving [name](skill:…) mentions in replies
  onOpenSkill: (botId: string, name: string) => void
  onAnswerSkillOffer?: (offer: string, names: string[]) => Promise<void> // an install card's buttons; absent on a device, which only looks
  onOpenSkillFiles: (target: SkillFilesTarget) => void
  miniApps: MiniApp[] // for resolving [name](app:id) links in replies
  onOpenMiniApp: (miniAppId: string, from: Element) => void
  thumbUrl: (app: MiniApp) => string
  viewing: MiniApp | undefined // the mini app of this bot open now: what a message sent now is about
  fill: ComposerFill // the latest text put in the message box from outside it
  onFill: (text: string) => void
  island: ReactNode
  isPanelOpen: boolean
  onTogglePanel: () => void
}

/** A text put in the message box for the user to finish and send; a new count replaces what was typed. */
export interface ComposerFill {
  text: string
  count: number
}

/** What is written to one bot and not sent yet; each bot keeps its own while another is open. */
interface Draft {
  text: string
  files: File[]
  quote: { seq: number; text: string } | null
}

const EMPTY_DRAFT: Draft = { text: '', files: [], quote: null }

/** A mention clicked in `from`'s chat, scrolled to `scrollTop`, that opened `to`. */
interface Jump {
  from: string
  to: string
  scrollTop: number
}

export function ChatView({
  bot,
  sidebar,
  messages,
  bubbleColor,
  sendKey,
  progress,
  tasks,
  attachmentUrl,
  onOpenFile,
  onSend,
  onStopReply,
  onDelete,
  onOpenBot,
  flows,
  onOpenFlow,
  skills,
  onOpenSkill,
  onAnswerSkillOffer,
  onOpenSkillFiles,
  miniApps,
  onOpenMiniApp,
  thumbUrl,
  viewing,
  fill,
  onFill,
  island,
  isPanelOpen,
  onTogglePanel,
}: Props) {
  const words = strings().chat.view
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const draft = drafts[bot.id] ?? EMPTY_DRAFT
  const editDraft = (changes: (current: Draft) => Partial<Draft>) =>
    setDrafts((all) => {
      const current = all[bot.id] ?? EMPTY_DRAFT
      return { ...all, [bot.id]: { ...current, ...changes(current) } }
    })
  const [fillCount, setFillCount] = useState(fill.count)
  if (fillCount !== fill.count) {
    setFillCount(fill.count)
    editDraft(() => ({ text: fill.text }))
  }
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [jumps, setJumps] = useState<Jump[]>([]) // the mention clicks that led to this chat, latest last
  const [selection, dispatchSelection] = useReducer(selectionOf, null)
  const [deleting, setDeleting] = useState<number[] | null>(null) // asking before these messages are deleted
  const [isSharing, setIsSharing] = useState(false)
  const [shownBotId, setShownBotId] = useState(bot.id)
  if (shownBotId !== bot.id) {
    setShownBotId(bot.id)
    if (jumps.at(-1)?.to !== bot.id) setJumps([]) // opened from the sidebar, a notice, the island: no way back
    dispatchSelection({ kind: 'end' })
    setDeleting(null) // its seqs belong to the chat that was open
    setIsSharing(false)
  }
  const back = jumps.at(-1)
  const backBot = back && sidebar.bots.find((candidate) => candidate.id === back.from)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const last = messages.at(-1)
  const suggestions = last?.kind === 'bot' ? last.suggestions : undefined
  const running = tasks.filter(isUnfinished)
  const selectable = selectableMessages(messages)
  const picked = selection ? selectable.filter((message) => selection.seqs.includes(message.seq)) : []
  const pickedSeqs = picked.map((message) => message.seq)
  const addFiles = (added: File[]) => editDraft(({ files }) => ({ files: [...files, ...added] }))
  const scroll = useStickToBottom(scrollRef, bot.id)

  const send = (text: string) => {
    if (!onSend(text, draft.files, draft.quote?.seq ?? null)) return false
    editDraft(() => EMPTY_DRAFT)
    scroll.stick()
    return true
  }

  const jumpTo = (botId: string) => {
    if (botId !== bot.id)
      setJumps([...jumps, { from: bot.id, to: botId, scrollTop: scrollRef.current?.scrollTop ?? 0 }])
    onOpenBot(botId)
  }

  const goBack = (jump: Jump) => {
    setJumps(jumps.slice(0, -1))
    scroll.startNextAt(jump.scrollTop)
    onOpenBot(jump.from)
  }

  const startQuote = (seq: number, text: string) => {
    editDraft(() => ({ quote: { seq, text } }))
    inputRef.current?.focus()
  }

  useKeyDown(selection !== null && deleting === null && !isSharing, (event) => {
    if (event.key === 'Escape' && !event.isComposing) return dispatchSelection({ kind: 'end' })
    if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
      event.preventDefault()
      return dispatchSelection({ kind: 'all', seqs: selectable.map((message) => message.seq) })
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && picked.length > 0) setDeleting(pickedSeqs)
  })

  // text dragged within the page is left to the browser; only files from outside are taken
  const takesFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files')

  return (
    <main
      className="relative flex min-w-0 flex-1 flex-col"
      onDragOver={(event) => {
        if (!takesFiles(event)) return
        event.preventDefault()
        setIsDraggingFiles(true)
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
        setIsDraggingFiles(false)
      }}
      onDrop={(event) => {
        if (!takesFiles(event)) return
        event.preventDefault()
        setIsDraggingFiles(false)
        addFiles([...event.dataTransfer.files])
      }}
    >
      {/* window drag area over the faded top; drag regions ignore z-order, so the island and the panel button opt out with no-drag */}
      <div className="drag pointer-events-none absolute inset-x-0 top-0 h-[52px]" />
      <IconButton
        icon={isPanelOpen ? 'panelOpen' : 'panel'}
        label={isPanelOpen ? words.hidePanel : words.showPanel}
        onClick={onTogglePanel}
        className="no-drag absolute top-3 right-3 z-[3]"
      />
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="relative mx-auto max-w-[1000px] px-6 pb-6">
          {/* top fade so messages dissolve under the floating island */}
          <div className="pointer-events-none sticky top-0 z-[1] -mb-[70px] h-[70px] bg-gradient-to-b from-canvas from-30% to-canvas/0" />
          {/* the island opens over the messages instead of pushing them down, so its slot keeps the compact height */}
          <div className="pointer-events-none sticky top-3 z-[2] mt-3 flex h-[30px] items-start justify-center">
            <div className="relative">
              {back && backBot && <BackButton bot={backBot} onClick={() => goBack(back)} />}
              {island}
            </div>
          </div>
          <MentionContext
            value={{
              chatBotId: bot.id,
              bots: sidebar.bots,
              open: jumpTo,
              flows,
              openFlow: onOpenFlow,
              miniApps,
              openMiniApp: onOpenMiniApp,
              thumbUrl,
              fileUrl: attachmentUrl,
              openFile: onOpenFile,
              skills,
              openSkill: onOpenSkill,
              answerSkillOffer: onAnswerSkillOffer,
              openSkillFiles: onOpenSkillFiles,
            }}
          >
            <MessageList
              key={bot.id}
              messages={messages}
              bubbleColor={bubbleColor}
              attachmentUrl={attachmentUrl}
              selection={selection}
              onQuote={startQuote}
              onSelection={dispatchSelection}
              onDelete={(seq) => setDeleting([seq])}
            />
            <AnimatePresence>
              {isSharing && (
                <ShareDialog
                  bot={bot}
                  messages={picked}
                  bubbleColor={bubbleColor}
                  onClose={() => setIsSharing(false)}
                />
              )}
            </AnimatePresence>
          </MentionContext>
          {suggestions && <Suggestions texts={suggestions} onPick={onFill} />}
          {progress ? (
            <ProgressRow bot={bot} label={progress.label} since={progress.since} />
          ) : (
            running.length > 0 && <TaskProgressRow bot={bot} tasks={running} />
          )}
        </div>
      </div>

      {selection ? (
        <SelectBar
          count={picked.length}
          isAll={picked.length === selectable.length}
          copyText={picked
            .map((message) =>
              words.copiedLine(message.kind === 'bot' ? bot.name : words.me, message.text || words.attachment),
            )
            .join('\n\n')}
          onSelectAll={() => dispatchSelection({ kind: 'all', seqs: selectable.map((message) => message.seq) })}
          onShare={() => setIsSharing(true)}
          onDelete={() => setDeleting(pickedSeqs)}
          onExit={() => dispatchSelection({ kind: 'end' })}
        />
      ) : (
        <Composer
          key={`${bot.id}:${fill.count}`}
          initialDraft={draft.text}
          placeholder={draft.quote ? words.replyPlaceholder : words.messagePlaceholder(bot.name)}
          quote={draft.quote ? plainText(draft.quote.text) : undefined}
          viewing={viewing && <ViewingMiniApp app={viewing} />}
          inputRef={inputRef}
          sidebar={sidebar}
          botId={bot.id}
          files={draft.files}
          sendKey={sendKey}
          isReplying={Boolean(progress)}
          onStop={onStopReply}
          onAddFiles={addFiles}
          onRemoveFile={(index) => editDraft(({ files }) => ({ files: files.filter((_, at) => at !== index) }))}
          onCancelQuote={() => editDraft(() => ({ quote: null }))}
          onDraftChange={(text) => editDraft(() => ({ text }))}
          onSend={send}
        />
      )}
      <AnimatePresence>
        {deleting && (
          <ConfirmDialog
            title={deleting.length === 1 ? words.deleteOne : words.deleteMany(deleting.length)}
            body={deleting.length === 1 ? words.deleteOneBody(bot.name) : words.deleteManyBody(bot.name)}
            confirmLabel={words.delete}
            onConfirm={() => {
              onDelete(deleting)
              dispatchSelection({ kind: 'end' })
            }}
            onClose={() => setDeleting(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isDraggingFiles && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-ink/20 bg-canvas/85 text-md text-soft"
          >
            {words.dropToAttach}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}

/** Things to try under the onboarding's greeting: picking one puts it in the message box, it is not sent. */
function Suggestions({ texts, onPick }: { texts: string[]; onPick: (text: string) => void }) {
  return (
    <motion.div
      {...ENTER}
      role="group"
      aria-label={strings().chat.view.suggestions}
      className="mt-3 flex flex-wrap gap-2"
    >
      {texts.map((text) => (
        <button
          key={text}
          onClick={() => onPick(text)}
          className="h-[34px] rounded-full bg-surface px-3.5 text-md shadow-card"
        >
          {text}
        </button>
      ))}
    </motion.div>
  )
}

/** Working row: the bot's avatar plus a shimmering line saying what it is doing, with elapsed time after a minute. */
function ProgressRow({ bot, label, since }: { bot: Bot; label: string; since: number }) {
  const elapsed = elapsedLabel(useNow(ELAPSED_REFRESH_MS) - since)
  return (
    <motion.div {...ENTER} className="mt-4 flex items-center gap-2.5 self-start pl-1" data-testid="progress">
      <BotAvatar bot={bot} size={28} />
      <span role="status" className="text-md">
        <span className="shimmer-text">{label}</span>
        {elapsed && <span className="ml-1.5 text-muted tabular-nums">{elapsed}</span>}
      </span>
    </motion.div>
  )
}

/** While the chat is quiet but tasks run in the background: what each one is doing, so the chat does not look stalled. */
function TaskProgressRow({ bot, tasks }: { bot: Bot; tasks: TaskView[] }) {
  const now = useNow(ELAPSED_REFRESH_MS)
  return (
    <motion.div {...ENTER} className="mt-4 flex items-start gap-2.5 pl-1" data-testid="task-progress">
      <BotAvatar bot={bot} size={28} />
      <div role="status" className="flex min-w-0 max-w-[600px] flex-col pt-0.5 text-md">
        <span className="shimmer-text">{strings().chat.view.tasksRunning(tasks.length)}</span>
        <ul aria-label={strings().chat.view.tasks} className="text-sm text-muted">
          {tasks.map((task) => (
            <li key={task.id} className="truncate">
              <span className="text-soft">{task.title}</span>
              <span className="ml-1.5">{taskProgressLabel(task, now)}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  )
}

/** Left of the island after a mention opened this chat: back to the chat and the spot it was clicked in. */
function BackButton({ bot, onClick }: { bot: Bot; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      aria-label={strings().chat.view.backTo(bot.name)}
      title={strings().chat.view.backTo(bot.name)}
      onClick={onClick}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: EASE_SHARP }}
      className="no-drag pointer-events-auto absolute top-0 right-full mr-2 flex h-[30px] items-center gap-1 rounded-full bg-black pr-[2px] pl-2 text-white shadow-pop"
    >
      <Icon name="back" size={16} />
      <span className="grid size-[26px] place-items-center rounded-full bg-white/12">
        <BotAvatar bot={bot} size={16} />
      </span>
    </motion.button>
  )
}
