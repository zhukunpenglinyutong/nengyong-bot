import { type ReactNode, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { NengyongBotBridge } from '../shared/bridge'
import { type Language, locale, setLanguage } from '../shared/language'
import { browserLanguage } from './browserLanguage'
import './index.css'
import { strings } from '../shared/strings'

declare global {
  interface Window {
    nengyongbot?: NengyongBotBridge // present only inside the Electron app (see electron/preload.ts)
  }
}

// The one place that knows the environments: the desktop app, a paired device's browser, and the demo. Each is imported
// on demand, once the language is set: their modules make text as they load.
async function environment(): Promise<ReactNode> {
  if (window.nengyongbot) {
    const [language, saved, needsOnboarding] = await Promise.all([
      window.nengyongbot.getLanguage(),
      window.nengyongbot.getSidebar(),
      window.nengyongbot.needsOnboarding(),
    ])
    show(language)
    const { App } = await import('./App')
    return <App bridge={window.nengyongbot} initialSidebar={saved ?? undefined} needsOnboarding={needsOnboarding} />
  }
  const remote = await import('./remote/remoteBridge')
  const session = await remote.remoteSession()
  if (session?.kind === 'paired') {
    const { bridge, connection } = remote.createRemoteBridge()
    const [language, saved] = await Promise.all([bridge.getLanguage(), bridge.getSidebar()])
    show(language)
    const [{ PhoneApp }, { INITIAL_SIDEBAR }] = await Promise.all([
      import('./PhoneApp'),
      import('./sidebar/sidebarState'),
    ])
    return <PhoneApp bridge={bridge} connection={connection} initialSidebar={saved ?? INITIAL_SIDEBAR} />
  }
  show(browserLanguage())
  if (session?.kind === 'unpaired') {
    const [{ PairingPage }, { startPairing }] = await Promise.all([
      import('./remote/PairingPage'),
      import('./remote/pairing'),
    ])
    return <PairingPage pairing={startPairing()} />
  }
  const [{ App }, { createDemoBridge }, { DEMO_SIDEBAR }, { DemoDisclaimer }] = await Promise.all([
    import('./App'),
    import('./demo/demoBridge'),
    import('./demo/demoData'),
    import('./demo/DemoDisclaimer'),
  ])
  // ?onboarding starts the demo with the onboarding
  const needsOnboarding = new URLSearchParams(location.search).has('onboarding')
  return (
    <>
      <DemoDisclaimer />
      <App
        bridge={createDemoBridge()}
        initialSidebar={needsOnboarding ? undefined : DEMO_SIDEBAR}
        needsOnboarding={needsOnboarding}
      />
    </>
  )
}

function show(language: Language) {
  setLanguage(language)
  document.documentElement.lang = locale()
}

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')

try {
  const app = await environment()
  createRoot(root).render(<StrictMode>{app}</StrictMode>)
} catch (error) {
  // without the saved sidebar the app would start empty and overwrite it, so it does not start at all
  const reason = error instanceof Error ? error.message : String(error)
  root.textContent = strings().app.loadFailed(reason)
}
