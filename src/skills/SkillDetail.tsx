import { AnimatePresence } from 'motion/react'
import { type ReactNode, Suspense, use, useState } from 'react'
import { SKILL_FILE, type SkillView, splitFrontmatter } from '../../shared/skill'
import { strings } from '../../shared/strings'
import { PanelCard, PanelSectionTitle } from '../bot/PanelCard'
import { useNavigation } from '../NavigationContext'
import { dateLabel, dateTimeLabel } from '../timeLabel'
import { ipcErrorMessage, type Loaded, settle } from '../ipcErrorMessage'
import { BackButton } from '../ui/BackButton'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Icon } from '../ui/Icon'
import { SkillMarkdown } from './SkillMarkdown'
import { useSkills } from './SkillsContext'
import { sourceLabel } from './sourceLabel'

interface Props {
  skill: SkillView
  botName: string // whose it is
  isOthers: boolean // the main bot's panel showing another bot's skill
  onBack: () => void
  onFill: (text: string) => void
  onRemove?: () => Promise<void> // absent where skills are not removed (a device)
}

/** One skill in the panel: when the bot uses it, how (the start of its SKILL.md), the scripts it runs, and its uses. */
export function SkillDetail({ skill, botName, isOthers, onBack, onFill, onRemove }: Props) {
  const words = strings().skills.detail
  const { reader } = useSkills()
  const { openSkillFiles } = useNavigation()
  const ref = { kind: 'installed', botId: skill.botId, name: skill.name } as const
  const openFiles = () => openSkillFiles({ ref, name: skill.name, botName })
  // read once per skill shown: its key changes with a reinstall, so a new version mounts a new one
  const [instructions] = useState(() => settle(reader.skillFile(ref, SKILL_FILE)))
  const [isConfirming, setIsConfirming] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const facts = [
    skill.version && words.version(skill.version),
    sourceLabel(skill.source),
    words.installedOn(dateLabel(skill.installedAt)),
  ]
  const remove = () => onRemove?.().catch((error) => setFailure(words.removeFailed(ipcErrorMessage(error))))
  return (
    <div className="pt-3">
      <div className="text-soft">
        <BackButton label={words.back} onClick={onBack}>
          {strings().skills.list.title}
        </BackButton>
      </div>
      <h4 className="mt-2 text-xl leading-snug font-semibold break-all text-ink">{skill.name}</h4>
      <p className="mt-1 text-sm text-muted">{facts.filter(Boolean).join(' · ')}</p>
      {isOthers && (
        <p className="mt-2.5 w-fit rounded-full bg-bubble px-2.5 py-0.5 text-sm text-soft">{words.owner(botName)}</p>
      )}
      <PanelSectionTitle>{words.when}</PanelSectionTitle>
      <p className="text-md leading-normal text-ink">{skill.description}</p>
      <PanelSectionTitle>{words.how}</PanelSectionTitle>
      <PanelCard className="overflow-hidden">
        <div className="max-h-[132px] overflow-hidden px-3.5 pt-3 [mask-image:linear-gradient(black_55%,transparent)]">
          <Suspense fallback={<p className="text-sm text-muted">{strings().skills.files.loading}</p>}>
            <Instructions loading={instructions} />
          </Suspense>
        </div>
        <button
          type="button"
          onClick={openFiles}
          className="flex items-center gap-0.5 px-3.5 pt-1.5 pb-2.5 text-sm text-accent"
        >
          {words.allFiles(skill.fileCount)}
          <Icon name="chevron" size={14} />
        </button>
      </PanelCard>
      {skill.scripts.length > 0 && (
        <>
          <PanelSectionTitle>{words.scripts}</PanelSectionTitle>
          <PanelCard>
            <ul aria-label={words.scripts}>
              {skill.scripts.map((script) => (
                <li key={script} className="flex items-center gap-2 px-3 py-2.5 font-mono text-xs text-soft">
                  <Icon name="terminal" size={14} />
                  <span className="truncate">{script}</span>
                </li>
              ))}
            </ul>
          </PanelCard>
          <p className="mt-2 px-0.5 text-xs text-muted">{words.scriptsNote}</p>
        </>
      )}
      <PanelSectionTitle>{words.usage}</PanelSectionTitle>
      <p className="text-md text-ink">
        {skill.lastUsedAt === null ? words.notUsed : words.uses(skill.uses, dateTimeLabel(skill.lastUsedAt))}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <FillButton onClick={() => onFill(words.useStarter(skill.name))}>{words.use}</FillButton>
        <FillButton onClick={openFiles}>{words.files}</FillButton>
      </div>
      {failure && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {failure}
        </p>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          className="mt-6 -ml-1 rounded-md px-1 py-0.5 text-sm text-danger"
        >
          {words.remove}
        </button>
      )}
      <AnimatePresence>
        {isConfirming && (
          <ConfirmDialog
            title={words.removeTitle(skill.name)}
            body={words.removeBody(botName)}
            confirmLabel={words.remove}
            onConfirm={() => void remove()}
            onClose={() => setIsConfirming(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Instructions({ loading }: { loading: Promise<Loaded<string | null>> }) {
  const loaded = use(loading)
  if (loaded.kind === 'failed')
    return <p className="text-sm text-danger">{strings().skills.files.failed(loaded.message)}</p>
  // the front matter repeats the name and description shown above it
  return <SkillMarkdown text={splitFrontmatter(loaded.value ?? '').body} />
}

function FillButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full bg-bubble px-3.5 py-1.5 text-md text-ink">
      {children}
    </button>
  )
}
