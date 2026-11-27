import { useState } from 'react'
import { type Bot, MAIN_BOT_ID } from '../../shared/bot'
import type { SkillView } from '../../shared/skill'
import { strings } from '../../shared/strings'
import { BotAvatar } from '../bot/BotAvatar'
import { PanelAddRow, PanelEmpty } from '../bot/PanelCard'
import { useNavigation } from '../NavigationContext'
import { Collapsible } from '../ui/Collapsible'
import { Icon } from '../ui/Icon'
import { useFlash } from '../ui/useFlash'
import { SkillCollections } from './SkillCollections'
import { SkillDetail } from './SkillDetail'
import { SkillOfferCard } from './SkillOfferCard'
import { useSkills } from './SkillsContext'
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
  onList: () => void // back to the list from the skill shown
  onFill: (text: string) => void // puts a message in the box for the user to finish and send
  upload: SkillUpload | null // null on a device: skills are uploaded on the computer
}

/** The skills half of the 能力 tab: the skills installed on this bot, or one of them; on the main bot, every bot's. */
export function SkillsTab({ bot, bots, skills, open, onList, onFill, upload }: Props) {
  const words = strings().skills.list
  const { manager } = useSkills()
  const [removed, flashRemoved] = useFlash<string[]>()
  const [expanded, setExpanded] = useState<string[]>([])
  const shown = open && skills.find((skill) => skill.botId === open.botId && skill.name === open.name)
  const botName = (id: string) => bots.find((candidate) => candidate.id === id)?.name ?? id
  const toggle = (key: string) =>
    setExpanded(expanded.includes(key) ? expanded.filter((open) => open !== key) : [...expanded, key])
  const remove =
    manager &&
    (async (botId: string, names: string[]) => {
      await manager.removeSkills(botId, names)
      flashRemoved(names)
    })
  if (shown)
    return (
      <SkillDetail
        key={`${shown.botId}/${shown.name}/${shown.installedAt}`}
        skill={shown}
        botName={botName(shown.botId)}
        isOthers={shown.botId !== bot.id}
        onBack={onList}
        onFill={onFill}
        onRemove={
          remove &&
          (async () => {
            await remove(shown.botId, [shown.name])
            onList()
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
      {upload && <UploadFound upload={upload} botName={bot.name} />}
      {isMain ? (
        <TeamSkills bots={bots} skills={skills} expanded={expanded} onToggle={toggle} onRemove={remove} />
      ) : skills.length ? (
        <SkillCollections
          skills={skills}
          botName={bot.name}
          expanded={expanded}
          onToggle={toggle}
          onRemove={remove && ((names) => remove(bot.id, names))}
        />
      ) : (
        <PanelEmpty>{words.empty}</PanelEmpty>
      )}
      <PanelAddRow
        onClick={() => onFill(isMain ? words.teachTeamStarter : words.teachStarter)}
        title={isMain ? words.teachTeam : words.teach}
        hint={isMain ? words.teachTeamHint : words.teachHint}
      />
    </>
  )
}

interface TeamProps extends Pick<Props, 'bots' | 'skills'> {
  expanded: string[] // the bots open, by id, and the collections open, as SkillCollections keys them
  onToggle: (key: string) => void
  onRemove?: (botId: string, names: string[]) => Promise<void> // absent on a device: skills are removed on the computer
}

/** The main bot's list: every bot's skills under its name, folded until opened, its own first; one line below if some bots have none. */
function TeamSkills({ bots, skills, expanded, onToggle, onRemove }: TeamProps) {
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

/** What the last upload from this computer found, answered right here; or why it could not be read. */
function UploadFound({ upload, botName }: { upload: SkillUpload; botName: string }) {
  const { offer, error } = upload
  const { openSkillFiles } = useNavigation()
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
            onViewFiles={(name) => openSkillFiles({ ref: { kind: 'offer', offer: offer.offer, name }, name, botName })}
          />
        </section>
      )}
    </>
  )
}
