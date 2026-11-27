import { useState } from 'react'
import type { NengyongBotBridge } from '../../shared/bridge'
import { currentLanguage, type Language, LANGUAGES } from '../../shared/language'
import { strings } from '../../shared/strings'
import { Switch } from '../ui/Switch'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { ACCENTS, type Preferences, THEMES } from '../preferences'
import { SettingsPage, SettingsRow, SettingsSection, SettingsSelect } from './SettingsSection'

interface Props {
  bridge: Pick<NengyongBotBridge, 'setLanguage'>
  preferences: Preferences
  onPreferencesChange: (preferences: Preferences) => void
}

/** Look and feel. Every change applies at once; there is nothing to save. */
export function GeneralSettings({ bridge, preferences, onPreferencesChange }: Props) {
  const words = strings().settings.general
  const [languageError, setLanguageError] = useState<string | null>(null)
  const change = (patch: Partial<Preferences>) => onPreferencesChange({ ...preferences, ...patch })
  // the text is made as the app loads, so it reloads to show the new language
  const changeLanguage = (language: Language) =>
    bridge.setLanguage(language).then(
      () => location.reload(),
      (error) => setLanguageError(ipcErrorMessage(error)),
    )

  return (
    <SettingsPage title={words.title}>
      <SettingsSection title={words.appearance}>
        <SettingsRow id="theme" label={words.theme}>
          <SettingsSelect
            id="theme"
            value={preferences.theme}
            options={THEMES}
            onChange={(theme) => change({ theme })}
          />
        </SettingsRow>
        <SettingsRow id="accent" label={words.accent} hint={words.accentHint}>
          <SettingsSelect
            id="accent"
            value={preferences.accent}
            options={ACCENTS}
            onChange={(accent) => change({ accent })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={words.chat}>
        <SettingsRow id="send-key" label={words.sendKey} hint={words.sendKeyHint}>
          <Switch
            id="send-key"
            isOn={preferences.sendKey === 'mod-enter'}
            onChange={(isOn) => change({ sendKey: isOn ? 'mod-enter' : 'enter' })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={words.region}>
        <SettingsRow
          id="language"
          label={words.language}
          hint={languageError && <span className="text-danger">{languageError}</span>}
        >
          <SettingsSelect id="language" value={currentLanguage()} options={LANGUAGES} onChange={changeLanguage} />
        </SettingsRow>
        <SettingsRow label={words.timezone} hint={words.timezoneHint}>
          <span className="shrink-0 text-sm text-soft">{words.beijingTime}</span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={words.developer}>
        <SettingsRow id="debug" label={words.debug} hint={words.debugHint}>
          <Switch id="debug" isOn={preferences.isDebug} onChange={(isDebug) => change({ isDebug })} />
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  )
}
