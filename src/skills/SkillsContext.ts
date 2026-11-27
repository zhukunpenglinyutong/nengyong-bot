import { createContext, useContext } from 'react'
import type { NengyongBotBridge } from '../../shared/bridge'
import type { SkillReader } from './SkillFilesDialog'

/** What the skills in the chat and the panel need of the bridge. */
interface Skills {
  reader: SkillReader
  manager?: Pick<NengyongBotBridge, 'answerSkillOffer' | 'uploadSkill' | 'answerSkillUpload' | 'removeSkills'> // absent on a device: skills are installed and removed on the computer
}

export const SkillsContext = createContext<Skills | null>(null)

export function useSkills(): Skills {
  const value = useContext(SkillsContext)
  if (!value) throw new Error('useSkills needs a <SkillsContext> above it')
  return value
}
