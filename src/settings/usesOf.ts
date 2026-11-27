import type { ModelServicesView } from '../../shared/modelServices'
import { strings } from '../../shared/strings'

/** What an account is used for, named: what its row says, and what disconnecting it turns off. */
export function usesOf(services: ModelServicesView, accountId: string): string[] {
  const names = strings().models.useNames
  return [
    ...(services.chat?.accountId === accountId ? [names.chat] : []),
    ...(services.searchAccountId === accountId ? [names.search] : []),
  ]
}
