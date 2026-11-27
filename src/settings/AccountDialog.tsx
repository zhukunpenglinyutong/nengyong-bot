import { AnimatePresence, motion, useIsPresent } from 'motion/react'
import { type ComponentProps, type ReactNode, useRef, useState } from 'react'
import {
  type AccountUse,
  type AccountView,
  type ModelServicesView,
  SERVICES,
  type ServiceId,
} from '../../shared/modelServices'
import { Dialog } from '../ui/Dialog'
import { EASE_SHARP } from '../ui/motion'
import { useElementSize } from '../ui/useElementSize'
import { AccountForm } from './AccountForm'
import { ServiceList } from './ServiceList'

/** Where the dialog is: picking a service, or the form of one account. */
export type AccountStep =
  | { kind: 'list' }
  | { kind: 'form'; service: ServiceId; account: AccountView | null; isFromList: boolean }

const PAGE_SECONDS = 0.25
const PAGE_LEAVING_SECONDS = 0.15
const PAGE_SHIFT_PX = 48
const HEIGHT_TRANSITION = `height ${PAGE_SECONDS}s var(--ease-sharp)`

interface Props {
  start: AccountStep
  use: AccountUse | null // what the account is being connected for
  services: ModelServicesView
  bridge: ComponentProps<typeof AccountForm>['bridge']
  onDone: (services: ModelServicesView) => void
  onClose: () => void
}

/** Adding an account (pick a service, then fill in its key) or changing one, over the settings. */
export function AccountDialog({ start, use, services, bridge, onDone, onClose }: Props) {
  const [step, setStep] = useState(start)
  const pageRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(pageRef)

  return (
    <Dialog labelledBy="account-title" onClose={onClose} className="w-[420px] rounded-2xl bg-canvas">
      <div
        className="relative overflow-hidden"
        style={size ? { height: size.height, transition: size.previous ? HEIGHT_TRANSITION : undefined } : undefined}
      >
        <div ref={pageRef} className="absolute inset-x-0 top-0">
          <AnimatePresence mode="popLayout" initial={false}>
            <Page key={step.kind} side={step.kind === 'list' ? 'left' : 'right'}>
              {step.kind === 'list' ? (
                <ServiceList
                  connected={services.accounts.map((account) => account.service)}
                  onPick={(service) => setStep({ kind: 'form', service: service.id, account: null, isFromList: true })}
                  onClose={onClose}
                />
              ) : (
                <AccountForm
                  key={step.service}
                  service={SERVICES[step.service]}
                  account={step.account}
                  services={services}
                  use={use}
                  bridge={bridge}
                  onBack={step.isFromList ? () => setStep({ kind: 'list' }) : null}
                  onDone={onDone}
                  onClose={onClose}
                />
              )}
            </Page>
          </AnimatePresence>
        </div>
      </div>
    </Dialog>
  )
}

// a page on its way out stays on screen a moment; clicking it then would act twice, so it takes no input
function Page({ side, children }: { side: 'left' | 'right'; children: ReactNode }) {
  const isPresent = useIsPresent()
  const away = { opacity: 0, x: side === 'left' ? -PAGE_SHIFT_PX : PAGE_SHIFT_PX }
  return (
    <motion.div
      inert={!isPresent}
      initial={away}
      animate={{ opacity: 1, x: 0 }}
      exit={{ ...away, transition: { duration: PAGE_LEAVING_SECONDS, ease: EASE_SHARP } }}
      transition={{ duration: PAGE_SECONDS, ease: EASE_SHARP }}
    >
      {children}
    </motion.div>
  )
}
