import { AnimatePresence } from 'motion/react'
import { type FormEvent, Suspense, use, useState } from 'react'
import type { McpConfigView, McpServerView, McpToolView, NengyongBotBridge } from '../../shared/bridge'
import { ipcErrorMessage, type Loaded, settle } from '../ipcErrorMessage'
import { PrimaryButton } from '../ui/Button'
import { Collapsible } from '../ui/Collapsible'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { useFlash } from '../ui/useFlash'
import { McpGuideDialog } from './McpGuideDialog'
import { SettingsPage, SettingsRow, SettingsSection } from './SettingsSection'
import { strings } from '../../shared/strings'

interface Props {
  bridge: Pick<NengyongBotBridge, 'getMcpConfig' | 'setMcpConfig'>
}

type Status = { kind: 'idle' | 'connecting' } | { kind: 'error'; message: string }

const PAGE = { title: strings().settings.tools.title, intro: strings().settings.tools.intro }

/** The 工具 page: the local MCP servers, in the config file's own format; it connects on save. */
export function ToolsSettings({ bridge }: Props) {
  // read once per visit; it resolves when every server has connected or failed
  const [loading] = useState(() => settle(bridge.getMcpConfig()))
  return (
    <Suspense
      fallback={
        <SettingsPage {...PAGE}>
          <Notice text={strings().settings.tools.connecting} />
        </SettingsPage>
      }
    >
      <McpForm loading={loading} onSave={bridge.setMcpConfig} />
    </Suspense>
  )
}

interface FormProps {
  loading: Promise<Loaded<McpConfigView>>
  onSave: Props['bridge']['setMcpConfig']
}

function McpForm({ loading, onSave }: FormProps) {
  const loaded = use(loading)
  if (loaded.kind === 'failed')
    return (
      <SettingsPage {...PAGE}>
        <Notice text={loaded.message} />
      </SettingsPage>
    )
  return <Editor config={loaded.value} onSave={onSave} />
}

function Editor({ config, onSave }: { config: McpConfigView; onSave: Props['bridge']['setMcpConfig'] }) {
  const words = strings().settings.tools
  const [text, setText] = useState(config.text)
  const [servers, setServers] = useState(config.servers)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [isSaved, flashSaved] = useFlash<true>()
  const [isGuideOpen, setIsGuideOpen] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setStatus({ kind: 'connecting' })
    try {
      setServers((await onSave(text)).servers)
      setStatus({ kind: 'idle' })
      flashSaved(true)
    } catch (error) {
      setStatus({ kind: 'error', message: ipcErrorMessage(error) })
    }
  }

  const format = () => {
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2))
      setStatus((current) => (current.kind === 'error' ? { kind: 'idle' } : current))
    } catch {
      setStatus({ kind: 'error', message: words.invalidJson })
    }
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 flex-col">
      <SettingsPage {...PAGE}>
        <SettingsSection>
          <div className="relative">
            <textarea
              aria-label={words.mcpConfig}
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              className="block h-[240px] w-full resize-none rounded-xl bg-transparent py-4 pr-24 pl-5 font-mono text-sm outline-none"
            />
            <div className="absolute top-2 right-2 flex">
              <IconButton icon="braces" label={words.format} onClick={format} />
              <IconButton icon="help" label={words.mcpGuide} onClick={() => setIsGuideOpen(true)} />
            </div>
          </div>
        </SettingsSection>
        <AnimatePresence>{isGuideOpen && <McpGuideDialog onClose={() => setIsGuideOpen(false)} />}</AnimatePresence>

        {servers.length > 0 && (
          <SettingsSection title={words.mcpStatus}>
            {servers.map((server) => (
              <ServerRow key={server.name} server={server} />
            ))}
          </SettingsSection>
        )}
      </SettingsPage>

      <footer className="flex items-center gap-2 border-t border-line px-10 py-3.5">
        <p role="alert" className="mr-auto truncate text-sm text-danger">
          {status.kind === 'error' ? status.message : ''}
        </p>
        <PrimaryButton type="submit" disabled={status.kind === 'connecting'}>
          {status.kind === 'connecting' ? words.connectingShort : isSaved ? words.saved : words.saveAndConnect}
        </PrimaryButton>
      </footer>
    </form>
  )
}

function ServerRow({ server }: { server: McpServerView }) {
  const [isOpen, setIsOpen] = useState(false)
  if (server.kind === 'failed')
    return (
      <SettingsRow label={server.name} hint={server.message}>
        <ServerStatus server={server} />
      </SettingsRow>
    )
  return (
    <div>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="group flex w-full items-center justify-between gap-8 bg-none px-5 py-4 text-left"
      >
        <span className="min-w-0">
          <span className="block text-md text-ink">{server.name}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {strings().settings.tools.toolCount(server.tools.length)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <ServerStatus server={server} />
          <span className="text-muted transition-transform group-aria-expanded:rotate-90">
            <Icon name="chevron" size={14} />
          </span>
        </span>
      </button>
      <Collapsible isOpen={isOpen}>
        <McpTools tools={server.tools} />
      </Collapsible>
    </div>
  )
}

function McpTools({ tools }: { tools: McpToolView[] }) {
  const [openName, setOpenName] = useState<string>()
  const open = tools.find((tool) => tool.name === openName)
  return (
    <div className="px-5 pb-4">
      <div className="flex flex-wrap gap-1.5 font-mono">
        {tools.map((tool) => (
          <button
            key={tool.name}
            type="button"
            aria-expanded={tool.name === openName}
            onClick={() => setOpenName(tool.name === openName ? undefined : tool.name)}
            className="rounded-sm bg-bubble px-2 text-xs leading-[22px] text-soft aria-expanded:bg-ink aria-expanded:text-canvas"
          >
            {tool.name}
          </button>
        ))}
      </div>
      <Collapsible isOpen={open !== undefined}>
        <p className="pt-2.5 text-xs leading-relaxed text-muted">
          {open?.description || strings().settings.tools.noDescription}
        </p>
      </Collapsible>
    </div>
  )
}

function ServerStatus({ server }: { server: McpServerView }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
      <i data-status={server.kind} className="size-1.5 rounded-full bg-accent data-[status=failed]:bg-danger" />
      {server.kind === 'ready' ? strings().settings.tools.connected : strings().settings.tools.connectFailed}
    </span>
  )
}

function Notice({ text }: { text: string }) {
  return <p className="mt-7 text-sm text-muted">{text}</p>
}
