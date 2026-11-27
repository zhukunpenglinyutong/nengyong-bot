import type { Entry, HarnessEvent } from '../shared/bridge'
import { type Duty, DutyOffer, type DutyPlan, type KeyResult, type Objective } from '../shared/duty'
import { newId } from '../shared/newId'
import { strings } from '../shared/strings'
import { TIMEZONE } from '../shared/timezone'
import { patchRoutine, updateRoutines } from './routines'
import type { Store } from './store'
import type { BotBrain, EntryInput } from './types'

const REVIEW_CRON = '0 9 * * 1'

const REVIEW_PROMPT = [
  '对照你的职责做一次每周复盘：',
  '1. 逐条验收指标：用 search_history 和 read_history 查上周一到今天的聊天和任务结论，判断达成、进行中还是落后，写出现在的数，附上作证据的 ref。拿不到的数，写明要用户给什么。',
  '2. 列出这一周做过、但不服务任何目标的事（同类做了几次），和用户纠正过你的地方。',
  '3. 最后写「建议改的」：加、改、提高、去掉哪条指标或哪个目标，每条写为什么；没有就写「不用改」。',
].join('\n')

const SETTING_STEPS = [
  '职责还没和用户定下来。用户在聊别的事就照常做，聊完提一句要不要先把职责定下来；用户说先不定就不要再提，等他想定了（比如说「规划一下你的职责」）再按下面的步骤来：',
  '1. 问用户最想要你做到什么结果，写成目标：要结果，不要动作（「写稿」是做法，「公众号每周稳定更新」才是目标）。一句话里有两个结果就拆成两个目标，最多 3 个。',
  '2. 每个目标给 1–4 条验收指标的建议，请用户改数字：每条都要有数字和时间窗（每周、每篇、到某天）。',
  '3. 用户说得笼统的（「写得有意思」），换成看得见的结果（「平均读完率 40%」「用户改动不超过三成」）。',
  '4. 你拿不到的数（后台数据、别人的反馈），问清谁给、什么时候给，写进这条指标的来源。',
  '5. 问要不要每周复盘：开了每周一 9:00 对照指标总结一次。',
  '6. 用 propose_duty 出一张职责卡，用户点了「定下来」才算。一次只问一两个问题，不要一口气全问完。',
].join('\n')

