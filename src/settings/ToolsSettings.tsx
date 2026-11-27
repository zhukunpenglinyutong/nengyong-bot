import { AnimatePresence } from 'motion/react'
import { type FormEvent, Suspense, use, useState } from 'react'
import type { McpConfigView, McpServerView, McpToolView, NengyongBotBridge } from '../../shared/bridge'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { Collapsible } from '../ui/Collapsible'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Segmented } from '../ui/Segmented'
import { useFlash } from '../ui/useFlash'
import { McpGuideDialog } from './McpGuideDialog'
import { type Brand, BrandLogo } from './ModelLogo'
import { COMING_SOON, PickerButton } from './PickerButton'
import { SettingsPrimaryButton, SettingsRow, SettingsSection } from './SettingsSection'
import { strings } from '../../shared/strings'

interface Props {
  bridge: Pick<NengyongBotBridge, 'getMcpConfig' | 'setMcpConfig'>
}

type Loaded = { kind: 'loaded'; config: McpConfigView } | { kind: 'failed'; message: string }

type Status = { kind: 'idle' | 'connecting' } | { kind: 'error'; message: string }

const TABS = [
  { id: 'mcp', label: strings().settings.tools.mcpTab, icon: 'plug' },
  { id: 'cli', label: strings().settings.tools.cliTab, icon: 'terminal' },
] as const

type Tab = (typeof TABS)[number]['id']

const CLIS: { name: string; brand: Brand }[] = [
  { name: 'Claude Code', brand: 'anthropic' },
  { name: 'DeepSeek Harness', brand: 'deepseek' },
  { name: 'Codex CLI', brand: 'openai' },
  { name: 'PI CLI', brand: 'pi' },
  { name: 'OMP CLI', brand: 'omp' },
  { name: 'OpenCode', brand: 'opencode' },
  { name: 'CodeBuddy CLI', brand: 'codebuddy' },
  { name: 'Grok CLI', brand: 'grok' },
  { name: 'Kimi CLI', brand: 'kimi' },
  { name: 'Antigravity CLI', brand: 'gemini' },
  { name: 'Qoder CLI', brand: 'qoder' },
  { name: 'Qoder CLI CN', brand: 'qoder' },
  { name: 'MiniMax Code', brand: 'minimax' },
]

/** The 工具 page: the local MCP servers and the coding agents' CLIs on two tabs; the MCP config connects on save. */
export function ToolsSettings({ bridge }: Props) {
  const words = strings().settings.tools
  const [tab, setTab] = useState<Tab>('mcp')
  // read once per visit; it resolves when every server has connected or failed
  const [loading] = useState(() =>
    bridge.getMcpConfig().then(
      (config): Loaded => ({ kind: 'loaded', config }),
      (error): Loaded => ({ kind: 'failed', message: ipcErrorMessage(error) }),
    ),
  )
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-start justify-between gap-6 px-10 pt-9">
        <div>
          <h2 id="settings-title" className="text-xl font-semibold tracking-tight">
            {words.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{words.intro}</p>
        </div>
        <div className="mr-3 shrink-0">
          <Segmented label={words.toolType} options={TABS} value={tab} onChange={setTab} />
        </div>
      </header>
      <div hidden={tab !== 'cli'} className="min-h-0 flex-1 overflow-y-auto px-10 pb-8">
        <CliList />
      </div>
      <div hidden={tab !== 'mcp'} className="flex min-h-0 flex-1">
        <Suspense fallback={<Notice text={words.connecting} />}>
          <McpForm loading={loading} onSave={bridge.setMcpConfig} />
        </Suspense>
      </div>
    </div>
  )
}

function CliList() {
  const words = strings().settings.tools
  return (
    <>
      <SettingsSection>
        {CLIS.map((cli) => (
          <div key={cli.name} className="flex items-center gap-3 px-5 py-3">
            <BrandLogo brand={cli.brand} name={cli.name} size={32} />
            <span className="flex-1 text-md">{cli.name}</span>
            <PickerButton menuLabel={cli.name} items={COMING_SOON}>
              <span className="px-1 text-soft">{words.cliOff}</span>
            </PickerButton>
          </div>
        ))}
      </SettingsSection>
      <p className="mt-2 px-1 text-xs text-muted">{words.cliHint}</p>
    </>
  )
}

function McpForm({ loading, onSave }: { loading: Promise<Loaded>; onSave: Props['bridge']['setMcpConfig'] }) {
  const loaded = use(loading)
  if (loaded.kind === 'failed') return <Notice text={loaded.message} />
  return <Editor config={loaded.config} onSave={onSave} />
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
      <div className="flex-1 overflow-y-auto px-10 pb-8">
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
      </div>

      <footer className="flex items-center gap-2 border-t border-line px-10 py-3.5">
        <p role="alert" className="mr-auto truncate text-sm text-danger">
          {status.kind === 'error' ? status.message : ''}
        </p>
        <SettingsPrimaryButton type="submit" disabled={status.kind === 'connecting'}>
          {status.kind === 'connecting' ? words.connectingShort : isSaved ? words.saved : words.saveAndConnect}
        </SettingsPrimaryButton>
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
        className="group flex w-full items-center justify-between gap-8 bg-none px-5 py-4 text-left active:scale-100"
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
  return <p className="mt-7 px-10 text-sm text-muted">{text}</p>
}
