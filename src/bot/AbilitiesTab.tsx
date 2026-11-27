import { LayoutGroup } from 'motion/react'
import { type Bot, MAIN_BOT_ID } from '../../shared/bot'
import type { PanelData } from '../../shared/bridge'
import { strings } from '../../shared/strings'
import { useSkills } from '../skills/SkillsContext'
import { type SkillKey, SkillsTab } from '../skills/SkillsTab'
import { SkillUploader } from '../skills/SkillUploader'
import { DutyTab } from './DutyTab'
import { FlowsTab } from './FlowsTab'
import { Pill } from './PanelCard'

/** What the Bot 核心 tab shows: the duty, the flows or the skills, and the flow or skill open, if any. */
export type Ability =
  | { kind: 'duty' }
  | { kind: 'flows'; flowId: string | null }
  | { kind: 'skills'; skill: SkillKey | null }

export const ABILITY_LISTS = {
  duty: { kind: 'duty' },
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
  onReview?: (isOn: boolean) => void // absent on a device
}

/** The panel's Bot 核心 tab: what a bot is there to achieve (duty), and its ways of working, learned (flows) or installed (skills). */
export function AbilitiesTab({ bot, bots, panel, ability, onAbility, onFill, onReview }: Props) {
  const words = strings().bot.panel.abilityKinds
  const isListing =
    ability.kind === 'duty' || (ability.kind === 'flows' ? ability.flowId === null : ability.skill === null)
  const counts = { duty: panel.duty.objectives.length || '', flows: panel.flows.length, skills: panel.skills.length }
  const shared = useSkills().upload
  const upload = shared ? { ...shared, offer: shared.offer?.botId === bot.id ? shared.offer : null } : null // picked for another bot
  const content = () => {
    switch (ability.kind) {
      case 'duty':
        return <DutyTab duty={panel.duty} routines={panel.routines} onFill={onFill} onReview={onReview} />
      case 'flows':
        return (
          <FlowsTab
            flows={panel.flows}
            tasks={panel.tasks}
            openFlowId={ability.flowId}
            onOpen={(flowId) => onAbility({ kind: 'flows', flowId })}
            onFill={onFill}
          />
        )
      case 'skills':
        return (
          <SkillsTab
            bot={bot}
            bots={bots}
            skills={panel.skills}
            open={ability.skill}
            onList={() => onAbility(ABILITY_LISTS.skills)}
            onFill={onFill}
            upload={upload}
          />
        )
      default:
        return ability satisfies never
    }
  }
  return (
    <>
      {isListing && (
        <div className="sticky top-10 z-10 flex items-center justify-between gap-1.5 bg-canvas pt-3.5">
          <LayoutGroup id="ability-kind">
            <div role="group" aria-label={words.label} className="flex gap-1.5">
              {(['duty', 'flows', 'skills'] as const).map((kind) => (
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
      {content()}
    </>
  )
}
