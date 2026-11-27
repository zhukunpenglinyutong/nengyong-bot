import { type ComponentProps, useState } from 'react'
import { DevicesSettings } from '../devices/DevicesSettings'
import { Dialog } from '../ui/Dialog'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { DataSettings } from './DataSettings'
import { DismissedSettings } from './DismissedSettings'
import { GeneralSettings } from './GeneralSettings'
import { LimitsSettings } from './LimitsSettings'
import { ModelSettings } from './ModelSettings'
import { NengyongKeySettings } from './NengyongKeySettings'
import appIcon from './appIcon.webp'
import { ReleaseNotes } from './ReleaseNotes'
import { RELEASES } from './releases'
import { ToolsSettings } from './ToolsSettings'
import type { UpdateProps } from './UpdateCheckRow'
import { UsageSettings } from './UsageSettings'
import { strings } from '../../shared/strings'

export type SettingsPage =
  | 'general'
  | 'model'
  | 'tools'
  | 'devices'
  | 'data'
  | 'dismissed'
  | 'usage'
  | 'nengyongKey'
  | 'limits'
  | 'releases'

const PAGES: { page: Exclude<SettingsPage, 'releases'>; label: string; icon: IconName; isDebugOnly?: boolean }[] = [
  { page: 'general', label: strings().settings.dialog.pages.general, icon: 'gear' },
  { page: 'nengyongKey', label: strings().settings.dialog.pages.nengyongKey, icon: 'key' },
  { page: 'model', label: strings().settings.dialog.pages.model, icon: 'cube' },
  { page: 'tools', label: strings().settings.dialog.pages.tools, icon: 'plug' },
  { page: 'devices', label: strings().settings.dialog.pages.devices, icon: 'phone' },
  { page: 'data', label: strings().settings.dialog.pages.data, icon: 'folder' },
  { page: 'dismissed', label: strings().settings.dialog.pages.dismissed, icon: 'trash' },
  { page: 'usage', label: strings().settings.dialog.pages.usage, icon: 'chart' },
  { page: 'limits', label: strings().settings.dialog.pages.limits, icon: 'sliders', isDebugOnly: true },
]

type Props = ComponentProps<typeof ModelSettings> &
  ComponentProps<typeof DataSettings> &
  ComponentProps<typeof ToolsSettings> &
  ComponentProps<typeof GeneralSettings> &
  ComponentProps<typeof LimitsSettings> &
  ComponentProps<typeof UsageSettings> &
  ComponentProps<typeof DismissedSettings> &
  Pick<ComponentProps<typeof DevicesSettings>, 'bridge'> &
  UpdateProps & {
    initialPage: SettingsPage
    devices: ComponentProps<typeof DevicesSettings>['live']
    onClose: () => void
  }

/** Settings window: pages on the left, like macOS settings. Opens on the page it is asked for. */
export function SettingsDialog({
  initialPage,
  onClose,
  bridge,
  bots,
  preferences,
  onPreferencesChange,
  limits,
  onLimitsChange,
  services,
  onServicesChange,
  devices,
  dismissed,
  onRestore,
  ...updateProps
}: Props) {
  const [page, setPage] = useState(initialPage)
  const pages = PAGES.filter((entry) => !entry.isDebugOnly || preferences.isDebug)
  const hasUpdate = updateProps.update.kind === 'available' || updateProps.update.kind === 'installFailed'

  return (
    <Dialog
      labelledBy="settings-title"
      onClose={onClose}
      className="h-[min(640px,88vh)] w-[min(880px,92vw)] overflow-hidden rounded-2xl bg-canvas"
    >
      <div className="relative flex h-full">
        <nav className="flex w-[220px] shrink-0 flex-col gap-0.5 border-r border-line px-3 py-4">
          {pages.map((entry) => (
            <button
              key={entry.page}
              type="button"
              aria-current={entry.page === page ? 'page' : undefined}
              onClick={() => setPage(entry.page)}
              className="flex h-10 items-center gap-3 rounded-md px-3 text-md transition-colors aria-[current=page]:bg-hover"
            >
              <Icon name={entry.icon} />
              {entry.label}
              {entry.isDebugOnly && (
                <span
                  aria-hidden
                  className="ml-auto rounded-sm bg-warning/15 px-1.5 text-xs leading-5 font-semibold text-warning"
                >
                  {strings().settings.dialog.debugTag}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            aria-current={page === 'releases' ? 'page' : undefined}
            onClick={() => setPage('releases')}
            className="mt-auto flex h-13 items-center gap-2.5 rounded-md px-2.5 text-left transition-colors aria-[current=page]:bg-hover"
          >
            <span className="relative shrink-0">
              <img src={appIcon} alt="" className="size-8" />
              {hasUpdate && (
                <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-accent ring-2 ring-canvas" />
              )}
            </span>
            <span className="flex flex-col leading-snug">
              <span className="text-sm">Nengyong Bot</span>{' '}
              <span data-has-update={hasUpdate || undefined} className="text-xs text-muted data-has-update:text-accent">
                {RELEASES[0].version} ·{' '}
                {hasUpdate ? strings().settings.dialog.hasUpdate : strings().settings.dialog.updates}
              </span>
            </span>
          </button>
        </nav>
        {page === 'general' && (
          <GeneralSettings bridge={bridge} preferences={preferences} onPreferencesChange={onPreferencesChange} />
        )}
        {page === 'model' && <ModelSettings bridge={bridge} services={services} onServicesChange={onServicesChange} />}
        {page === 'tools' && <ToolsSettings bridge={bridge} />}
        {page === 'devices' && <DevicesSettings bridge={bridge} live={devices} />}
        {page === 'data' && <DataSettings bridge={bridge} />}
        {page === 'dismissed' && <DismissedSettings dismissed={dismissed} onRestore={onRestore} />}
        {page === 'usage' && <UsageSettings bridge={bridge} bots={bots} />}
        {page === 'nengyongKey' && <NengyongKeySettings />}
        {page === 'limits' && <LimitsSettings limits={limits} onLimitsChange={onLimitsChange} />}
        {page === 'releases' && <ReleaseNotes {...updateProps} />}
        <IconButton
          icon="close"
          label={strings().settings.dialog.close}
          onClick={onClose}
          className="absolute top-3 right-3"
        />
      </div>
    </Dialog>
  )
}
