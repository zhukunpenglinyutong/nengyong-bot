import { useState } from 'react'
import type { Bot } from '../../shared/bot'
import { type SidebarState } from '../../shared/sidebar'
import { ELAPSED_REFRESH_MS } from '../elapsedLabel'
import type { Thread } from '../harnessState'
import { sidebarView } from '../sidebarView'
import { Icon } from '../ui/Icon'
import { useNow } from '../ui/useNow'
import { botStatusOf } from './botStatus'
import { StatusAvatar } from './StatusAvatar'
import { StatusLine } from './StatusLine'
import { strings } from '../../shared/strings'

interface Props {
  sidebar: SidebarState // as the computer arranged it: a phone shows it, it does not change it
  thread: (botId: string) => Thread
  unread: Record<string, number> // replies that came while the phone showed something else
  onOpen: (botId: string) => void
}

/** The sidebar on a phone: every bot in the computer's order, pinned first, a tap opens its chat. */
export function PhoneBotList({ sidebar, thread, unread, onOpen }: Props) {
  const [folded, setFolded] = useState<string[]>([]) // sections folded on this phone only
  const now = useNow(ELAPSED_REFRESH_MS)
  const view = sidebarView(sidebar)
  const groups = [
    { id: 'pinned', name: null, bots: view.pinned },
    ...view.sections.map((section) => ({ id: section.id, name: section.name, bots: section.bots })),
    { id: 'ungrouped', name: strings().common.ungrouped, bots: view.ungrouped },
  ].filter((group) => group.bots.length > 0)
  const row = (bot: Bot) => (
    <BotRow
      key={bot.id}
      bot={bot}
      thread={thread(bot.id)}
      seenAt={sidebar.seenAt[bot.id] ?? 0}
      unread={unread[bot.id] ?? 0}
      now={now}
      onOpen={onOpen}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-side">
      <h1 className="shrink-0 px-5 pt-4 pb-2 text-xl font-semibold tracking-tight">Nengyong Bot</h1>
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {groups.map((group) => {
          const isFolded = folded.includes(group.id)
          return (
            <section key={group.id} aria-label={group.name ?? strings().sidebar.sections.pinned}>
              {group.name && (
                <button
                  aria-expanded={!isFolded}
                  onClick={() => setFolded(isFolded ? folded.filter((id) => id !== group.id) : [...folded, group.id])}
                  className="flex w-full items-center gap-1 px-5 pt-4 pb-1.5 text-left text-sm text-muted"
                >
                  <Icon name={isFolded ? 'chevron' : 'down'} size={14} />
                  {group.name}
                </button>
              )}
              {!isFolded && group.bots.map(row)}
            </section>
          )
        })}
      </div>
    </div>
  )
}

interface RowProps {
  bot: Bot
  thread: Thread
  seenAt: number
  unread: number
  now: number
  onOpen: (botId: string) => void
}

function BotRow({ bot, thread, seenAt, unread, now, onOpen }: RowProps) {
  const status = botStatusOf(thread, seenAt, false)
  return (
    <button onClick={() => onOpen(bot.id)} className="group flex w-full items-center gap-3 px-5 py-2.5 text-left">
      <StatusAvatar bot={bot} size={44} dotSize={15} status={status} />
      <span className="flex min-w-0 flex-1 flex-col leading-[1.4]">
        <span data-unread={unread > 0 || undefined} className="truncate text-base data-unread:font-semibold">
          {bot.name}
        </span>
        <StatusLine status={status} preview={thread.preview} unread={unread} now={now} />
      </span>
    </button>
  )
}
