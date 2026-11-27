import { AnimatePresence } from 'motion/react'
import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { imageType } from '../../shared/attachment'
import type { Bot } from '../../shared/bot'
import type { SidebarState } from '../../shared/sidebar'
import type { SendKey } from '../preferences'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { useObjectUrl } from '../ui/useObjectUrl'
import { draftText, MENTION_NAME_ATTRIBUTE } from './draftText'
import { type MentionCandidate, mentionCandidates, mentionQuery } from './mentionCandidates'
import { mentionSegments } from './mentionSegments'
import { MentionChip } from './MentionChip'
import { MentionMenu, mentionOptionId } from './MentionMenu'
import { strings } from '../../shared/strings'

interface Props {
  placeholder: string
  initialDraft?: string // what this bot's box held when it was left, or a suggestion put in it; either takes the focus
  quote?: string // the message being replied to, as plain text
  viewing?: ReactNode // what the user has open beside the chat while writing: a mini app of this bot
  inputRef: RefObject<HTMLDivElement | null>
  sidebar: SidebarState // the bots an @ offers, with their groups
  botId: string // whose chat this is; an @ does not offer it
  files: File[] // attached, not sent yet
  sendKey: SendKey
  isReplying: boolean // the bot is running a turn: an empty box offers to stop it, a written one still sends
  onStop: () => void
  onAddFiles: (files: File[]) => void
  onRemoveFile: (index: number) => void
  onCancelQuote: () => void
  onDraftChange: (text: string) => void
  onSend: (text: string) => boolean // false: refused, the draft stays
}

/** The @query being typed: the text node it is in, where its @ and the caret are. */
interface TypedMention {
  node: Text
  start: number
  end: number
  query: string
}

/** A picked bot in the box: the element the browser edits around as one piece, and the bot drawn into it. */
interface PlacedMention {
  holder: HTMLElement
  bot: Bot
}

