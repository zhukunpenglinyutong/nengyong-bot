import { useState } from 'react'
import { type ModelServicesView, SERVICES } from '../../shared/modelServices'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { Icon } from '../ui/Icon'
import { TextInput } from '../ui/TextInput'
import { StepFooter } from './StepFooter'
import { StepHeading } from './StepHeading'
import { strings } from '../../shared/strings'

const words = strings().onboarding.model

type Check = { kind: 'idle' } | { kind: 'testing' } | { kind: 'connected' } | { kind: 'failed'; message: string }

interface Props {
  services: ModelServicesView | null // null while it is being read
  onConnect: (apiKey: string) => Promise<void>
  onBack: () => void
  onNext: () => void
}

/** The one thing bots cannot do without: a model. Connecting DeepSeek tests the key first and saves it only if it works. */
export function ModelStep({ services, onConnect, onBack, onNext }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [check, setCheck] = useState<Check>({ kind: 'idle' })
  const saved = services?.accounts.find((account) => account.service === 'deepseek')
  const isTesting = check.kind === 'testing'
  const canConnect = Boolean(services) && apiKey.trim() !== '' && !isTesting
  const canGoOn = check.kind === 'connected' || (Boolean(services?.chat) && apiKey.trim() === '')

  const connect = async () => {
    if (!canConnect) return
    setCheck({ kind: 'testing' })
    try {
      await onConnect(apiKey.trim())
      setCheck({ kind: 'connected' })
    } catch (error) {
      const reason = ipcErrorMessage(error)
      setCheck({ kind: 'failed', message: words.connectFailed(reason) })
    }
  }

  return (
    <>
      <StepHeading top={70} title={words.title} sub={words.lede} />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void connect()
        }}
        className="absolute top-[190px] left-1/2 -ml-[210px] flex w-[420px] flex-col"
      >
        <label htmlFor="onboarding-key" className="mb-1.5 text-sm font-semibold">
          API Key
        </label>
        <TextInput
          id="onboarding-key"
          type="password"
          autoComplete="off"
          autoFocus
          placeholder={saved?.keyHint ? words.savedKey(saved.keyHint) : 'sk-…'}
          value={apiKey}
          aria-invalid={check.kind === 'failed'}
          disabled={isTesting || check.kind === 'connected'}
          onChange={(event) => {
            setApiKey(event.target.value)
            if (check.kind === 'failed') setCheck({ kind: 'idle' })
          }}
          className="h-11 rounded-lg px-3.5 font-mono"
        />
        <p className="mt-2 text-xs text-muted">
          {words.keyNote}
          <a href={SERVICES.deepseek.keyPage ?? undefined} target="_blank" rel="noreferrer" className="text-accent">
            {words.keyLink}
          </a>
        </p>
        <p
          role="status"
          data-check={check.kind}
          className="mt-4 flex min-h-[22px] items-center gap-2 text-sm data-[check=connected]:font-semibold data-[check=failed]:text-danger"
        >
          {statusLine(check)}
        </p>
      </form>
      <StepFooter
        onBack={isTesting ? undefined : onBack}
        forwardLabel={canGoOn ? strings().onboarding.next : isTesting ? words.connecting : words.connect}
        onForward={canGoOn ? onNext : () => void connect()}
        isForwardDisabled={!canGoOn && !canConnect}
        tertiaryLabel={canGoOn || isTesting ? undefined : words.later}
        onTertiary={onNext}
      />
    </>
  )
}

function statusLine(check: Check) {
  switch (check.kind) {
    case 'idle':
      return null
    case 'testing':
      return <span className="shimmer-text">{words.connecting}</span>
    case 'connected':
      return (
        <>
          <span className="grid size-5 place-items-center rounded-full bg-accent text-white">
            <Icon name="check" size={13} />
          </span>
          {words.connected}
        </>
      )
    case 'failed':
      return check.message
    default:
      return check satisfies never
  }
}
