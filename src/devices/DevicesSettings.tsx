import { AnimatePresence } from 'motion/react'
import { Suspense, use, useState } from 'react'
import type { NengyongBotBridge } from '../../shared/bridge'
import type { DeviceKind, DeviceView, DevicesView } from '../../shared/devices'
import { strings } from '../../shared/strings'
import { timeLabel } from '../timeLabel'
import { ipcErrorMessage, type Loaded, settle } from '../ipcErrorMessage'
import { SettingsPage, SettingsRow, SettingsSection } from '../settings/SettingsSection'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Icon, type IconName } from '../ui/Icon'
import { QrCode } from '../ui/QrCode'
import { Switch } from '../ui/Switch'
import { COPIED_LABEL, useCopy } from '../ui/useCopy'

interface Props {
  bridge: Pick<NengyongBotBridge, 'getDevices' | 'setLanAccess' | 'removeDevice'>
  live: DevicesView | null // what the harness reported last: it changes while the page is open
}

const ICONS: Record<DeviceKind, IconName> = { phone: 'phone', tablet: 'tablet', computer: 'laptop' }
const QR_SIZE = 132

/** 设备: whether phones and tablets on the local network may connect, which ones did, and the code a new one scans. */
export function DevicesSettings({ bridge, live }: Props) {
  const words = strings().devices.settings
  const [loading] = useState(() => settle(bridge.getDevices()))
  return (
    <SettingsPage title={words.title} intro={words.intro}>
      <Suspense>
        <LoadedDevices loading={loading} live={live} bridge={bridge} />
      </Suspense>
    </SettingsPage>
  )
}

function LoadedDevices({ loading, live, bridge }: Props & { loading: Promise<Loaded<DevicesView>> }) {
  const words = strings().devices.settings
  const loaded = use(loading)
  const [isTurningOff, setIsTurningOff] = useState(false)
  const [removing, setRemoving] = useState<DeviceView | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  if (loaded.kind === 'failed') return <p className="mt-6 text-sm text-danger">{loaded.message}</p>
  const view = live ?? loaded.value
  const onlineCount = view.devices.filter((device) => device.isOnline).length
  const run = (change: Promise<unknown>) => {
    setFailure(null)
    change.catch((error) => setFailure(ipcErrorMessage(error)))
  }
  const switchTo = (isOn: boolean) => {
    if (!isOn && onlineCount > 0) return setIsTurningOff(true)
    run(bridge.setLanAccess(isOn))
  }

  return (
    <>
      <SettingsSection>
        <SettingsRow id="lan-access" label={words.lanAccess} hint={words.lanAccessHint}>
          <Switch id="lan-access" isOn={view.isLanOn} onChange={switchTo} />
        </SettingsRow>
      </SettingsSection>
      {failure && <p className="mt-2 px-1 text-sm text-danger">{failure}</p>}
      {view.devices.length > 0 && (
        <SettingsSection title={words.connected(view.devices.length)}>
          {view.devices.map((device) => (
            <DeviceRow key={device.id} device={device} isLanOn={view.isLanOn} onRemove={() => setRemoving(device)} />
          ))}
        </SettingsSection>
      )}
      {view.devices.length > 0 && <p className="mt-2 px-1 text-xs text-muted">{words.reconnectNote}</p>}
      {view.isLanOn && <PairCard address={view.address} error={view.error} />}
      <AnimatePresence>
        {isTurningOff && (
          <ConfirmDialog
            title={words.turnOffTitle}
            body={words.turnOffBody(onlineCount)}
            confirmLabel={words.turnOff}
            onConfirm={() => run(bridge.setLanAccess(false))}
            onClose={() => setIsTurningOff(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {removing && (
          <ConfirmDialog
            title={words.removeTitle(removing.name)}
            body={words.removeBody}
            confirmLabel={words.remove}
            onConfirm={() => run(bridge.removeDevice(removing.id))}
            onClose={() => setRemoving(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function DeviceRow({ device, isLanOn, onRemove }: { device: DeviceView; isLanOn: boolean; onRemove: () => void }) {
  const words = strings().devices.settings
  const status = device.isOnline
    ? words.online
    : words.lastSeen(isLanOn ? words.offline : words.disconnected, timeLabel(device.lastSeenAt))
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-bubble text-soft">
        <Icon name={ICONS[device.kind]} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-md">{device.name}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span
            data-online={device.isOnline || undefined}
            className="size-1.5 rounded-full bg-hover data-online:bg-online"
          />
          {status}
        </div>
      </div>
      <Button onClick={onRemove} aria-label={words.removeDevice(device.name)}>
        {words.remove}
      </Button>
    </div>
  )
}

/** How a new device gets in: scan the code, or type the address; this computer asks before it lets it in. */
function PairCard({ address, error }: { address: string | null; error: string | null }) {
  const words = strings().devices.settings
  const [copied, copy] = useCopy()
  if (error || !address)
    return (
      <SettingsSection title={words.connectNew}>
        <p className="px-5 py-4 text-sm text-danger">{error ?? words.noNetwork}</p>
      </SettingsSection>
    )
  return (
    <SettingsSection title={words.connectNew}>
      <div className="flex gap-6 p-5">
        <QrCode text={address} size={QR_SIZE} label={words.qrLabel(address)} />
        <div className="flex min-w-0 flex-col gap-2.5">
          <b className="text-md font-semibold">{words.scan}</b>
          <p className="text-sm text-soft">{words.orOpen}</p>
          <span className="flex h-8 w-fit items-center gap-2 rounded-md bg-bubble pr-1 pl-2.5 font-mono text-sm">
            {address}
            <button
              onClick={() => copy(address)}
              className="h-6 rounded-sm bg-surface px-2 font-sans text-xs shadow-card"
            >
              {copied ? COPIED_LABEL[copied] : words.copy}
            </button>
          </span>
          <p className="text-sm text-soft">{words.codeHint}</p>
        </div>
      </div>
      <p className="flex items-start gap-2 px-5 py-3 text-xs text-soft">
        <span className="mt-px text-warning">
          <Icon name="warning" size={14} />
        </span>
        {words.warning}
      </p>
    </SettingsSection>
  )
}
