import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { DISMISSED_KEEP_DAYS, type Dismissed } from '../../shared/sidebar'
import { strings } from '../../shared/strings'
import { BotAvatar } from '../bot/BotAvatar'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { daysLeftOf } from '../sidebar/sidebarState'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useNow } from '../ui/useNow'
import { SettingsPage, SettingsSection } from './SettingsSection'

interface Props {
  dismissed: Dismissed[]
  onRestore: (botId: string) => void
  onDelete: (botId: string) => Promise<void>
}

const REFRESH_MS = 60_000

/** Bot 回收站: the bots let go lately, each restorable until its days run out. */
export function DismissedSettings({ dismissed, onRestore, onDelete }: Props) {
  const words = strings().settings.dismissed
  const now = useNow(REFRESH_MS)
  const [confirming, setConfirming] = useState<Dismissed['bot'] | null>(null)
  const [failure, setFailure] = useState('')
  const kept = dismissed
    .map((entry) => ({ ...entry, daysLeft: daysLeftOf(entry.at, now) }))
    .filter(({ daysLeft }) => daysLeft > 0)
    .toReversed()
  const remove = async (bot: Dismissed['bot']) => {
    setFailure('')
    try {
      await onDelete(bot.id)
    } catch (error) {
      setFailure(ipcErrorMessage(error))
    }
  }
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
              <Button onClick={() => setConfirming(bot)} aria-label={words.deleteBot(bot.name)} className="text-danger">
                {words.delete}
              </Button>
              <Button onClick={() => onRestore(bot.id)} aria-label={words.restoreBot(bot.name)}>
                {words.restore}
              </Button>
            </div>
          ))}
        </SettingsSection>
      )}
      {failure && (
        <p role="alert" className="mt-4 px-1 text-sm text-danger">
          {failure}
        </p>
      )}
      <AnimatePresence>
        {confirming && (
          <ConfirmDialog
            title={words.deleteTitle(confirming.name)}
            body={words.deleteBody}
            confirmLabel={words.delete}
            onConfirm={() => void remove(confirming)}
            onClose={() => setConfirming(null)}
          />
        )}
      </AnimatePresence>
    </SettingsPage>
  )
}