/** The 你的职责 section of a bot's prompt. Its chat is also told how to settle a duty not agreed yet; its tasks are not. */
export function dutyText(bot: BotBrain, isChat: boolean): string {
  const { duty } = bot
  const purpose = duty.purpose && `为什么有你：${duty.purpose}`
  if (!duty.objectives.length)
    return [purpose, isChat ? SETTING_STEPS : '职责还没和用户定下来。'].filter(Boolean).join('\n')
  const review = bot.routines.find((routine) => routine.id === duty.reviewRoutineId)
  return [
    `第 ${duty.version} 版，用户确认过。`,
    purpose,
    ...duty.objectives.flatMap((objective) => [
      `目标 [${objective.id}] ${objective.name}`,
      ...objective.keyResults.map((keyResult, index) => `  ${index + 1}. ${keyResultLine(keyResult)}`),
    ]),
    duty.outOfScope.length ? `不归你管：${duty.outOfScope.join('；')}` : '',
    `每周复盘：${review?.isEnabled ? `开着（[${review.id}]，每周一 9:00）` : '没开'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

const VERDICT_WORDS = { met: '达成', onTrack: '进行中', behind: '落后' } as const

function keyResultLine({ text, window, source, progress }: KeyResult): string {
  const now = progress ? `现在 ${progress.text}，${VERDICT_WORDS[progress.verdict]}` : '还没报过进度'
  return `${text}（${window}；数来自：${source}）—— ${now}`
}

export const DUTY_RULES = [
  '- 职责：做事前想清楚它服务哪个目标、推哪条验收指标，交之前按指标自查。归别的 Bot 管的，start_task 派给它；不服务任何目标的，先做，告诉用户这不在职责里；同类的事多了，提议加进职责。',
  '- 改职责只用 propose_duty：它只在聊天里出一张职责卡，用户点了「定下来」才算，你会收到结果，在那之前不要说改好了。改已有职责时，changes 里逐条写改了什么、为什么，没改的照抄。用户纠正你的职责（「这不归你管」「以后这也归你」）、某条指标一直轻松达成或连着没达成时，提议改。',
  '- 验收指标有了新的数，用 report_progress 更新，不用问用户。收到「每周复盘」例行任务的结论：逐条用 report_progress 更新进度，用两三句告诉用户结论；结论里有建议改的，用 propose_duty 出卡。',
]

/** A plan as the bot writes it: its objectives get ids once offered, the ones it already had keeping theirs. */
type NewPlan = Omit<DutyPlan, 'objectives'> & { objectives: Omit<Objective, 'id'>[] }

/** What propose_duty records, and the chat shows as a card: the whole duty `plan` would make `botId`'s. */
export function offerDuty(
  store: Store,
  botId: string,
  plan: NewPlan,
  changes: string[],
  isReviewOn: boolean,
): DutyOffer {
  const current = brainOf(store, botId).duty
  const objectives = plan.objectives.map((objective) => ({
    ...objective,
    id: current.objectives.find((existing) => existing.name === objective.name)?.id ?? newId('o'),
  }))
  return { offer: newId('d'), botId, baseVersion: current.version, plan: { ...plan, objectives }, changes, isReviewOn }
}

/**
 * The user's answer to a duty card in `chatBotId`'s chat. Agreed, the card's plan becomes the next version of the duty,
 * keeping the progress of key results it words the same, and the weekly review is switched as the card was left.
 * Throws a readable reason when the card is void: answered, replaced by a newer one for the same bot, or out of date.
 */
export function answerDutyOffer(
  store: Store,
  emit: (event: HarnessEvent) => void,
  chatBotId: string,
  offerId: string,
  isAccepted: boolean,
  isReviewOn: boolean,
): EntryInput {
  const words = strings().harness.duty
  const offers = store.toolEntries(chatBotId, 'propose_duty').flatMap((entry) => {
    const offer = entry.kind === 'tool' ? DutyOffer.safeParse(entry.output).data : undefined
    return offer ? [offer] : []
  })
  const offer = offers.find((candidate) => candidate.offer === offerId)
  if (!offer) throw new Error(words.offerGone)
  if (isAnswered(store.history(chatBotId), offerId)) throw new Error(words.answered)
  if (offers.findLast((candidate) => candidate.botId === offer.botId)?.offer !== offerId)
    throw new Error(words.replaced)
  const answer = { kind: 'duty-answer', offer: offerId, botId: offer.botId, isAccepted } as const
  if (!isAccepted) return answer
  const current = brainOf(store, offer.botId).duty
  if (current.version !== offer.baseVersion) throw new Error(words.outdated)
  const duty: Duty = {
    ...withProgress(offer.plan, current),
    version: current.version + 1,
    reviewRoutineId: current.reviewRoutineId,
  }
  store.updateBot(offer.botId, { duty })
  emit({ kind: 'duty', botId: offer.botId, duty })
  setReview(store, emit, offer.botId, isReviewOn)
  return answer
}

const isAnswered = (entries: Entry[], offerId: string) =>
  entries.some((entry) => entry.kind === 'duty-answer' && entry.offer === offerId)

function withProgress(plan: DutyPlan, current: Duty): DutyPlan {
  const known = current.objectives.flatMap((objective) => objective.keyResults)
  return {
    ...plan,
    objectives: plan.objectives.map((objective) => ({
      ...objective,
      keyResults: objective.keyResults.map((keyResult) => {
        const progress = known.find((existing) => existing.text === keyResult.text)?.progress
        return progress ? { ...keyResult, progress } : keyResult
      }),
    })),
  }
}

/** Turns a bot's weekly review on or off: a routine, made the first time it is turned on and paused after. */
export function setReview(store: Store, emit: (event: HarnessEvent) => void, botId: string, isOn: boolean) {
  const bot = brainOf(store, botId)
  const existing = bot.routines.find((routine) => routine.id === bot.duty.reviewRoutineId)
  if (existing) {
    if (existing.isEnabled !== isOn) patchRoutine(store, emit, botId, existing.id, { isEnabled: isOn })
    return
  }
  if (!isOn) return
  const routine = {
    id: newId('r'),
    name: strings().harness.duty.reviewName,
    prompt: REVIEW_PROMPT,
    cron: REVIEW_CRON,
    timezone: TIMEZONE,
    isEnabled: true,
  }
  updateRoutines(store, emit, botId, (routines) => [...routines, routine])
  const duty = { ...brainOf(store, botId).duty, reviewRoutineId: routine.id }
  store.updateBot(botId, { duty })
  emit({ kind: 'duty', botId, duty })
}

/** A new bot's first message: it asks what result the user wants, to settle its duty before anything else. */
export function welcome(store: Store, botId: string): Entry {
  const { name, duty } = brainOf(store, botId)
  return store.append(botId, { kind: 'bot', text: strings().harness.duty.greeting(name, duty.purpose) })
}

function brainOf(store: Store, botId: string): BotBrain {
  const bot = store.get().bots[botId]
  if (!bot) throw new Error(strings().harness.unknownBot(botId))
  return bot
}
