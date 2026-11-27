import { AnimatePresence } from 'motion/react'
import { type ComponentProps, memo, useState } from 'react'
import ReactMarkdown, { type Components, defaultUrlTransform } from 'react-markdown'
import remarkCjkFriendly from 'remark-cjk-friendly/parseOnly'
import remarkGfm from 'remark-gfm'
import type { Bot } from '../../shared/bot'
import type { Flow } from '../../shared/flow'
import type { MiniApp } from '../../shared/miniApp'
import { BotAvatar } from '../bot/BotAvatar'
import { MiniAppTile } from '../miniApp/MiniAppTile'
import { Icon } from '../ui/Icon'
import { ImagePreview } from './ImagePreview'
import { useMentions } from './MentionContext'
import { strings } from '../../shared/strings'

/** Bot replies are Markdown. No raw HTML is rendered, so model output cannot inject markup. */
// memo: every streamed token re-renders the whole thread; without it each token parses every reply again
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="[&_b,&_strong,&_h1,&_h2,&_h3]:font-semibold [&_code]:rounded-sm [&_code]:bg-hover [&_code]:px-1.5 [&_code]:py-px [&_code]:font-mono [&_code]:text-sm [&_code]:text-soft [&_li]:my-0.5 [&_li]:marker:text-muted [&_li>ul,&_li>ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-hover [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:block [&_table]:overflow-x-auto [&_td,&_th]:border [&_td,&_th]:border-line [&_td,&_th]:px-2 [&_td,&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5 [&>*+*]:mt-2.5">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} urlTransform={urlTransform} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  )
})

const REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly]

// bots are told to write mentions as [name](bot:ID), [name](flow:ID), [name](skill:name) and [name](app:ID), and link local
// files as file:// URLs on their own; everything else goes through the safe default (no javascript: etc.)
const MENTION_SCHEMES = ['bot:', 'flow:', 'skill:', 'app:', 'file:']
const urlTransform = (url: string) =>
  MENTION_SCHEMES.some((scheme) => url.startsWith(scheme)) ? url : defaultUrlTransform(url)

const COMPONENTS: Components = {
  img: Image,
  a: Link,
}

// remote images would load with no click, which could leak data a prompt injection put in the URL; a local one comes
// through the attachment protocol, which serves only images inside the library and never touches the network
function Image({ src, alt }: ComponentProps<'img'>) {
  const { fileUrl } = useMentions()
  const [isPreviewing, setIsPreviewing] = useState(false)
  const file = typeof src === 'string' ? localPath(src) : null
  if (!file) return <>{alt}</>
  const name = alt || strings().chat.messages.image
  return (
    <>
      <AnimatePresence>
        {isPreviewing && <ImagePreview src={fileUrl(file)} name={name} onClose={() => setIsPreviewing(false)} />}
      </AnimatePresence>
      <button
        type="button"
        aria-label={strings().chat.messages.viewImage(name)}
        onClick={() => setIsPreviewing(true)}
        className="block rounded-md"
      >
        <img src={fileUrl(file)} alt={name} className="max-h-80 rounded-md shadow-ring" />
      </button>
    </>
  )
}

/** Reads the mentions itself, so a renamed bot updates its mentions without parsing the replies again. */
function Link({ href, children }: ComponentProps<'a'>) {
  const { bots, open, flows, openFlow, skills, openSkill, miniApps, openMiniApp, openFile } = useMentions()
  const file = href ? localPath(href) : null
  if (file)
    return (
      <button type="button" onClick={() => openFile(file)} className="text-accent hover:underline">
        {children}
      </button>
    )
  if (href?.startsWith('app:')) {
    const app = miniApps.find((candidate) => candidate.id === href.slice(4))
    return app ? <MiniAppMention app={app} onOpen={(from) => openMiniApp(app.id, from)} /> : <>{children}</>
  }
  if (href?.startsWith('flow:')) {
    const flow = flows.find((candidate) => candidate.id === href.slice(5)) ?? flows.find((f) => f.name === children)
    return flow ? <FlowMention flow={flow} onOpen={() => openFlow(flow.id)} /> : <>{children}</>
  }
  if (href?.startsWith('skill:')) {
    // [name](skill:name) for a skill of the chat's bot; the main bot writes another bot's as skill:<bot id>/<name>
    const target = href.slice('skill:'.length)
    const slash = target.indexOf('/')
    const owner = slash === -1 ? undefined : target.slice(0, slash)
    const name = target.slice(slash + 1)
    const skill = skills.find((candidate) => candidate.name === name && (!owner || candidate.botId === owner))
    return skill ? (
      <SkillMention name={skill.name} onOpen={() => openSkill(skill.botId, skill.name)} />
    ) : (
      <>{children}</>
    )
  }
  if (href === 'bot' || href?.startsWith('bot:')) {
    // models sometimes mention a bot before create_bot returned its id: fall back to the link text as a name
    const bot = bots.find((b) => b.id === href.slice(4)) ?? bots.find((b) => b.name === children)
    return bot ? <BotMention bot={bot} onOpen={() => open(bot.id)} /> : <>{children}</>
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
      {children}
    </a>
  )
}

function FlowMention({ flow, onOpen }: { flow: Flow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1 rounded-sm bg-surface px-1.5 align-[-2px] text-sm font-medium text-ink shadow-ring"
    >
      <span className="text-accent">
        <Icon name="flow" size={14} />
      </span>
      {flow.name}
    </button>
  )
}

function SkillMention({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1 rounded-sm bg-surface px-1.5 align-[-2px] text-sm font-medium text-ink shadow-ring"
    >
      <span className="text-accent">
        <Icon name="skill" size={14} />
      </span>
      {name}
    </button>
  )
}

function MiniAppMention({ app, onOpen }: { app: MiniApp; onOpen: (from: Element) => void }) {
  return (
    <button
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
      className="inline-flex items-center gap-1 rounded-sm bg-surface py-px pr-1.5 pl-0.5 align-[-3px] text-sm font-medium text-ink shadow-ring"
    >
      <MiniAppTile app={app} size={16} />
      {app.name}
    </button>
  )
}

function BotMention({ bot, onOpen }: { bot: Bot; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group inline-flex items-center gap-1 rounded-sm px-1 align-[-2px]"
      style={{ color: bot.color }}
    >
      <BotAvatar bot={bot} size={15} />
      {bot.name}
    </button>
  )
}

function localPath(url: string) {
  if (!url.startsWith('file:')) return null
  try {
    return decodeURIComponent(new URL(url).pathname)
  } catch {
    return null // a malformed escape names no path to open
  }
}