/** The message box: Enter (or ⌘↵, by choice) sends, the other keys start a new line; files come from the picker or a paste; @ picks a bot, which sits in the text as a chip. */
export function Composer({
  placeholder,
  initialDraft = '',
  quote,
  viewing,
  inputRef,
  sidebar,
  botId,
  files,
  sendKey,
  isReplying,
  onStop,
  onAddFiles,
  onRemoveFile,
  onCancelQuote,
  onDraftChange,
  onSend,
}: Props) {
  const words = strings().chat.composer
  const [draft, setDraft] = useState(initialDraft)
  const [mention, setMention] = useState<TypedMention | null>(null) // null: no @ before the caret, or the menu was dismissed
  const [activeIndex, setActiveIndex] = useState(0)
  const [initial] = useState(() => draftNodes(initialDraft, sidebar.bots))
  const [placed, setPlaced] = useState(initial.placed) // kept until the message goes, so an undone deletion still has its chip
  const [selected, setSelected] = useState<HTMLElement[]>([]) // holders a selection covers
  const picker = useRef<HTMLInputElement>(null)
  const menuId = useId()
  const canSend = draft.trim() !== '' || files.length > 0
  const candidates = mention ? mentionCandidates(sidebar, botId, mention.query) : []
  const active = Math.min(activeIndex, candidates.length - 1)

  const attachEditor = useCallback(
    (editor: HTMLDivElement | null) => {
      inputRef.current = editor
      if (!editor || initial.nodes.length === 0) return
      editor.replaceChildren(...initial.nodes)
      editor.focus()
      document.getSelection()?.collapse(editor, editor.childNodes.length)
    },
    [inputRef, initial],
  )

  const sync = (editor: HTMLElement) => {
    const text = draftText(editor)
    setDraft(text)
    onDraftChange(text)
    setMention(typedMention(editor))
    setActiveIndex(0)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSend || !onSend(draft.trim())) return
    inputRef.current?.replaceChildren()
    setDraft('')
    setMention(null)
    setPlaced([])
    setSelected([])
  }

  const pick = ({ bot }: MentionCandidate) => {
    const editor = inputRef.current
    if (!editor || !mention) return
    const holder = placeMention(mention, bot)
    setPlaced((current) => [...current, { holder, bot }])
    sync(editor)
  }

  /** Arrows, Enter, Tab and Escape steer the @ menu while it is open; true when the key was for it. */
  const steerMenu = (event: KeyboardEvent): boolean => {
    if (!mention || event.nativeEvent.isComposing) return false
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (candidates.length === 0) return false
        const next = (active + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length
        setActiveIndex(next)
        document.getElementById(mentionOptionId(menuId, next))?.scrollIntoView({ block: 'nearest' })
        break
      }
      case 'Enter':
      case 'Tab': {
        const candidate = candidates[active]
        if (!candidate) return false
        pick(candidate)
        break
      }
      case 'Escape':
        setMention(null)
        break
      default:
        return false
    }
    event.preventDefault()
    return true
  }

  // copied cells and rich text carry a picture of themselves too; there the text is what the user meant
  const paste = (event: ClipboardEvent) => {
    event.preventDefault()
    if (!event.clipboardData.types.includes('text/plain')) return onAddFiles([...event.clipboardData.files])
    insertPlainText(event.clipboardData.getData('text/plain'))
  }

  // files dropped here go on to the chat, which attaches them
  const drop = (event: DragEvent) => {
    if (event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    insertPlainText(event.dataTransfer.getData('text/plain'))
  }

  return (
    <form
      onSubmit={submit}
      className="relative mx-auto mb-4 w-[calc(100%-48px)] max-w-[952px] shrink-0 rounded-3xl border border-transparent bg-surface p-[5px] shadow-card transition-colors duration-150 focus-within:border-ink/20"
    >
      <AnimatePresence>
        {mention && (
          <MentionMenu
            id={menuId}
            candidates={candidates}
            activeIndex={active}
            onHover={setActiveIndex}
            onPick={pick}
          />
        )}
      </AnimatePresence>
      {viewing}
      {quote !== undefined && (
        <div className="m-1 flex items-center gap-2 rounded-2xl border border-line py-1.5 pr-1.5 pl-3 text-sm text-soft">
          <span className="sr-only">{words.reply}</span>
          <span className="min-w-0 flex-1 truncate">{quote}</span>
          <button
            type="button"
            aria-label={words.cancelReply}
            onClick={onCancelQuote}
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <ul aria-label={words.attachments} className="flex flex-wrap gap-2 px-2 pt-2 pb-1">
          {files.map((file, index) => (
            <PendingFile key={`${index}-${file.name}`} file={file} onRemove={() => onRemoveFile(index)} />
          ))}
        </ul>
      )}
      <div className="flex items-end gap-1">
        <IconButton icon="plus" iconSize={20} label={words.addAttachment} onClick={() => picker.current?.click()} />
        {/* a textarea holds plain text only; the chips need an editable element */}
        <div
          ref={attachEditor}
          contentEditable
          role="textbox"
          tabIndex={0}
          aria-multiline="true"
          aria-label={placeholder}
          aria-placeholder={placeholder}
          aria-controls={mention ? menuId : undefined}
          aria-activedescendant={candidates.length > 0 ? mentionOptionId(menuId, active) : undefined}
          data-empty={draft === '' || undefined}
          onInput={(event) => sync(event.currentTarget)}
          onSelect={(event) => {
            setMention(typedMention(event.currentTarget))
            setActiveIndex(0)
            setSelected(coveredHolders(placed))
          }}
          onBlur={() => setMention(null)}
          onKeyDown={(event) => {
            if (steerMenu(event)) return
            if (isFormatShortcut(event)) return event.preventDefault()
            if (!isSendKey(event, sendKey)) return
            event.preventDefault()
            event.currentTarget.closest('form')?.requestSubmit()
          }}
          onPaste={paste}
          onDrop={drop}
          className="relative max-h-[200px] min-h-9 min-w-0 flex-1 overflow-y-auto px-1 py-1.5 break-words whitespace-pre-wrap outline-none data-empty:before:pointer-events-none data-empty:before:absolute data-empty:before:text-muted/70 data-empty:before:content-[attr(aria-placeholder)]"
        />
        {placed.map(({ holder, bot }, index) =>
          createPortal(<MentionChip bot={bot} isSelected={selected.includes(holder)} />, holder, String(index)),
        )}
        {isReplying && !canSend ? (
          <IconButton
            icon="stop"
            iconSize={20}
            label={words.stop}
            variant="solid"
            // the send button turns into this one in place: the second click of a double-click on send lands here
            onClick={(event) => event.detail < 2 && onStop()}
          />
        ) : (
          <IconButton
            icon="arrowUp"
            iconSize={20}
            label={words.send}
            variant="solid"
            type="submit"
            disabled={!canSend}
          />
        )}
      </div>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        aria-label={words.chooseAttachments}
        onChange={(event) => {
          onAddFiles([...(event.target.files ?? [])])
          event.target.value = '' // picking the same file again must fire change again
        }}
      />
    </form>
  )
}

