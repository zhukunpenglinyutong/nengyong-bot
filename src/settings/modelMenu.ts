import type { AccountView, ModelChoice } from '../../shared/modelServices'
import type { MenuEntry } from '../ui/ContextMenu'
import { strings } from '../../shared/strings'

/** Where reading an account's models is: still going, its models, or why they could not be read. */
export type ModelList = { kind: 'loading' } | { kind: 'listed'; models: string[] } | { kind: 'failed'; message: string }

/** The models of each account to pick from, in a submenu per account once there are several: the main model menu. */
export function modelMenu(
  lists: { account: AccountView; list: ModelList }[],
  chosen: ModelChoice | null,
  onPick: (choice: ModelChoice) => void,
): MenuEntry[] {
  const [only, ...others] = lists
  if (!only) return [{ label: strings().models.menu.noAccounts, disabled: true }]
  if (others.length === 0) return modelItems(only.account, only.list, chosen, onPick)
  return lists.map(({ account, list }) => ({
    label: account.name,
    detail: chosen?.accountId === account.id ? chosen.model : undefined,
    submenu: modelItems(account, list, chosen, onPick),
  }))
}

function modelItems(
  account: AccountView,
  list: ModelList,
  chosen: ModelChoice | null,
  onPick: (choice: ModelChoice) => void,
): MenuEntry[] {
  switch (list.kind) {
    case 'loading':
      return [{ label: strings().models.menu.loading, disabled: true }]
    case 'failed':
      return [{ label: strings().models.menu.loadFailed(list.message), disabled: true }]
    case 'listed':
      if (list.models.length === 0) return [{ label: strings().models.menu.noModels, disabled: true }]
      return list.models.map((model) => ({
        label: model,
        checked: chosen?.accountId === account.id && chosen.model === model,
        onSelect: () => onPick({ accountId: account.id, model }),
      }))
    default:
      return list satisfies never
  }
}
