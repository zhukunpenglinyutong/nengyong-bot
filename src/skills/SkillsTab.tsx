import { useState } from 'react'
import { type Bot, MAIN_BOT_ID } from '../../shared/bot'
import type { SkillView } from '../../shared/skill'
import { strings } from '../../shared/strings'
import { BotAvatar } from '../bot/BotAvatar'
import { PanelEmpty } from '../bot/PanelCard'
import { Collapsible } from '../ui/Collapsible'
import { Icon } from '../ui/Icon'
import { useFlash } from '../ui/useFlash'
import { SkillCollections } from './SkillCollections'
import { SkillDetail } from './SkillDetail'
import type { SkillFilesTarget, SkillReader } from './SkillFilesDialog'
import { SkillOfferCard } from './SkillOfferCard'
import type { SkillUpload } from './useSkillUpload'

/** A skill of one bot, as the panel opens it. */
export interface SkillKey {
  botId: string
  name: string
}

interface Props {
  bot: Bot // whose panel this is
  bots: Bot[] // the main bot's list is grouped by them
  skills: SkillView[] // what it can use: its own, the main bot's every bot's
  open: SkillKey | null // the skill shown; the list when null or gone
  reader: SkillReader
  onOpen: (skill: SkillKey | null) => void
  onFill: (text: string) => void // puts a message in the box for the user to finish and send
  onOpenFiles: (target: SkillFilesTarget) => void
  onRemove?: (botId: string, names: string[]) => Promise<void> // absent on a device: skills are removed on the computer
  upload: SkillUpload | null // null on a device: skills are uploaded on the computer
}

/** The skills half of the 能力 tab: the skills installed on this bot, or one of them; on the main bot, every bot's. */
export function SkillsTab({ bot, bots, skills, open, reader, onOpen, onFill, onOpenFiles, onRemove, upload }: Props) {
  const words = strings().skills.list
  const [removed, flashRemoved] = useFlash<string[]>()
  const [expanded, setExpanded] = useState<string[]>([])
  const shown = open && skills.find((skill) => skill.botId === open.botId && skill.name === open.name)
  const botName = (id: string) => bots.find((candidate) => candidate.id === id)?.name ?? id
  const toggle = (key: string) =>
    setExpanded(expanded.includes(key) ? expanded.filter((open) => open !== key) : [...expanded, key])
  const remove =
    onRemove &&
    (async (botId: string, names: string[]) => {
      await onRemove(botId, names)
      flashRemoved(names)
    })
  if (shown)
    return (
      <SkillDetail
        key={`${shown.botId}/${shown.name}/${shown.installedAt}`}
        skill={shown}
        botName={botName(shown.botId)}
        isOthers={shown.botId !== bot.id}
        reader={reader}
        onBack={() => onOpen(null)}
        onFill={onFill}
        onOpenFiles={onOpenFiles}
        onRemove={
          remove &&
          (async () => {
            await remove(shown.botId, [shown.name])
            onOpen(null)
          })
        }
      />
    )
  const isMain = bot.id === MAIN_BOT_ID
  return (
    <>
      <p className="pt-3.5 pb-2.5 text-sm text-muted">{isMain ? words.teamIntro(bot.name) : words.intro}</p>
      {removed && (
        <p role="status" className="mb-2.5 flex items-center gap-1.5 text-sm text-soft">
          <Icon name="check" size={15} />
          {strings().skills.detail.removed(strings().skills.names(removed))}
        </p>
      )}
      {upload && <UploadFound upload={upload} botName={bot.name} onOpenFiles={onOpenFiles} />}
      {isMain ? (
        <TeamSkills
          bots={bots}
          skills={skills}
          expanded={expanded}
          onToggle={toggle}
          onOpen={onOpen}
          onRemove={remove}
        />
      ) : skills.length ? (
        <SkillCollections
          skills={skills}
          botName={bot.name}
          expanded={expanded}
          onToggle={toggle}
          onOpen={onOpen}
          onRemove={remove && ((names) => remove(bot.id, names))}
        />
      ) : (
        <PanelEmpty>{words.empty}</PanelEmpty>
      )}
      <TeachButton
        onClick={() => onFill(isMain ? words.teachTeamStarter : words.teachStarter)}
        title={isMain ? words.teachTeam : words.teach}
        hint={isMain ? words.teachTeamHint : words.teachHint}
      />
    </>
  )
}

