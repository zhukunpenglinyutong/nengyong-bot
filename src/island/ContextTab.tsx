import { type ReactNode, useState } from 'react'
import { type ContextView, joinSections, type ToolDefinition } from '../../shared/debug'
import { locale } from '../../shared/language'
import { strings } from '../../shared/strings'
import { Icon } from '../ui/Icon'
import { COPIED_LABEL, useCopy } from '../ui/useCopy'
import { CodeBlock } from './CodeBlock'
import { contextTokens, tokensLabel } from './contextTokens'

const KINDS = ['user', 'bot', 'tool', 'task-result', 'skill-answer', 'duty-answer', 'from-bot', 'routine'] as const

type Group = 'system' | 'transcript' | 'tools'
// one colour per source, read from data-group: the bar's segments and the dots beside the groups
const GROUP_COLORS =
  'block h-full data-[group=system]:bg-accent data-[group=tools]:bg-white/40 data-[group=transcript]:bg-white'

/** What the bot's chat sends the model: one bar split by source, and each source opened down to its text. */
export function ContextTab({ context }: { context: ContextView }) {
  const words = strings().debug.context
  const [openGroup, setOpenGroup] = useState<Group>()
  const [openSection, setOpenSection] = useState<number>()
  const [copied, copy] = useCopy()
  const tokens = contextTokens(context)
  const parts = [
    { group: 'system', tokens: tokens.system },
    { group: 'transcript', tokens: tokens.transcript },
    { group: 'tools', tokens: tokens.tools },
  ] as const
  const toggle = (group: Group) => setOpenGroup((open) => (open === group ? undefined : group))
  const measuredCached = context.measured
    ? Math.round((context.measured.cached / Math.max(1, context.measured.input)) * 100)
    : 0

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm text-white/60">
        <span>{words.sentToModel}</span>
        <span className="font-mono tabular-nums">
          <span className="text-xl font-semibold text-white">{tokensLabel(tokens.total)}</span> /{' '}
          {tokensLabel(context.windowTokens)} · {Math.round((tokens.total / context.windowTokens) * 100)}%
        </span>
      </div>
      <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-white/15">
        {parts.map((part) => (
          <span
            key={part.group}
            data-group={part.group}
            className={GROUP_COLORS}
            style={{ width: `${(part.tokens / context.windowTokens) * 100}%` }}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-white/40">
        {context.measured
          ? words.measured(context.measured.input.toLocaleString(locale()), measuredCached)
          : words.estimated}
      </p>

      <ContextGroup
        group="system"
        label={words.systemPrompt}
        meta={words.sections(context.sections.length)}
        tokens={tokens.system}
        isOpen={openGroup === 'system'}
        onToggle={() => toggle('system')}
      >
        {context.sections.map((section, index) => (
          <div key={section.heading ?? 'opening'}>
            <button
              type="button"
              aria-expanded={openSection === index}
              onClick={() => setOpenSection(openSection === index ? undefined : index)}
              className="flex h-8 w-full items-center gap-2 rounded-sm pr-2 pl-6 text-left text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{section.heading ?? words.opening}</span>
              <span className="font-mono text-xs text-white/60 tabular-nums">
                {tokensLabel(Math.round(section.text.length * context.tokensPerChar))}
              </span>
            </button>
            {openSection === index && (
              <div className="pr-2 pb-1.5 pl-6">
                <CodeBlock>{section.text}</CodeBlock>
              </div>
            )}
          </div>
        ))}
      </ContextGroup>

      <ContextGroup
        group="transcript"
        label={words.transcript}
        meta={context.transcript.to ? `#${context.transcript.from}–#${context.transcript.to}` : words.noneYet}
        tokens={tokens.transcript}
        isOpen={openGroup === 'transcript'}
        onToggle={() => toggle('transcript')}
      >
        <TranscriptDetail context={context} />
      </ContextGroup>

      <ContextGroup
        group="tools"
        label={words.tools}
        meta={words.toolCount(context.tools.definitions.length)}
        tokens={tokens.tools}
        isOpen={openGroup === 'tools'}
        onToggle={() => toggle('tools')}
      >
        <ToolDefinitions definitions={context.tools.definitions} />
      </ContextGroup>

      <div className="mt-3 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => copy(joinSections(context.sections))}
          className="flex h-7 items-center gap-1.5 rounded-full bg-white/12 px-3 text-sm"
        >
          <Icon name={copied === 'done' ? 'check' : 'copy'} size={14} />
          {copied ? COPIED_LABEL[copied] : words.copyPrompt}
        </button>
        <span className="text-xs text-white/40">{words.copyHint}</span>
      </div>
    </div>
  )
}

interface GroupProps {
  group: Group
  label: string
  meta: string
  tokens: number
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}

function ContextGroup({ group, label, meta, tokens, isOpen, onToggle, children }: GroupProps) {
  return (
    <div className="mt-2.5 rounded-lg bg-white/10">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="group flex h-10 w-full items-center gap-2 rounded-lg pr-3 pl-2.5 text-left text-md"
      >
        <span className="text-white/40 transition-transform group-aria-expanded:rotate-90">
          <Icon name="chevron" size={14} />
        </span>
        <span className="size-2 shrink-0 overflow-hidden rounded-full">
          <span data-group={group} className={GROUP_COLORS} />
        </span>
        <span className="shrink-0">{label}</span>
        <span className="truncate font-mono text-xs text-white/40">{meta}</span>
        <span className="ml-auto font-mono text-sm text-white/60 tabular-nums">≈{tokensLabel(tokens)}</span>
      </button>
      {isOpen && <div className="px-1.5 pt-1.5 pb-2">{children}</div>}
    </div>
  )
}

function TranscriptDetail({ context }: { context: ContextView }) {
  const { counts, from, messages } = context.transcript
  const words = strings().debug.context
  const [isShowingMessages, setIsShowingMessages] = useState(false)
  const pending = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const left = context.compactAbove + 1 - pending

  return (
    <>
      <Chips items={KINDS.flatMap((kind) => (counts[kind] ? [`${words.kinds[kind]} ${counts[kind]}`] : []))} />
      <div className="flex flex-col gap-1.5 pt-0.5 pr-2 pb-1 pl-6 text-xs text-white/40">
        {from > 1 && <p>{words.summarized(from - 1)}</p>}
        <p>{words.toolRecordsNote}</p>
        <div className="flex items-center gap-2 text-white/60">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
            <span
              className="block h-full bg-white"
              style={{ width: `${Math.min(100, (pending / (context.compactAbove + 1)) * 100)}%` }}
            />
          </span>
          <span className="font-mono tabular-nums">
            {pending} / {context.compactAbove + 1}
          </span>
        </div>
        <p>{left > 0 ? words.untilCompress(left, context.keepRecent) : words.compressNext(context.keepRecent)}</p>
        {messages.length > 0 && (
          <button
            type="button"
            aria-expanded={isShowingMessages}
            onClick={() => setIsShowingMessages(!isShowingMessages)}
            className="self-start rounded-sm bg-white/10 px-2 leading-[22px] text-white/60 aria-expanded:bg-white/25 aria-expanded:text-white"
          >
            {isShowingMessages ? words.hideMessages : words.showMessages(messages.length)}
          </button>
        )}
        {isShowingMessages && (
          <ol className="flex max-h-[360px] flex-col gap-2.5 overflow-auto rounded-md bg-white/10 px-2.5 py-2 font-mono">
            {messages.map((message, index) => (
              <li key={index}>
                <span className="text-white/40">{message.role}</span>
                <p className="break-all whitespace-pre-wrap text-white/60">{message.text}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}

function ToolDefinitions({ definitions }: { definitions: ToolDefinition[] }) {
  const [openName, setOpenName] = useState<string>()
  const open = definitions.find((tool) => tool.name === openName)

  return (
    <div className="pr-2 pb-1 pl-6">
      <div className="flex flex-wrap gap-1.5 font-mono">
        {definitions.map((tool) => (
          <button
            key={tool.name}
            type="button"
            aria-expanded={tool.name === openName}
            onClick={() => setOpenName(tool.name === openName ? undefined : tool.name)}
            className="rounded-sm bg-white/10 px-2 text-xs leading-[22px] text-white/60 aria-expanded:bg-white/25 aria-expanded:text-white"
          >
            {tool.name}
          </button>
        ))}
      </div>
      {open && (
        <p className="mt-2 text-xs leading-relaxed text-white/60">
          {open.description || strings().debug.context.noDescription}
        </p>
      )}
    </div>
  )
}

function Chips({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 pr-2 pb-1 pl-6">
      {items.map((item) => (
        <span key={item} className="rounded-sm bg-white/10 px-2 text-xs leading-[22px] text-white/60">
          {item}
        </span>
      ))}
    </div>
  )
}
