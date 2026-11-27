import { motion } from 'motion/react'
import { z } from 'zod'
import type { Bot } from '../../shared/bot'
import type { OutfitId } from '../../shared/outfit'
import type { Entry, PanelData } from '../../shared/bridge'
import type { MiniApp } from '../../shared/miniApp'
import type { Run } from '../miniApp/miniAppRuns'
import { MiniAppsTab } from '../miniApp/MiniAppsTab'
import type { IconName } from '../ui/Icon'
import { Segmented } from '../ui/Segmented'
import { BotBadge } from './BotBadge'
import { type Ability, AbilitiesTab } from './AbilitiesTab'
import { FeedTab } from './FeedTab'
import { LibraryTab } from './LibraryTab'
import type { Look } from './LookPicker'
import { strings } from '../../shared/strings'

interface Props {
  bot: Bot
  bots: Bot[]
  entries: Entry[] // its chat, for the badge
  panel: PanelData
  isDebug: boolean // recent tasks are for whoever debugs the bot, hidden otherwise
  tab: PanelTab
  ability: Ability // what the 能力 tab shows
  onTab: (tab: PanelTab) => void
  onAbility: (ability: Ability) => void
  onFill: (text: string) => void // puts a message in the box for the user to finish and send
  miniAppRuns: Run[] // of its mini apps that have been opened: how each is doing
  thumbUrl: (app: MiniApp) => string
  onToggleRoutine: (routineId: string, isEnabled: boolean) => void
  onStopTask: (taskId: string) => void
  onOpenLibraryItem: (path: string) => void
  onRename?: (name: string) => void // absent: shown, not changed
  onPickLook?: (look: Look) => void
  onPickAvatar?: (avatar: string | undefined) => void
  onPickOutfit?: (outfit: OutfitId[]) => void
}

export const PanelTab = z.enum(['feed', 'abilities', 'miniApps', 'library']).catch('feed')
export type PanelTab = z.infer<typeof PanelTab>

const TABS = [
  { id: 'feed', label: strings().bot.panel.tabs.feed, icon: 'pulse' },
  { id: 'abilities', label: strings().bot.panel.tabs.abilities, icon: 'skill' },
  { id: 'miniApps', label: strings().bot.panel.tabs.miniApps, icon: 'cube' },
  { id: 'library', label: strings().bot.panel.tabs.library, icon: 'folder' },
] as const satisfies readonly { id: PanelTab; label: string; icon: IconName }[]

export function BotPanel({
  bot,
  bots,
  entries,
  panel,
  isDebug,
  tab,
  ability,
  onTab,
  onAbility,
  onFill,
  miniAppRuns,
  thumbUrl,
  onToggleRoutine,
  onStopTask,
  onOpenLibraryItem,
  onRename,
  onPickLook,
  onPickAvatar,
  onPickOutfit,
}: Props) {
  const content = () => {
    switch (tab) {
      case 'feed':
        return (
          <FeedTab
            panel={panel}
            entries={entries}
            bots={bots}
            isDebug={isDebug}
            onToggleRoutine={onToggleRoutine}
            onStopTask={onStopTask}
          />
        )
      case 'abilities':
        return (
          <AbilitiesTab bot={bot} bots={bots} panel={panel} ability={ability} onAbility={onAbility} onFill={onFill} />
        )
      case 'miniApps':
        return (
          <MiniAppsTab
            miniApps={panel.miniApps}
            runs={miniAppRuns}
            tasks={panel.tasks}
            thumbUrl={thumbUrl}
            onFill={onFill}
          />
        )
      case 'library':
        return <LibraryTab library={panel.library} onOpen={onOpenLibraryItem} />
      default:
        return tab satisfies never
    }
  }

  return (
    <aside
      aria-label={strings().bot.panel.details}
      className="@container relative h-full overflow-x-hidden overflow-y-auto bg-canvas"
    >
      <header className="relative z-20 px-[18px] pb-7">
        <BotBadge
          bot={bot}
          entries={entries}
          panel={panel}
          onRename={onRename}
          onPickLook={onPickLook}
          onPickAvatar={onPickAvatar}
          onPickOutfit={onPickOutfit}
          onOpenTab={onTab}
        />
      </header>
      <nav className="sticky top-0 z-10 flex justify-center bg-canvas py-1">
        <Segmented label={strings().bot.panel.content} options={TABS} value={tab} onChange={onTab} />
      </nav>
      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="px-[18px] pb-6"
      >
        {content()}
      </motion.div>
    </aside>
  )
}