interface TeamProps extends Pick<Props, 'bots' | 'skills' | 'onOpen' | 'onRemove'> {
  expanded: string[] // the bots open, by id, and the collections open, as SkillCollections keys them
  onToggle: (key: string) => void
}

/** The main bot's list: every bot's skills under its name, folded until opened, its own first; one line below if some bots have none. */
function TeamSkills({ bots, skills, expanded, onToggle, onOpen, onRemove }: TeamProps) {
  const words = strings().skills.list
  const owners = [...new Set(skills.map((skill) => skill.botId))]
  const hasBotsWithout = bots.some((bot) => bot.id !== MAIN_BOT_ID && !owners.includes(bot.id))
  return (
    <>
      {owners.map((owner) => {
        const ownerBot = bots.find((candidate) => candidate.id === owner)
        const ofOwner = skills.filter((skill) => skill.botId === owner)
        const isOpen = expanded.includes(owner)
        return (
          <section key={owner}>
            <h5>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => onToggle(owner)}
                className="group flex w-full items-center gap-2 rounded-md px-1.5 py-2 text-left text-sm text-soft"
              >
                <span className="text-muted transition-transform group-aria-expanded:rotate-90">
                  <Icon name="chevron" size={14} />
                </span>
                {ownerBot && <BotAvatar bot={ownerBot} size={20} />}
                {ownerBot?.name ?? owner}
                {owner === MAIN_BOT_ID && <span className="text-xs text-muted">{words.own}</span>}
                <span className="ml-auto text-xs text-muted">{words.count(ofOwner.length)}</span>
              </button>
            </h5>
            <Collapsible isOpen={isOpen}>
              <div className="p-px pb-2">
                <SkillCollections
                  skills={ofOwner}
                  botName={ownerBot?.name ?? owner}
                  expanded={expanded}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  onRemove={onRemove && ((names) => onRemove(owner, names))}
                />
              </div>
            </Collapsible>
          </section>
        )
      })}
      {!owners.length && <PanelEmpty>{words.empty}</PanelEmpty>}
      {owners.length > 0 && hasBotsWithout && <p className="mt-3 px-0.5 text-xs text-muted">{words.othersNone}</p>}
    </>
  )
}

interface UploadFoundProps {
  upload: SkillUpload
  botName: string
  onOpenFiles: (target: SkillFilesTarget) => void
}

/** What the last upload from this computer found, answered right here; or why it could not be read. */
function UploadFound({ upload, botName, onOpenFiles }: UploadFoundProps) {
  const { offer, error } = upload
  return (
    <>
      {error && (
        <p role="alert" className="mb-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      {offer && (
        <section aria-label={strings().skills.upload.title} className="mb-2.5">
          <SkillOfferCard
            key={offer.offer}
            offer={offer}
            installed={null}
            onAnswer={(names) => upload.answer(offer.offer, names)}
            onViewFiles={(name) => onOpenFiles({ ref: { kind: 'offer', offer: offer.offer, name }, name, botName })}
          />
        </section>
      )}
    </>
  )
}

function TeachButton({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2.5 flex w-full items-center gap-3 rounded-lg p-3 text-left leading-[1.35] text-soft shadow-ring"
    >
      <Icon name="plus" size={20} />
      <span className="flex flex-col">
        <span className="text-md">{title}</span>
        <small className="text-sm text-muted">{hint}</small>
      </span>
    </button>
  )
}
