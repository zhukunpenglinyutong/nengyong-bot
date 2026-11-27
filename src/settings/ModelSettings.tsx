import { AnimatePresence } from 'motion/react'
import { type ReactNode, useState } from 'react'
import type { NengyongBotBridge } from '../../shared/bridge'
import {
  type AccountUse,
  type AccountView,
  canSearch,
  type ModelChoice,
  type ModelServicesView,
} from '../../shared/modelServices'
import { ipcErrorMessage } from '../ipcErrorMessage'
import type { MenuEntry } from '../ui/ContextMenu'
import { Icon } from '../ui/Icon'
import { useFlash } from '../ui/useFlash'
import { AccountDialog, type AccountStep } from './AccountDialog'
import { ServiceLogo } from './ModelLogo'
import { type ModelList, modelMenu } from './modelMenu'
import { COMING_SOON, PickerButton } from './PickerButton'
import { SettingsRow, SettingsSection } from './SettingsSection'
import { strings } from '../../shared/strings'

interface Props {
  bridge: Pick<NengyongBotBridge, 'listModels' | 'setChatModel' | 'setSearchAccount' | 'saveAccount' | 'removeAccount'>
  services: ModelServicesView
  onServicesChange: (services: ModelServicesView) => void
}

const LOADING: ModelList = { kind: 'loading' }

const USE_NAMES = { chat: strings().models.useNames.chat, search: strings().models.useNames.search }

