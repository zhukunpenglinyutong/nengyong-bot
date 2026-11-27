import { LayoutGroup } from 'motion/react'
import { type Bot, MAIN_BOT_ID } from '../../shared/bot'
import type { PanelData } from '../../shared/bridge'
import { strings } from '../../shared/strings'
import { useSkills } from '../skills/SkillsContext'
import { type SkillKey, SkillsTab } from '../skills/SkillsTab'
import { SkillUploader } from '../skills/SkillUploader'
import { useSkillUpload } from '../skills/useSkillUpload'
import { FlowsTab } from './FlowsTab'
import { Pill } from './PanelCard'

/** What the 能力 tab shows: the flows or the skills, and the one of them open, if any. */
export type Ability = { kind: 'flows'; flowId: string | null } | { kind: 'skills'; skill: SkillKey | null }

export const ABILITY_LISTS = {
  flows: { kind: 'flows', flowId: null },
  skills: { kind: 'skills', skill: null },
} as const satisfies Record<Ability['kind'], Ability>

interface Props {
  bot: Bot
  bots: Bot[]
  panel: PanelData
  ability: Ability
  onAbility: (ability: Ability) => void
  onFill: (text: string) => void // puts a message in the box for the user to finish and send
}

/** The panel's 能力 tab: the ways of working a bot has, learned (flows) or installed (skills), one kind at a time. */
export function AbilitiesTab({ bot, bots, panel, ability, onAbility, onFill }: Props) {
  const words = strings().bot.panel.abilityKinds
  const isListing = ability.kind === 'flows' ? ability.flowId === null : ability.skill === null
  const counts = { flows: panel.flows.length, skills: panel.skills.length }
  const upload = useSkillUpload(bot.id, useSkills().manager)
  return (
    <>
      {isListing && (
        <div className="sticky top-10 z-10 flex items-center justify-between gap-1.5 bg-canvas pt-3.5">
          <LayoutGroup id="ability-kind">
            <div role="group" aria-label={words.label} className="flex gap-1.5">
              {(['flows', 'skills'] as const).map((kind) => (
                <Pill key={kind} isOn={ability.kind === kind} onClick={() => onAbility(ABILITY_LISTS[kind])}>
                  {words[kind]}
                  <span className="text-xs opacity-60">{counts[kind]}</span>
                </Pill>
              ))}
            </div>
          </LayoutGroup>
          {ability.kind === 'skills' && upload && (
            <SkillUploader
              botName={bot.name}
              isMain={bot.id === MAIN_BOT_ID}
              isPicking={upload.isPicking}
              onPick={upload.pick}
            />
          )}
        </div>
      )}
      {ability.kind === 'flows' ? (
        <FlowsTab
          flows={panel.flows}
          tasks={panel.tasks}
          openFlowId={ability.flowId}
          onOpen={(flowId) => onAbility({ kind: 'flows', flowId })}
          onFill={onFill}
        />
      ) : (
        <SkillsTab
          bot={bot}
          bots={bots}
          skills={panel.skills}
          open={ability.skill}
          onList={() => onAbility(ABILITY_LISTS.skills)}
          onFill={onFill}
          upload={upload}
        />
      )}
    </>
  )
}
