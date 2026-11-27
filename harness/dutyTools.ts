import { tool } from 'ai'
import { z } from 'zod'
import type { HarnessEvent } from '../shared/bridge'
import { MAX_KEY_RESULTS, MAX_OBJECTIVES, Progress } from '../shared/duty'
import { checkOwner } from './checkOwner'
import { offerDuty } from './duty'
import type { Store } from './store'
import { line, OptionalId } from './toolInputs'

interface DutyToolsContext {
  botId: string
  store: Store
  emit: (event: HarnessEvent) => void
}

const KeyResultInput = z.object({
  text: line(200).describe('验收指标：带数字、能核对，如「每周 2 篇成稿交用户审」「平均读完率 40%」'),
  window: line(40).describe('时间窗：每周、每篇、每天，或「到 2026-12-31」'),
  source: line(80).describe('数从哪来：你自己数，或谁、什么时候、怎么给（如「用户每周一发后台截图」）'),
})

const ObjectiveInput = z.object({
  name: line(80).describe('目标：要的结果，不是动作。「公众号每周稳定更新」，不是「写稿」'),
  keyResults: z.array(KeyResultInput).min(1).max(MAX_KEY_RESULTS),
})

/** What a bot does about its duty in its chat: propose a new version on a card the user decides on, report progress. */
export function dutyTools({ botId, store, emit }: DutyToolsContext) {
  return {
    propose_duty: tool({
      description:
        '在聊天里给用户出一张职责卡：完整的职责（为什么有你、目标和验收指标、不归你管的事、要不要每周复盘）。这一步不会改：用户点了「定下来」才算，你会收到结果。改已有职责时也写完整的一份，没改的照抄。',
      inputSchema: z.object({
        purpose: line(200).describe('为什么有你：一句话'),
        objectives: z.array(ObjectiveInput).min(1).max(MAX_OBJECTIVES),
        outOfScope: z.array(line(100)).max(5).default([]).describe('不归你管的事；归别的 Bot 就写上是谁'),
        changes: z.array(line(200)).max(8).default([]).describe('改已有职责时：每条写改了什么、为什么；第一次定就不填'),
        review: z.boolean().describe('每周复盘：用户要就 true'),
        botId: OptionalId.describe('给别的 Bot 定职责才填它的 id，只有主 Bot 能填；不填就是你自己'),
      }),
      execute: async ({ purpose, objectives, outOfScope, changes, review, botId: owner = botId }) => {
        checkOwner(store, botId, owner, '给别的 Bot 定职责')
        return {
          ...offerDuty(store, owner, { purpose, objectives, outOfScope }, changes, review),
          note: '职责卡已经显示在聊天里。用一两句话请用户看一下，点「定下来」或者告诉你要改哪里；不要说已经定好了。',
        }
      },
    }),
    report_progress: tool({
      description: '更新你一条验收指标的进度：复盘时、用户报了数、或者你自己数清楚了的时候用，不用问用户。',
      inputSchema: z.object({
        objectiveId: z.string().describe('目标的 id，见「你的职责」'),
        keyResult: z.number().int().min(1).max(MAX_KEY_RESULTS).describe('第几条验收指标，从 1 数'),
        text: line(40).describe('现在的数，带上时间，如「本周 1/2」「上周 31%」'),
        ratio: Progress.shape.ratio.describe('完成了几成，0 到 1；越小越好的指标（如改动不超过三成）做到了就填 1'),
        verdict: Progress.shape.verdict.describe('met：达成；onTrack：还在时间窗里，照这个速度能达成；behind：落后'),
      }),
      execute: async ({ objectiveId, keyResult, text, ratio, verdict }) => {
        const { duty } = store.get().bots[botId]
        const objective = duty.objectives.find((candidate) => candidate.id === objectiveId)
        if (!objective?.keyResults[keyResult - 1])
          throw new Error(`没有目标 ${objectiveId} 的第 ${keyResult} 条验收指标`)
        const progress = { text, ratio, verdict, at: Date.now() }
        const objectives = duty.objectives.map((candidate) =>
          candidate.id === objectiveId
            ? {
                ...candidate,
                keyResults: candidate.keyResults.map((each, index) =>
                  index === keyResult - 1 ? { ...each, progress } : each,
                ),
              }
            : candidate,
        )
        const next = { ...duty, objectives }
        store.updateBot(botId, { duty: next })
        emit({ kind: 'duty', botId, duty: next })
        return { updated: `${objective.name} 第 ${keyResult} 条：${text}` }
      },
    }),
  }
}
