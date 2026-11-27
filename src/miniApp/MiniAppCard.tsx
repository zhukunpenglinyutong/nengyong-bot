import { latestVersion, type MiniApp, versionAt } from '../../shared/miniApp'
import { Icon } from '../ui/Icon'
import { MiniAppThumb } from './MiniAppThumb'
import { MiniAppTile } from './MiniAppTile'
import { strings } from '../../shared/strings'

interface Props {
  app: MiniApp
  at: number // when the reply linking it was written: the card names the version it was then
  thumbUrl: string
  onOpen: (from: Element) => void
}

/** A mini app a reply links, as a card under it: what that version changed, what the app looks like now. It opens the latest. */
export function MiniAppCard({ app, at, thumbUrl, onOpen }: Props) {
  const words = strings().miniApp.card
  const then = versionAt(app, at)
  const latest = latestVersion(app).version
  return (
    <div className="relative mt-2 w-[248px] rounded-lg bg-surface px-3 pt-2.5 shadow-card">
      <span className="flex items-center gap-1.5 text-sm text-muted">
        <MiniAppTile app={app} size={16} />
        {app.name}
      </span>
      <span className="mt-1 mb-2 block text-md leading-snug">{then.change}</span>
      <span className="block overflow-hidden rounded-sm">
        <MiniAppThumb src={thumbUrl} height={172} />
      </span>
      <button
        type="button"
        aria-label={words.open(app.name)}
        onClick={(event) => onOpen(event.currentTarget)}
        className="mt-2.5 flex h-8 w-full items-center gap-1.5 border-t border-line text-xs text-muted after:absolute after:inset-0"
      >
        <Icon name="cube" size={13} />
        {words.label(then.version)}
        {latest > then.version && <span className="ml-auto">{words.nowAt(latest)}</span>}
      </button>
    </div>
  )
}
