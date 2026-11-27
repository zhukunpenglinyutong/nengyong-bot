import { type FocusEvent, useState } from 'react'
import { DEFAULT_LIMITS, Limits } from '../../shared/limits'
import { type Strings, strings } from '../../shared/strings'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { useFlash } from '../ui/useFlash'
import { SettingsButton, SettingsRow, SettingsSection } from './SettingsSection'

interface Props {
  limits: Limits
  onLimitsChange: (limits: Limits) => Promise<void>
}

type Group = keyof Strings['settings']['limits']['groups']

const GROUPS: { id: Group; keys: (keyof Limits)[] }[] = [
  { id: 'chat', keys: ['chatSteps', 'modelSilenceSeconds', 'recentEntries'] },
  {
    id: 'tasks',
    keys: [
      'taskSteps',
      'runningTasks',
      'taskTimeoutMinutes',
      'commandTimeoutMinutes',
      'taskResultChars',
      'endedTasksShown',
    ],
  },
  {
    id: 'reading',
    keys: ['readWindowChars', 'searchPreviewChars', 'fileMegabytes', 'webMegabytes', 'webTimeoutSeconds'],
  },
  { id: 'memory', keys: ['maxFacts', 'maxRoutines', 'maxFlows'] },
  { id: 'attachments', keys: ['attachmentsPerMessage', 'attachmentMegabytes', 'mcpConnectSeconds'] },
]

/** 精细化配置, shown in debug mode: the limits of a bot's work. A value is saved when its field is left. */
export function LimitsSettings({ limits, onLimitsChange }: Props) {
  const words = strings().settings.limits
  const [error, setError] = useState('')
  const [restoredTimes, setRestoredTimes] = useState(0)
  const [isSaved, flashSaved] = useFlash<true>()
  const save = (next: Limits) =>
    onLimitsChange(next).then(
      () => {
        setError('')
        flashSaved(true)
      },
      (failure) => setError(ipcErrorMessage(failure)),
    )
  const isDefault = GROUPS.every((group) => group.keys.every((key) => limits[key] === DEFAULT_LIMITS[key]))

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-10 pt-9 pb-8">
        <h2 id="settings-title" className="text-xl font-semibold tracking-tight">
          {words.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{words.intro}</p>
        {GROUPS.map((group) => (
          <SettingsSection key={group.id} title={words.groups[group.id]}>
            {group.keys.map((key) => (
              <SettingsRow key={key} id={key} label={words.fields[key].label} hint={hintOf(key)}>
                <LimitInput
                  key={`${restoredTimes}:${limits[key]}`}
                  fieldKey={key}
                  value={limits[key]}
                  onChange={(value) => save({ ...limits, [key]: value })}
                />
              </SettingsRow>
            ))}
          </SettingsSection>
        ))}
      </div>

      <footer className="flex items-center gap-2 border-t border-line px-10 py-3.5">
        <p role="alert" className="truncate text-sm text-danger">
          {error}
        </p>
        <p role="status" className="mr-auto text-sm text-muted">
          {isSaved && words.saved}
        </p>
        <SettingsButton
          onClick={() => {
            setRestoredTimes((times) => times + 1)
            save(DEFAULT_LIMITS)
          }}
          disabled={isDefault}
        >
          {words.restoreDefaults}
        </SettingsButton>
      </footer>
    </div>
  )
}

function hintOf(key: keyof Limits) {
  const words = strings().settings.limits
  const { minValue, maxValue } = Limits.shape[key]
  return (
    <>
      {words.fields[key].hint}
      {words.hintEnd}
      <span className="whitespace-nowrap">{words.range(DEFAULT_LIMITS[key], minValue, maxValue)}</span>
    </>
  )
}

interface InputProps {
  fieldKey: keyof Limits
  value: number
  onChange: (value: number) => void
}

/** Edited freely, checked when left: a value out of range is marked and not saved. */
function LimitInput({ fieldKey, value, onChange }: InputProps) {
  const schema = Limits.shape[fieldKey]
  const [isInvalid, setIsInvalid] = useState(false)

  const commit = (event: FocusEvent<HTMLInputElement>) => {
    const parsed = schema.safeParse(event.currentTarget.valueAsNumber)
    setIsInvalid(!parsed.success)
    if (parsed.success && parsed.data !== value) onChange(parsed.data)
  }

  return (
    <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
      <input
        id={fieldKey}
        type="number"
        min={schema.minValue ?? undefined}
        max={schema.maxValue ?? undefined}
        step={1}
        defaultValue={value}
        aria-invalid={isInvalid}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur()
        }}
        className="h-8 w-24 rounded-md border border-line bg-surface px-2.5 text-right text-sm text-ink tabular-nums outline-none transition-[border-color,box-shadow] duration-150 focus:border-ink/20 focus:ring-3 focus:ring-ink/5 aria-invalid:border-danger"
      />
      <span className="w-10">{strings().settings.limits.fields[fieldKey].unit}</span>
    </span>
  )
}
