import { useState } from 'react'
import { type Service, SERVICES, type ServiceId } from '../../shared/modelServices'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { TextInput } from '../ui/TextInput'
import { useFlash } from '../ui/useFlash'
import appIcon from './appIcon.webp'
import { ServiceLogo } from './ModelLogo'
import { strings } from '../../shared/strings'

interface Props {
  connected: ServiceId[] // left out: each service has one account, except the custom endpoints
  onPick: (service: Service) => void
  onClose: () => void
}

/** The first step of adding an account: every service it can be on, with a search. */
export function ServiceList({ connected, onPick, onClose }: Props) {
  const words = strings().models.services
  const [query, setQuery] = useState('')
  const [notice, flash] = useFlash<string>()
  const needle = query.trim().toLowerCase()
  const nengyongKeyName = strings().settings.dialog.pages.nengyongKey
  const isNengyongKeyShown = `${nengyongKeyName} ${words.nengyongKeyHint}`.toLowerCase().includes(needle)
  const services = Object.values(SERVICES).filter(
    (service) =>
      (service.kind === 'custom' || !connected.includes(service.id)) &&
      `${service.name} ${service.id}`.toLowerCase().includes(needle),
  )

  return (
    <div className="flex max-h-[min(560px,80vh)] flex-col">
      <header className="flex items-center gap-2.5 pt-4 pr-3 pl-5">
        <h2 id="account-title" className="flex-1 text-lg font-semibold">
          {words.addAccount}
        </h2>
        <IconButton icon="close" label={words.close} onClick={onClose} />
      </header>
      <div className="px-5 pt-2">
        <TextInput
          type="search"
          aria-label={words.search}
          placeholder={words.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 w-full rounded-md px-3"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-3">
        {isNengyongKeyShown && (
          <li>
            <button
              type="button"
              onClick={() => flash(strings().settings.nengyongKey.comingSoon)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left"
            >
              <img src={appIcon} alt="" className="size-7" />
              <span className="min-w-0 flex-1">
                <span className="block text-md">{nengyongKeyName}</span>
                <span className="block truncate text-xs text-muted">{notice ?? words.nengyongKeyHint}</span>
              </span>
            </button>
          </li>
        )}
        {services.map((service) => (
          <li key={service.id}>
            <button
              type="button"
              onClick={() => onPick(service)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left"
            >
              <ServiceLogo service={service.id} name={service.name} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block text-md">{service.name}</span>
                <span className="block truncate text-xs text-muted">{hintOf(service)}</span>
              </span>
              <span className="text-muted">
                <Icon name="chevron" size={16} />
              </span>
            </button>
          </li>
        ))}
        {services.length === 0 && !isNengyongKeyShown && (
          <li className="px-2 py-6 text-center text-sm text-muted">{words.noMatch(query, SERVICES.custom.name)}</li>
        )}
      </ul>
    </div>
  )
}

function hintOf(service: Service): string {
  switch (service.kind) {
    case 'key':
      return new URL(service.baseURL).host
    case 'local':
      return strings().models.services.localHint
    case 'custom':
      return strings().models.services.customHint
    default:
      return service.kind satisfies never
  }
}
