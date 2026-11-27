import { createContext, useContext } from 'react'
import type { NengyongBotBridge } from '../../shared/bridge'
import type { SkillReader } from './SkillFilesDialog'
import type { SkillUpload } from './useSkillUpload'

/** What the skills in the chat and the panel need of the bridge. */
interface Skills {
  reader: SkillReader
  manager?: Pick<NengyongBotBridge, 'answerSkillOffer' | 'uploadSkill' | 'answerSkillUpload' | 'removeSkills'> // absent on a device: skills are installed and removed on the computer
  upload?: SkillUpload | null // the open bot's upload from this computer, started in its panel or from the message box; absent on a device
}

export const SkillsContext = createContext<Skills | null>(null)

export function useSkills(): Skills {
  const value = useContext(SkillsContext)
  if (!value) throw new Error('useSkills needs a <SkillsContext> above it')
  return value
}
