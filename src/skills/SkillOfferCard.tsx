import { useState } from 'react'
import type { Bot } from '../../shared/bot'
import type { OfferedSkill, SkillOffer, SkillSource } from '../../shared/skill'
import { strings } from '../../shared/strings'
import { BotAvatar } from '../bot/BotAvatar'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { Icon } from '../ui/Icon'

interface Props {
  offer: SkillOffer
  installed: string[] | null // the answer the chat has recorded: the skills installed, none when turned down; null: none yet
  forBot?: Bot // the bot it goes to, when that is not the one whose chat this is
  onAnswer?: (names: string[]) => Promise<void> // absent where installing is not decided (a device): the card says where it is
  onViewFiles: (name: string) => void
}

const SCRIPTS_SHOWN = 5 // the rest are one click away, in the files dialog

type Answer = { kind: 'idle' } | { kind: 'sending'; names: string[] } | { kind: 'sent'; names: string[] }

/**
 * The skills a bot read and offers to install: what each is, where from, the scripts it would run. Several (a
 * collection) come as a list to tick, all ticked at first. Only the user's click installs; once answered, the card
 * folds into one line.
 */
export function SkillOfferCard({ offer, installed, forBot, onAnswer, onViewFiles }: Props) {
  const words = strings().skills.offer
  const [answer, setAnswer] = useState<Answer>({ kind: 'idle' })
  const [chosen, setChosen] = useState(() => offer.skills.map((skill) => skill.name))
  const [error, setError] = useState<string | null>(null)
  // the answer reaches the chat with the bot's next turn, which may wait for the running one: until then the click says it
  const answered = installed ?? (answer.kind === 'sent' ? answer.names : null)
  if (answered !== null) return <AnsweredLine offer={offer} installed={answered} forBot={forBot} />
  const send = async (names: string[]) => {
    if (!onAnswer) return
    setAnswer({ kind: 'sending', names })
    setError(null)
    try {
      await onAnswer(names)
      setAnswer({ kind: 'sent', names })
    } catch (failure) {
      setAnswer({ kind: 'idle' })
      setError(words.failed(ipcErrorMessage(failure)))
    }
  }
  const [single] = offer.skills.length === 1 ? offer.skills : []
  const isAllChosen = chosen.length === offer.skills.length
  const isSending = answer.kind === 'sending'
  return (
    <div className="w-[380px] max-w-full overflow-hidden rounded-xl bg-surface shadow-ring">
      {forBot && (
        <p className="flex items-center gap-1.5 bg-bubble px-3.5 py-2 text-sm text-soft">
          <BotAvatar bot={forBot} size={16} />
          {words.for(forBot.name)}
        </p>
      )}
      <div className="p-3.5">
        {single ? (
          <OneSkill skill={single} />
        ) : (
          <SkillChecklist skills={offer.skills} chosen={chosen} onChange={setChosen} onViewFiles={onViewFiles} />
        )}
        {offer.skipped.length > 0 && <SkippedList skipped={offer.skipped} />}
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-3.5 flex items-center gap-2">
          {single ? (
            <button
              type="button"
              onClick={() => onViewFiles(single.name)}
              className="-ml-1 flex h-8 items-center gap-1.5 rounded-md px-1 text-sm text-soft"
            >
              <Icon name="file" size={15} />
              {words.viewFiles}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setChosen(isAllChosen ? [] : offer.skills.map((skill) => skill.name))}
              className="-ml-1 h-8 rounded-md px-1 text-sm text-soft"
            >
              {isAllChosen ? words.selectNone : words.selectAll}
            </button>
          )}
          <span className="flex-1" />
          {onAnswer ? (
            <>
              <button
                type="button"
                disabled={isSending}
                onClick={() => send([])}
                className="h-8 rounded-md border border-line bg-surface px-3 text-sm disabled:opacity-40"
              >
                {words.decline}
              </button>
              <button
                type="button"
                disabled={isSending || !chosen.length}
                onClick={() => send(chosen)}
                className="h-8 rounded-md bg-ink px-3.5 text-sm text-canvas disabled:opacity-40"
              >
                {answer.kind === 'sending' && answer.names.length
                  ? words.installing
                  : single
                    ? words.install
                    : words.installCount(chosen.length)}
              </button>
            </>
          ) : (
            <span className="text-sm text-muted">{words.onComputer}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function AnsweredLine({ offer, installed, forBot }: { offer: SkillOffer; installed: string[]; forBot?: Bot }) {
  const words = strings().skills.offer
  const names = strings().skills.names
  const text = !installed.length
    ? words.declined(names(offer.skills.map((skill) => skill.name)))
    : forBot
      ? words.installedFor(forBot.name, names(installed))
      : words.installed(names(installed))
  return (
    <p className="flex w-fit max-w-full items-center gap-2 rounded-xl bg-surface px-3.5 py-2.5 text-sm text-muted shadow-ring">
      <Icon name={installed.length ? 'check' : 'close'} size={15} />
      {text}
    </p>
  )
}

/** The one skill a card offers, in full: its scripts listed, since installing it means agreeing to them. */
function OneSkill({ skill }: { skill: OfferedSkill }) {
  const words = strings().skills.offer
  const facts = [sourceName(skill.source), skill.version && `v${skill.version}`, words.files(skill.fileCount)]
    .filter(Boolean)
    .join(' · ')
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-bubble text-soft">
          <Icon name="skill" size={17} />
        </span>
        <span className="min-w-0 flex-1 leading-snug">
          <span className="flex items-center gap-1.5 text-md">
            {skill.name}
            <ScriptsBadge count={skill.scripts.length} />
          </span>
          <span className="block truncate text-xs text-muted">{facts}</span>
        </span>
      </div>
      <p className="mt-2 line-clamp-3 text-sm leading-normal text-soft">{skill.description}</p>
      {skill.scripts.length > 0 && (
        <ul className="mt-2.5 rounded-md bg-canvas px-2.5 py-1.5 font-mono text-xs leading-relaxed text-soft">
          {skill.scripts.slice(0, SCRIPTS_SHOWN).map((script) => (
            <li key={script} className="flex items-center gap-1.5 truncate">
              <Icon name="terminal" size={12} />
              {script}
            </li>
          ))}
          {skill.scripts.length > SCRIPTS_SHOWN && (
            <li className="font-sans">{words.moreScripts(skill.scripts.length - SCRIPTS_SHOWN)}</li>
          )}
        </ul>
      )}
      {skill.replaces !== null && <p className="mt-2 text-xs text-muted">{words.replaces(skill.replaces)}</p>}
    </>
  )
}

interface ChecklistProps {
  skills: OfferedSkill[]
  chosen: string[]
  onChange: (chosen: string[]) => void
  onViewFiles: (name: string) => void
}

/** The skills of a collection, each to tick or not, with its files a click away. */
function SkillChecklist({ skills, chosen, onChange, onViewFiles }: ChecklistProps) {
  const words = strings().skills.offer
  const [first] = skills
  const toggle = (name: string, isChosen: boolean) =>
    onChange(isChosen ? [...chosen, name] : chosen.filter((each) => each !== name))
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-bubble text-soft">
          <Icon name="skill" size={17} />
        </span>
        <span className="min-w-0 flex-1 leading-snug">
          <span className="block text-md">{words.found(skills.length)}</span>
          {first && <span className="block truncate text-xs text-muted">{sourceName(first.source)}</span>}
        </span>
      </div>
      <ul className="mt-2.5 max-h-[320px] divide-y divide-line overflow-y-auto rounded-md bg-canvas px-2.5">
        {skills.map((skill) => (
          <li key={skill.name} className="flex items-start gap-1 py-2">
            <label className="flex min-w-0 flex-1 items-start gap-2.5">
              <input
                type="checkbox"
                checked={chosen.includes(skill.name)}
                onChange={(event) => toggle(skill.name, event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-ink"
              />
              <span className="min-w-0 flex-1 leading-snug">
                <span className="flex items-center gap-1.5 text-sm">
                  {skill.name}
                  <ScriptsBadge count={skill.scripts.length} />
                </span>
                <span className="line-clamp-2 text-xs text-muted">{skill.description}</span>
                {skill.replaces !== null && (
                  <span className="block text-xs text-muted">{words.replaces(skill.replaces)}</span>
                )}
              </span>
            </label>
            <button
              type="button"
              aria-label={words.viewFilesOf(skill.name)}
              title={words.viewFilesOf(skill.name)}
              onClick={() => onViewFiles(skill.name)}
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted"
            >
              <Icon name="file" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function SkippedList({ skipped }: { skipped: SkillOffer['skipped'] }) {
  const words = strings().skills.offer
  return (
    <div className="mt-2.5 text-xs text-muted">
      <p className="text-soft">{words.skipped(skipped.length)}</p>
      <ul>
        {skipped.map((skill) => (
          <li key={`${skill.folder}:${skill.reason}`}>{words.skippedItem(skill.folder, skill.reason)}</li>
        ))}
      </ul>
    </div>
  )
}

function ScriptsBadge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className="rounded-sm bg-warning/15 px-1.5 text-xs leading-5 text-warning">
      {strings().skills.offer.scripts(count)}
    </span>
  )
}

const sourceName = (source: SkillSource) => (source.kind === 'github' ? source.repo : strings().skills.offer.fromFolder)
