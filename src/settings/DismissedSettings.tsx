import { DISMISSED_KEEP_DAYS, type Dismissed } from '../../shared/sidebar'
import { strings } from '../../shared/strings'
import { BotAvatar } from '../bot/BotAvatar'
import { daysLeftOf } from '../sidebar/sidebarState'
import { Button } from '../ui/Button'
import { useNow } from '../ui/useNow'
import { SettingsPage, SettingsSection } from './SettingsSection'

interface Props {
  dismissed: Dismissed[]
  onRestore: (botId: string) => void
}

const REFRESH_MS = 60_000

/** 离职冷静期: the bots let go lately, each restorable until its days run out. */
export function DismissedSettings({ dismissed, onRestore }: Props) {
  const words = strings().settings.dismissed
  const now = useNow(REFRESH_MS)
  const kept = dismissed
    .map((entry) => ({ ...entry, daysLeft: daysLeftOf(entry.at, now) }))
    .filter(({ daysLeft }) => daysLeft > 0)
    .toReversed()
  return (
    <SettingsPage title={words.title} intro={words.intro(DISMISSED_KEEP_DAYS)}>
      {kept.length === 0 ? (
        <p className="mt-7 px-1 text-sm text-muted">{words.empty}</p>
      ) : (
        <SettingsSection>
          {kept.map(({ bot, daysLeft }) => (
            <div key={bot.id} className="flex items-center gap-3.5 px-5 py-3.5">
              <BotAvatar bot={bot} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-md">{bot.name}</div>
                <div className="text-xs text-muted">{words.daysLeft(daysLeft)}</div>
              </div>
              <Button onClick={() => onRestore(bot.id)} aria-label={words.restoreBot(bot.name)}>
                {words.restore}
              </Button>
            </div>
          ))}
        </SettingsSection>
      )}
    </SettingsPage>
  )
}