function typedMention(editor: HTMLElement): TypedMention | null {
  const selection = document.getSelection()
  const node = selection?.anchorNode
  if (!selection?.isCollapsed || !(node instanceof Text) || !editor.contains(node)) return null
  const found = mentionQuery(node.data, selection.anchorOffset)
  return found && { node, ...found }
}

function coveredHolders(placed: PlacedMention[]): HTMLElement[] {
  const selection = document.getSelection()
  if (!selection || selection.isCollapsed) return []
  return placed.flatMap(({ holder }) => (selection.containsNode(holder) ? [holder] : []))
}

/** What a draft starts the box with: its text, and a holder for the chip of each @name of a known bot. */
function draftNodes(text: string, bots: Bot[]): { nodes: Node[]; placed: PlacedMention[] } {
  const pieces = mentionSegments(text, bots).map((segment): Text | PlacedMention =>
    segment.kind === 'mention'
      ? { holder: mentionHolder(segment.bot), bot: segment.bot }
      : document.createTextNode(segment.text),
  )
  return {
    nodes: pieces.map((piece) => (piece instanceof Text ? piece : piece.holder)),
    placed: pieces.flatMap((piece) => (piece instanceof Text ? [] : [piece])),
  }
}

/** Swaps the typed @query for a holder the chip is drawn into, and a space after it to type on. */
function placeMention({ node, start, end }: TypedMention, bot: Bot): HTMLElement {
  const holder = mentionHolder(bot)
  const space = document.createTextNode(' ')
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  range.deleteContents()
  range.insertNode(space)
  range.insertNode(holder)
  document.getSelection()?.collapse(space, 1)
  return holder
}

/** The element a chip is drawn into: the browser edits around it as one piece, and the draft reads its name. */
function mentionHolder(bot: Bot): HTMLElement {
  const holder = document.createElement('span')
  holder.setAttribute('contenteditable', 'false')
  holder.setAttribute(MENTION_NAME_ATTRIBUTE, bot.name)
  return holder
}

// execCommand, not a DOM edit: the browser keeps the insertion in its undo history and fires input
function insertPlainText(text: string) {
  document.execCommand('insertText', false, text)
}

// the draft is sent as plain text; bold, italic and underline in the box would only mislead
function isFormatShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())
}

function isSendKey(event: KeyboardEvent, sendKey: SendKey): boolean {
  // isComposing: this Enter confirms a candidate in a Chinese input method, it does not send
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return false
  switch (sendKey) {
    case 'enter':
      return !event.shiftKey
    case 'mod-enter':
      return event.metaKey || event.ctrlKey
    default:
      return sendKey satisfies never
  }
}

function PendingFile({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <li className="relative">
      {imageType(file.name) ? (
        <Thumbnail file={file} />
      ) : (
        <span className="flex h-14 max-w-[220px] items-center gap-1.5 rounded-xl bg-bubble px-3 text-sm">
          <Icon name="file" size={16} />
          <span className="truncate">{file.name}</span>
        </span>
      )}
      <button
        type="button"
        aria-label={strings().chat.composer.remove(file.name)}
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-ink text-canvas"
      >
        <Icon name="close" size={12} />
      </button>
    </li>
  )
}

function Thumbnail({ file }: { file: File }) {
  return <img src={useObjectUrl(file)} alt={file.name} className="size-14 rounded-xl object-cover shadow-ring" />
}
