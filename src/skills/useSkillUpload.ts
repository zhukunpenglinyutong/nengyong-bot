import { useState } from 'react'
import type { NengyongBotBridge } from '../../shared/bridge'
import type { SkillOffer, SkillUploadKind } from '../../shared/skill'
import { strings } from '../../shared/strings'
import { ipcErrorMessage } from '../ipcErrorMessage'

type SkillUploads = Pick<NengyongBotBridge, 'uploadSkill' | 'answerSkillUpload'>

export interface SkillUpload {
  offer: SkillOffer | null
  error: string | null
  isPicking: boolean
  pick: (kind: SkillUploadKind) => Promise<void>
  answer: (offer: string, names: string[]) => Promise<void>
}

/**
 * The skills tab's upload from this computer: the card of the skills the last pick found, or why it could not be read.
 * Picking again replaces the card; cancelling the dialog keeps it. Null on a device: skills are uploaded on the computer.
 */
export function useSkillUpload(botId: string, uploads: SkillUploads | undefined): SkillUpload | null {
  const [offer, setOffer] = useState<SkillOffer | null>(null)
  const [isPicking, setIsPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!uploads) return null
  const pick = async (kind: SkillUploadKind) => {
    setIsPicking(true)
    setError(null)
    try {
      const read = await uploads.uploadSkill(botId, kind)
      if (read) setOffer(read)
    } catch (failure) {
      setError(strings().skills.upload.failed(ipcErrorMessage(failure)))
    } finally {
      setIsPicking(false)
    }
  }
  return {
    offer,
    error,
    isPicking,
    pick,
    answer: (offerId, names) => uploads.answerSkillUpload(botId, offerId, names),
  }
}
