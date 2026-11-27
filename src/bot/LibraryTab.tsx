import { LayoutGroup } from 'motion/react'
import { useState } from 'react'
import type { LibraryItem } from '../../shared/bridge'
import { locale } from '../../shared/language'
import { strings } from '../../shared/strings'
import { TIMEZONE } from '../../shared/timezone'
import { Icon } from '../ui/Icon'
import { PanelCard, PanelEmpty, Pill } from './PanelCard'

const FILTERS: { id: string; label: string; accepts: (item: LibraryItem) => boolean }[] = [
  { id: 'all', label: strings().bot.panel.filters.all, accepts: () => true },
  { id: 'media', label: strings().bot.panel.filters.media, accepts: (item) => item.kind === 'media' },
  { id: 'file', label: strings().bot.panel.filters.file, accepts: (item) => item.kind !== 'media' },
]

export function LibraryTab({ library, onOpen }: { library: LibraryItem[]; onOpen: (path: string) => void }) {
  const [filter, setFilter] = useState(FILTERS[0])
  const items = library.filter(filter.accepts)

  return (
    <>
      <LayoutGroup id="library-filter">
        <div className="flex gap-1.5 pt-3.5 pb-1">
          {FILTERS.map((option) => (
            <Pill key={option.id} isOn={filter === option} onClick={() => setFilter(option)}>
              {option.label}
            </Pill>
          ))}
        </div>
      </LayoutGroup>
      {items.length === 0 ? (
        <PanelEmpty>{strings().bot.panel.noFiles}</PanelEmpty>
      ) : (
        <PanelCard className="mt-3 px-1.5 py-1">
          {items.map((item) => (
            <button
              key={item.path}
              onClick={() => onOpen(item.path)}
              className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-2 text-left text-sm text-muted/70"
            >
              {item.kind === 'media' ? (
                <span className="size-[22px] shrink-0 rounded-sm bg-ink" />
              ) : (
                <Icon name={item.kind} size={16} />
              )}
              <span className="min-w-0 flex-1 truncate text-ink">{item.path}</span>
              <small className="shrink-0 text-sm text-muted">
                {new Date(item.writtenAt).toLocaleDateString(locale(), {
                  timeZone: TIMEZONE,
                  month: 'numeric',
                  day: 'numeric',
                })}
              </small>
            </button>
          ))}
        </PanelCard>
      )}
    </>
  )
}
