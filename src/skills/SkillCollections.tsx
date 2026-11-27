import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import type { SkillSource, SkillView } from '../../shared/skill'
import { strings } from '../../shared/strings'
import { PanelCard } from '../bot/PanelCard'
import { useNavigation } from '../NavigationContext'
import { dateTimeLabel } from '../timeLabel'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { Collapsible } from '../ui/Collapsible'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Icon } from '../ui/Icon'

interface Props {
  skills: SkillView[] // one bot's
  botName: string // whose they are
  expanded: string[] // the collections open, as `botId/collection id`; the rest are folded
  onToggle: (key: string) => void
  onRemove?: (names: string[]) => Promise<void> // absent on a device: skills are removed on the computer
}

/** One bot's skills under the collection each came from, in the order they were installed, folded until opened. */
export function SkillCollections({ skills, botName, expanded, onToggle, onRemove }: Props) {
  const collections = Map.groupBy(skills, (skill) => collectionOf(skill.source).id)
  return (
    <div className="flex flex-col gap-1">
      {[...collections].map(([id, members]) => {
        const key = `${members[0].botId}/${id}`
        return (
          <Collection
            key={id}
            skills={members}
            botName={botName}
            isOpen={expanded.includes(key)}
            onToggle={() => onToggle(key)}
            onRemove={onRemove}
          />
        )
      })}
    </div>
  )
}

/**
 * A skill collection: the skills installed from one GitHub repository, or from one folder or archive on this computer.
 * The id tells two folders of one name apart; the name is what the panel shows.
 */
function collectionOf(source: SkillSource) {
  if (source.kind === 'github') return { id: source.repo, name: source.repo }
  return { id: source.root, name: source.root.split(/[\\/]/).filter(Boolean).at(-1) ?? source.root }
}

interface CollectionProps extends Pick<Props, 'skills' | 'botName' | 'onRemove'> {
  isOpen: boolean
  onToggle: () => void
}

/**
 * A collection's name and count over its skills, held under the panel's tabs while its skills scroll by;
 * one of several can be removed at once, once confirmed.
 */
function Collection({ skills, botName, isOpen, onToggle, onRemove }: CollectionProps) {
  const words = strings().skills
  const [isConfirming, setIsConfirming] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const { id, name } = collectionOf(skills[0].source)
  const removeAll = () =>
    onRemove?.(skills.map((skill) => skill.name)).catch((error) =>
      setFailure(words.detail.removeFailed(ipcErrorMessage(error))),
    )
  return (
    <section>
      <div className="sticky top-[82px] z-10 flex items-center gap-1.5 bg-canvas text-sm text-soft">
        <h6 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={onToggle}
            title={id}
            className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-2 text-left"
          >
            <span className="text-muted transition-transform group-aria-expanded:rotate-90">
              <Icon name="chevron" size={14} />
            </span>
            <Icon name="folder" size={14} />
            <span className="min-w-0 truncate">{name}</span>
            <span className="shrink-0 text-xs text-muted">{words.list.count(skills.length)}</span>
          </button>
        </h6>
        {onRemove && skills.length > 1 && (
          <button
            type="button"
            onClick={() => setIsConfirming(true)}
            className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted"
          >
            {words.list.removeAll}
          </button>
        )}
      </div>
      <Collapsible isOpen={isOpen}>
        <div className="p-px pb-2">
          <SkillList label={name} skills={skills} />
        </div>
      </Collapsible>
      {failure && (
        <p role="alert" className="mt-1.5 px-1 text-sm text-danger">
          {failure}
        </p>
      )}
      <AnimatePresence>
        {isConfirming && (
          <ConfirmDialog
            title={words.list.removeAllTitle(name, skills.length)}
            body={words.list.removeAllBody(botName)}
            confirmLabel={words.detail.remove}
            onConfirm={() => void removeAll()}
            onClose={() => setIsConfirming(false)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

function SkillList({ label, skills }: { label: string } & Pick<Props, 'skills'>) {
  const words = strings().skills.list
  const { openSkill } = useNavigation()
  return (
    <PanelCard>
      <ul aria-label={label}>
        {skills.map((skill) => (
          <li key={`${skill.botId}/${skill.name}`}>
            <button
              type="button"
              onClick={() => openSkill(skill.botId, skill.name)}
              className="flex w-full flex-col p-3 text-left leading-[1.35]"
            >
              <span className="truncate text-md text-ink">{skill.name}</span>
              <small className="truncate text-sm text-soft">{skill.description}</small>
              <small className="mt-1 text-xs text-muted">
                {[
                  skill.scripts.length > 0 && words.scripts(skill.scripts.length),
                  skill.lastUsedAt === null ? words.notUsed : words.lastUsed(dateTimeLabel(skill.lastUsedAt)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </PanelCard>
  )
}
