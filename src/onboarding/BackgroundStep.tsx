import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { Bot } from '../../shared/bot'
import type { TaskView } from '../../shared/bridge'
import { BotAvatar } from '../bot/BotAvatar'
import { IdleRow, TaskEndedRow, TasksRow } from '../island/IslandRows'
import { Island } from '../island/Island'
import { LevelUpCard } from '../island/LevelUpCard'
import { pointsToNext, type Trust } from '../../shared/trust'
import { Icon } from '../ui/Icon'
import { DEMO_TEAM } from './identities'
import { StepFooter } from './StepFooter'
import { StepHeading } from './StepHeading'
import { strings } from '../../shared/strings'

const words = strings().onboarding.background

export const BACKGROUND_BEATS = [500, 1100, 1200, 2600, 2200, 2600]
const ASK = words.ask
const TASK_TITLE = words.taskTitle
const TASK: TaskView = {
  id: 'demo-task',
  title: TASK_TITLE,
  status: 'running',
  statusText: '',
  createdAt: 0,
  endedAt: null,
  requestedBy: null,
  isRoutine: false,
}
const trustAt = (level: number, points: number): Trust => ({
  level,
  points,
  needed: pointsToNext(level),
  messages: 1,
  flowsSaved: 0,
  flowRuns: 0,
})
const ENTER = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { type: 'spring', bounce: 0.2, visualDuration: 0.4 },
} as const
const [ANALYST] = DEMO_TEAM

interface Props {
  beat: number
  boss: Bot
  onReplay: () => void
  onBack: () => void
  onNext: () => void
}

/** A chat in miniature: the boss hands a weekly job to the analyst, the island shows it running, done and paying off. */
export function BackgroundStep({ beat, boss, onReplay, onBack, onNext }: Props) {
  const island = islandAt(beat, boss)
  return (
    <>
      <StepHeading top={22} title={words.title} sub={words.lede} />
      <div
        inert
        className="absolute top-[122px] left-1/2 -ml-[230px] h-[340px] w-[460px] overflow-hidden rounded-xl bg-canvas text-sm shadow-pop"
      >
        <div className="absolute inset-x-0 top-2.5 z-[2] flex justify-center">
          <Island view={island.view}>{island.content}</Island>
        </div>
        <div className="absolute inset-x-0 top-0 z-[1] h-16 bg-gradient-to-b from-canvas from-40% to-canvas/0" />
        <div className="absolute inset-0 flex flex-col justify-end gap-2.5 px-4 pt-16 pb-4">
          <AnimatePresence initial={false}>
            {beat >= 1 && (
              <motion.p
                key="ask"
                layout
                {...ENTER}
                className="max-w-[80%] self-end rounded-2xl bg-ink px-3 py-1.5 text-canvas"
              >
                {ASK}
              </motion.p>
            )}
            {beat >= 2 && (
              <BotLine key="reply" boss={boss}>
                {words.handOffBefore}
                <Mention bot={ANALYST} />
                {words.handOffAfter}
                <span className="mt-1.5 flex w-fit items-center gap-1 rounded-full bg-surface px-2 text-xs text-soft">
                  <Icon name="clock" size={13} />
                  {words.routineTag}
                </span>
              </BotLine>
            )}
            {beat >= 4 && (
              <BotLine key="result" boss={boss}>
                <Mention bot={ANALYST} />
                {words.result}
              </BotLine>
            )}
          </AnimatePresence>
        </div>
      </div>
      {beat >= BACKGROUND_BEATS.length && (
        <button
          type="button"
          onClick={onReplay}
          className="absolute top-[476px] left-1/2 flex h-7 -translate-x-1/2 items-center gap-1 rounded-full px-3 text-sm text-muted"
        >
          <Icon name="refresh" size={14} />
          {words.replay}
        </button>
      )}
      <StepFooter forwardLabel={strings().onboarding.next} onForward={onNext} onBack={onBack} />
    </>
  )
}

function islandAt(beat: number, boss: Bot): { view: string; content: ReactNode } {
  const noop = () => undefined
  switch (beat) {
    case 3:
      return { view: 'tasks', content: <TasksRow bot={boss} trust={trustAt(1, 2)} tasks={[TASK]} onClick={noop} /> }
    case 4:
      return { view: 'done', content: <TaskEndedRow title={TASK_TITLE} isDone points={0} onClick={noop} /> }
    case 5:
      return { view: 'level-up', content: <LevelUpCard bot={boss} from={1} level={2} /> }
    default: {
      const trust = beat >= 6 ? trustAt(2, 2) : trustAt(1, beat >= 1 ? 2 : 0)
      return { view: `idle-${trust.level}`, content: <IdleRow bot={boss} trust={trust} onClick={noop} /> }
    }
  }
}

function BotLine({ boss, children }: { boss: Bot; children: ReactNode }) {
  return (
    <motion.div layout {...ENTER} className="flex max-w-[92%] items-start gap-2 self-start">
      <BotAvatar bot={boss} size={20} />
      <p className="rounded-2xl bg-bubble px-3 py-1.5 shadow-ring">{children}</p>
    </motion.div>
  )
}

function Mention({ bot }: { bot: Bot }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-[-3px] font-semibold">
      <BotAvatar bot={bot} size={16} animated={false} />
      {bot.name}
    </span>
  )
}
