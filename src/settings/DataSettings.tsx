import { Suspense, use, useState } from 'react'
import type { NengyongBotBridge } from '../../shared/bridge'
import { ipcErrorMessage, type Loaded, settle } from '../ipcErrorMessage'
import { Button } from '../ui/Button'
import { SettingsPage, SettingsRow, SettingsSection } from './SettingsSection'
import { strings } from '../../shared/strings'

interface Props {
  bridge: Pick<NengyongBotBridge, 'getDataDir' | 'openDataDir' | 'moveDataDir' | 'exportData' | 'importData'>
}

type Status = { kind: 'idle' | 'busy' } | { kind: 'done' | 'error'; message: string }

/** Where the data lives, and exporting or importing it. The folders are picked in native dialogs. */
export function DataSettings({ bridge }: Props) {
  const words = strings().settings.data
  const [dataDir] = useState(() => settle(bridge.getDataDir()))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  // importing or moving restarts the app when it goes through, so only a cancel or a failure comes back here
  const run = async (action: () => Promise<unknown>) => {
    setStatus({ kind: 'busy' })
    try {
      const exported = await action()
      setStatus(typeof exported === 'string' ? { kind: 'done', message: words.exported(exported) } : { kind: 'idle' })
    } catch (error) {
      setStatus({ kind: 'error', message: ipcErrorMessage(error) })
    }
  }
  const busy = status.kind === 'busy'

  return (
    <SettingsPage title={words.title} intro={words.intro}>
      <SettingsSection title={words.location}>
        <SettingsRow
          label={words.dataDir}
          hint={
            <Suspense>
              <DataDir loading={dataDir} />
            </Suspense>
          }
        >
          <div className="flex shrink-0 gap-2">
            <Button onClick={() => run(bridge.openDataDir)} disabled={busy}>
              {words.open}
            </Button>
            <Button onClick={() => run(bridge.moveDataDir)} disabled={busy}>
              {words.change}
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={words.backup}>
        <SettingsRow label={words.export} hint={words.exportHint}>
          <Button onClick={() => run(bridge.exportData)} disabled={busy}>
            {words.exportButton}
          </Button>
        </SettingsRow>
        <SettingsRow label={words.import} hint={words.importHint}>
          <Button onClick={() => run(bridge.importData)} disabled={busy}>
            {words.importButton}
          </Button>
        </SettingsRow>
      </SettingsSection>

      <p
        role="status"
        data-status={status.kind}
        className="mt-4 px-1 text-sm text-muted data-[status=error]:text-danger"
      >
        {status.kind === 'done' || status.kind === 'error' ? status.message : ''}
      </p>
    </SettingsPage>
  )
}

function DataDir({ loading }: { loading: Promise<Loaded<string>> }) {
  const loaded = use(loading)
  if (loaded.kind === 'failed') return <span className="text-danger">{loaded.message}</span>
  return <span className="break-all font-mono">{loaded.value}</span>
}
