import { type Bot, MAIN_BOT_ID } from '../../shared/bot'
import type { PanelData } from '../../shared/bridge'
import { strings } from '../../shared/strings'
import type { SkillFilesTarget, SkillReader } from '../skills/SkillFilesDialog'
import { type SkillKey, SkillsTab } from '../skills/SkillsTab'
import { SkillUploader } from '../skills/SkillUploader'
import { type SkillUploads, useSkillUpload } from '../skills/useSkillUpload'
import { FlowsTab } from './FlowsTab'

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
  reader: SkillReader
  onOpenSkillFiles: (target: SkillFilesTarget) => void
  onRemoveSkill?: (botId: string, names: string[]) => Promise<void> // absent on a device
  skillUploads?: SkillUploads // absent on a device
}

/** The panel's 能力 tab: the ways of working a bot has, learned (flows) or installed (skills), one kind at a time. */
export function AbilitiesTab({
  bot,
  bots,
  panel,
  ability,
  onAbility,
  onFill,
  reader,
  onOpenSkillFiles,
  onRemoveSkill,
  skillUploads,
}: Props) {
  const words = strings().bot.panel.abilityKinds
  const isListing = ability.kind === 'flows' ? ability.flowId === null : ability.skill === null
  const counts = { flows: panel.flows.length, skills: panel.skills.length }
  const upload = useSkillUpload(bot.id, skillUploads)
  return (
    <>
      {isListing && (
        <div className="sticky top-10 z-10 flex items-center justify-between gap-1.5 bg-canvas pt-3.5">
          <div role="group" aria-label={words.label} className="flex gap-1.5">
            {(['flows', 'skills'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={ability.kind === kind}
                onClick={() => onAbility(ABILITY_LISTS[kind])}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-bubble px-3 text-sm text-soft aria-pressed:bg-ink aria-pressed:text-canvas"
              >
                {words[kind]}
                <span className="text-xs opacity-60">{counts[kind]}</span>
              </button>
            ))}
          </div>
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
          reader={reader}
          onOpen={(skill) => onAbility({ kind: 'skills', skill })}
          onFill={onFill}
          onOpenFiles={onOpenSkillFiles}
          onRemove={onRemoveSkill}
          upload={upload}
        />
      )}
    </>
  )
}
