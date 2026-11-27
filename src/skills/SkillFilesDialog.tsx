import { Suspense, use, useState } from 'react'
import type { NengyongBotBridge } from '../../shared/bridge'
import { type SkillFileView, type SkillRef, splitFrontmatter } from '../../shared/skill'
import { strings } from '../../shared/strings'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { Dialog } from '../ui/Dialog'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Segmented } from '../ui/Segmented'
import { useFlash } from '../ui/useFlash'
import { SkillMarkdown } from './SkillMarkdown'

/** The skill whose files to show: one a bot has, or one an install card offers, and whose it is or would be. */
export interface SkillFilesTarget {
  ref: SkillRef
  name: string
  botName: string
}

export type SkillReader = Pick<NengyongBotBridge, 'skillFiles' | 'skillFile'>

type Loaded<T> = { kind: 'loaded'; value: T } | { kind: 'failed'; message: string }

const settle = <T,>(promise: Promise<T>): Promise<Loaded<T>> =>
  promise.then(
    (value): Loaded<T> => ({ kind: 'loaded', value }),
    (error): Loaded<T> => ({ kind: 'failed', message: ipcErrorMessage(error) }),
  )

interface Props {
  target: SkillFilesTarget
  reader: SkillReader
  onReveal?: () => Promise<void> // shows an installed skill's folder in Finder; absent where there is no Finder
  onClose: () => void
}

/** Every file of a skill: the tree on the left, the open file on the right, SKILL.md first. Read only. */
export function SkillFilesDialog({ target, reader, onReveal, onClose }: Props) {
  const words = strings().skills.files
  // read once per opening; the files of an installed skill change only when it is installed again
  const [listing] = useState(() => settle(reader.skillFiles(target.ref)))
  const [revealFailure, flashRevealFailure] = useFlash<string>()
  const isPending = target.ref.kind === 'offer'
  return (
    <Dialog
      labelledBy="skill-files-title"
      onClose={onClose}
      className="flex h-[min(640px,88vh)] w-[min(900px,92vw)] flex-col overflow-hidden rounded-2xl bg-canvas"
    >
      <header className="flex items-center gap-3 py-4 pr-3 pl-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-bubble text-soft">
          <Icon name="skill" />
        </span>
        <span className="min-w-0 flex-1">
          <h2 id="skill-files-title" className="truncate text-lg font-semibold">
            {words.title(target.name)}
          </h2>
          <p className="truncate text-sm text-muted">
            {isPending ? words.pending(target.botName) : words.owner(target.botName)}
          </p>
        </span>
        {revealFailure && (
          <span role="alert" className="max-w-[240px] truncate text-sm text-danger">
            {revealFailure}
          </span>
        )}
        {!isPending && onReveal && (
          <IconButton
            icon="folder"
            label={words.reveal}
            onClick={() => onReveal().catch((error) => flashRevealFailure(words.failed(ipcErrorMessage(error))))}
          />
        )}
        <IconButton icon="close" label={words.close} onClick={onClose} />
      </header>
      <div className="mx-6 mb-6 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface">
        <Suspense fallback={<p className="p-5 text-sm text-muted">{words.loading}</p>}>
          <Files listing={listing} target={target} reader={reader} />
        </Suspense>
      </div>
    </Dialog>
  )
}

interface FilesProps {
  listing: Promise<Loaded<SkillFileView[]>>
  target: SkillFilesTarget
  reader: SkillReader
}

function Files({ listing, target, reader }: FilesProps) {
  const loaded = use(listing)
  const files = loaded.kind === 'loaded' ? loaded.value : []
  const load = (path: string) => ({ path, text: settle(reader.skillFile(target.ref, path)) })
  const [open, setOpen] = useState(() => (files[0] ? load(files[0].path) : null))
  if (loaded.kind === 'failed')
    return <p className="p-5 text-sm text-danger">{strings().skills.files.failed(loaded.message)}</p>
  return (
    <>
      <nav
        aria-label={strings().skills.files.list}
        className="w-[230px] shrink-0 overflow-y-auto border-r border-line p-1.5"
      >
        <FileTree files={files} openPath={open?.path} onOpen={(path) => setOpen(load(path))} />
      </nav>
      {open && (
        <Suspense key={open.path} fallback={<p className="p-5 text-sm text-muted">{strings().skills.files.loading}</p>}>
          <Preview path={open.path} text={open.text} file={files.find((file) => file.path === open.path)} />
        </Suspense>
      )}
    </>
  )
}

/** The files under their folders, each folder named once above the files in it. */
function FileTree({
  files,
  openPath,
  onOpen,
}: {
  files: SkillFileView[]
  openPath?: string
  onOpen: (path: string) => void
}) {
  return (
    <ul>
      {files.map((file, index) => {
        const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
        const previous = files[index - 1]?.path ?? ''
        const isNewFolder = folder !== '' && !previous.startsWith(`${folder}/`)
        const depth = folder ? folder.split('/').length : 0
        return (
          <li key={file.path}>
            {isNewFolder && (
              <span className="flex h-7 items-center gap-1.5 px-2 text-sm text-muted">
                <Icon name="folder" size={15} />
                <span className="truncate">{folder}</span>
              </span>
            )}
            <button
              type="button"
              title={file.path}
              aria-current={file.path === openPath}
              onClick={() => onOpen(file.path)}
              style={{ paddingLeft: 8 + depth * 14 }}
              className="flex h-7 w-full items-center gap-1.5 rounded-sm pr-2 text-left text-sm aria-current:bg-hover"
            >
              <Icon name={file.isScript ? 'terminal' : 'file'} size={15} />
              <span className="min-w-0 flex-1 truncate">{file.path.slice(folder ? folder.length + 1 : 0)}</span>
              {file.isScript && <span className="size-1.5 shrink-0 rounded-full bg-warning" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

interface PreviewProps {
  path: string
  text: Promise<Loaded<string | null>>
  file?: SkillFileView
}

function Preview({ path, text, file }: PreviewProps) {
  const words = strings().skills.files
  const loaded = use(text)
  const isMarkdown = path.toLowerCase().endsWith('.md')
  const [view, setView] = useState<'preview' | 'source'>('preview')
  const views = [
    { id: 'preview', label: words.preview, icon: 'eye' },
    { id: 'source', label: words.source, icon: 'braces' },
  ] as const
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{path}</span>
        {isMarkdown && <Segmented label={words.view} options={views} value={view} onChange={setView} />}
      </header>
      {file?.isScript && (
        <p className="flex items-start gap-2 border-b border-line bg-warning/10 px-4 py-2.5 text-sm text-soft">
          <span className="mt-0.5 text-warning">
            <Icon name="warning" size={15} />
          </span>
          {words.scriptNote}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {loaded.kind === 'failed' && <p className="text-sm text-danger">{words.failed(loaded.message)}</p>}
        {loaded.kind === 'loaded' && loaded.value === null && <p className="text-sm text-muted">{words.notText}</p>}
        {loaded.kind === 'loaded' &&
          loaded.value !== null &&
          (isMarkdown && view === 'preview' ? (
            <MarkdownPreview text={loaded.value} />
          ) : (
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink">{loaded.value}</pre>
          ))}
      </div>
    </section>
  )
}

/** A Markdown file as a document; its front matter (SKILL.md's name and description) stays as written above it. */
function MarkdownPreview({ text }: { text: string }) {
  const { head, body } = splitFrontmatter(text)
  return (
    <>
      {head && (
        <pre className="mb-4 rounded-md bg-bubble px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-soft">
          {head}
        </pre>
      )}
      <SkillMarkdown text={body} />
    </>
  )
}