/** The 模型服务 page: the main model and what web search uses, then the accounts they can use. Every change applies at once. */
export function ModelSettings({ bridge, services, onServicesChange }: Props) {
  const words = strings().models.page
  // with nothing connected there is nothing to pick from, so it opens on connecting DeepSeek
  const [editing, setEditing] = useState<{ start: AccountStep; use: AccountUse | null } | null>(
    services.accounts.length === 0
      ? { start: { kind: 'form', service: 'deepseek', account: null, isFromList: false }, use: 'chat' }
      : null,
  )
  const [said, say] = useFlash<{ use: AccountUse; text: string }>()
  const [failure, setFailure] = useState<{ use: AccountUse; message: string } | null>(null)
  const [lists, setLists] = useState<Record<string, ModelList>>({})

  const change = async (use: AccountUse, request: () => Promise<ModelServicesView>, text: string) => {
    setFailure(null)
    try {
      onServicesChange(await request())
      say({ use, text })
    } catch (error) {
      setFailure({ use, message: ipcErrorMessage(error) })
    }
  }
  const hintOf = (use: AccountUse, usual: ReactNode) => {
    if (failure?.use === use) return <span className="text-danger">{failure.message}</span>
    if (said?.use === use) return <span className="text-ink">{said.text}</span>
    return usual
  }
  const addFor = (use: AccountUse) => setEditing({ start: { kind: 'list' }, use })

  const chatAccount = services.accounts.find((account) => account.id === services.chat?.accountId)
  const deepseek = services.accounts.find((account) => account.service === 'deepseek')
  const searchAccount = services.accounts.find((account) => account.id === services.searchAccountId)

  const readLists = () => {
    setLists({})
    for (const account of services.accounts)
      modelListOf(bridge, account.id).then((list) => setLists((current) => ({ ...current, [account.id]: list })))
  }
  const pickChat = (choice: ModelChoice) => change('chat', () => bridge.setChatModel(choice), words.saved)
  const chatItems: MenuEntry[] = [
    ...modelMenu(
      services.accounts.map((account) => ({ account, list: lists[account.id] ?? LOADING })),
      services.chat,
      pickChat,
    ),
    'separator',
    { label: words.addProvider, icon: 'plus', onSelect: () => addFor('chat') },
  ]
  const searchItems = (): MenuEntry[] => {
    if (!deepseek) {
      const start: AccountStep = { kind: 'form', service: 'deepseek', account: null, isFromList: false }
      return [
        {
          label: words.connectDeepSeek,
          icon: 'plus',
          onSelect: () => setEditing({ start, use: 'search' }),
        },
      ]
    }
    if (!canSearch(deepseek))
      return [
        {
          label: words.searchNeedsOfficial,
          disabled: true,
        },
      ]
    return [
      {
        label: words.deepSeekSearch,
        checked: searchAccount !== undefined,
        onSelect: () => change('search', () => bridge.setSearchAccount(deepseek.id), words.turnedOn),
      },
      {
        label: words.turnOffSearch,
        checked: searchAccount === undefined,
        onSelect: () => change('search', () => bridge.setSearchAccount(null), words.turnedOff),
      },
    ]
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-10 pt-9 pb-8">
      <h2 id="settings-title" className="text-xl font-semibold tracking-tight">
        {words.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{words.intro}</p>

      <SettingsSection title={words.inUse}>
        <SettingsRow label={words.mainModel} hint={hintOf('chat', chatHintOf(services))}>
          <PickerButton menuLabel={words.mainModel} items={chatItems} onOpen={readLists}>
            {chatAccount && services.chat ? (
              <>
                <ServiceLogo service={chatAccount.service} name={chatAccount.name} size={20} />
                <span className="truncate font-mono">{services.chat.model}</span>
              </>
            ) : (
              <span className="px-1 text-soft">{words.notSet}</span>
            )}
          </PickerButton>
        </SettingsRow>
        <SettingsRow label={words.image} hint={words.imageHint}>
          <PickerButton menuLabel={words.image} items={COMING_SOON}>
            <span className="px-1 text-soft">{words.off}</span>
          </PickerButton>
        </SettingsRow>
        <SettingsRow label={words.video} hint={words.videoHint}>
          <PickerButton menuLabel={words.video} items={COMING_SOON}>
            <span className="px-1 text-soft">{words.off}</span>
          </PickerButton>
        </SettingsRow>
        <SettingsRow label={words.search} hint={hintOf('search', words.searchHint)}>
          <PickerButton menuLabel={words.search} items={searchItems()}>
            {searchAccount ? (
              <>
                <ServiceLogo service={searchAccount.service} name={searchAccount.name} size={20} />
                <span className="truncate">{words.deepSeekSearch}</span>
              </>
            ) : (
              <span className="px-1 text-soft">{words.off}</span>
            )}
          </PickerButton>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={words.accounts}>
        {services.accounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            usedFor={usesOf(services, account.id)}
            onOpen={() =>
              setEditing({
                start: { kind: 'form', service: account.service, account, isFromList: false },
                use: null,
              })
            }
          />
        ))}
        <button
          type="button"
          onClick={() => setEditing({ start: { kind: 'list' }, use: null })}
          className="flex w-full items-center gap-3 px-5 py-3 text-left text-md first:rounded-t-xl last:rounded-b-xl"
        >
          <span className="grid size-8 place-items-center rounded-full bg-bubble text-soft">
            <Icon name="plus" size={16} />
          </span>
          <span className="flex-1">{words.addAccount}</span>
          <span className="text-muted">
            <Icon name="chevron" size={16} />
          </span>
        </button>
      </SettingsSection>

      <AnimatePresence>
        {editing && (
          <AccountDialog
            start={editing.start}
            use={editing.use}
            usedFor={
              editing.start.kind === 'form' && editing.start.account ? usesOf(services, editing.start.account.id) : []
            }
            services={services}
            bridge={bridge}
            onDone={(next) => {
              onServicesChange(next)
              setEditing(null)
              if (editing.use) say({ use: editing.use, text: connectedText(editing.use, services, next) })
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function chatHintOf({ chat }: ModelServicesView): ReactNode {
  if (!chat) return <span className="text-danger">{strings().models.page.noModel}</span>
  return strings().models.page.mainModelHint
}

function AccountRow({ account, usedFor, onOpen }: { account: AccountView; usedFor: string[]; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-5 py-3 text-left first:rounded-t-xl last:rounded-b-xl"
    >
      <ServiceLogo service={account.service} name={account.name} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-md">{account.name}</span>
        <span className="block text-xs text-muted">
          {usedFor.length ? strings().models.page.usedFor(usedFor) : strings().models.page.unused}
        </span>
      </span>
      <span className="font-mono text-xs text-muted">{account.keyHint}</span>
      <span className="text-muted">
        <Icon name="chevron" size={16} />
      </span>
    </button>
  )
}

/** What the row an account was connected from says afterwards: what it now uses, or what is left to do. */
function connectedText(use: AccountUse, before: ModelServicesView, after: ModelServicesView): string {
  const words = strings().models.page
  if (use === 'search') return after.searchAccountId ? words.turnedOn : words.connected
  const isSwitched = after.chat?.accountId !== before.chat?.accountId || after.chat?.model !== before.chat?.model
  if (after.chat && isSwitched) return words.switchedTo(after.chat.model)
  return words.pickModel
}

function usesOf(services: ModelServicesView, accountId: string): string[] {
  return [
    ...(services.chat?.accountId === accountId ? [USE_NAMES.chat] : []),
    ...(services.searchAccountId === accountId ? [USE_NAMES.search] : []),
  ]
}

function modelListOf(bridge: Pick<NengyongBotBridge, 'listModels'>, accountId: string): Promise<ModelList> {
  return bridge.listModels(accountId).then(
    (models) => ({ kind: 'listed', models }),
    (error) => ({ kind: 'failed', message: ipcErrorMessage(error) }),
  )
}
