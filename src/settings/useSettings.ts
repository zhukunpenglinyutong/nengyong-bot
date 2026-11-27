import { useState } from 'react'
import type { NengyongBotBridge } from '../../shared/bridge'
import type { DevicesView, PairingRequest } from '../../shared/devices'
import { type ModelServicesView, SERVICES } from '../../shared/modelServices'
import { strings } from '../../shared/strings'
import { useReadOnMount } from '../ui/useReadOnMount'
import { useSubscription } from '../ui/useSubscription'
import type { SettingsPage } from './SettingsDialog'

/**
 * The settings and what only the computer keeps: the model services, the devices and the device asking to pair.
 * `canAskForKey` is false while the onboarding is due: it connects a model itself. A failed read goes to `onFailure`.
 */
export function useSettings(
  bridge: NengyongBotBridge,
  canAskForKey: boolean,
  onFailure: (what: string, error: unknown) => void,
) {
  const [page, setPage] = useState<SettingsPage | null>(null)
  const [modelServices, setModelServices] = useState<ModelServicesView | null>(null)
  const [devices, setDevices] = useState<DevicesView | null>(null)
  const [pairing, setPairing] = useState<PairingRequest | null>(null)
  const failedToRead = (error: unknown) => onFailure(strings().app.failures.readModelServices, error)

  useReadOnMount(
    () => bridge.getModelServices(),
    (services) => {
      setModelServices(services)
      if (services.chat === null && canAskForKey) setPage('model')
    },
    failedToRead,
  )
  useSubscription(bridge.onEvent, (event) => {
    if (event.kind === 'open-settings' || (event.kind === 'error' && event.code === 'no-key')) setPage('model')
    if (event.kind === 'devices') setDevices(event.devices)
    if (event.kind === 'pairing') setPairing(event.request)
  })

  return {
    page, // null while the settings are closed
    modelServices, // null until the first read from the bridge lands
    setModelServices, // the 模型服务 page changes them through the bridge and hands back what it answered
    devices, // the latest the harness reported; null until it reports one
    pairing, // the device asking to be let in now
    open(next: SettingsPage) {
      setPage(next)
      // the first read failed and was reported: try again, or the settings could never be opened
      if (!modelServices) bridge.getModelServices().then(setModelServices, failedToRead)
    },
    close: () => setPage(null),
    async connectDeepSeek(apiKey: string) {
      const saved = modelServices?.accounts.find((account) => account.service === 'deepseek')
      const input = {
        id: null,
        service: 'deepseek' as const,
        name: '',
        baseURL: saved?.baseURL ?? SERVICES.deepseek.baseURL,
        apiKey,
      }
      setModelServices(await bridge.saveAccount(input, 'chat'))
    },
  }
}
