import { useReducer } from 'react'
import { z } from 'zod'
import type { NengyongBotBridge } from '../../shared/bridge'
import { ipcErrorMessage } from '../ipcErrorMessage'
import { useAutoDismiss } from '../ui/useAutoDismiss'
import { usePersistentState } from '../ui/usePersistentState'
import { useSubscription } from '../ui/useSubscription'
import { RELEASES } from './releases'
import { initialUpdate, updateState } from './updateState'

const QUIET_CHECK_DELAY_MS = 3000 // after launch, once the window has settled
const QUIET_CHECK = 0
const LastVersion = z.string().nullable().catch(null)

/** 检查更新: a quiet check after launch, the user's own checks, and installing what they found once they ask. */
export function useUpdate(bridge: Pick<NengyongBotBridge, 'checkForUpdate' | 'installUpdate' | 'onEvent'>) {
  const version = RELEASES[0].version
  const [lastVersion, setLastVersion] = usePersistentState('lastVersion', LastVersion)
  const [state, dispatch] = useReducer(updateState, lastVersion, (last) => initialUpdate(last, version))
  if (lastVersion !== version) setLastVersion(version)

  const check = (isQuiet: boolean) => {
    if (!isQuiet) dispatch({ kind: 'checking' })
    bridge.checkForUpdate().then(
      (found) => dispatch({ kind: 'checked', check: found, isQuiet }),
      (error) => dispatch({ kind: 'check-failed', message: ipcErrorMessage(error), isQuiet }),
    )
  }
  useAutoDismiss(QUIET_CHECK, QUIET_CHECK_DELAY_MS, () => check(true))
  useSubscription(bridge.onEvent, (event) => {
    if (event.kind === 'update-progress') dispatch(event)
    if (event.kind === 'update-error') dispatch({ kind: 'restart-failed', message: event.message })
  })

  return {
    state,
    check: () => check(false),
    install() {
      dispatch({ kind: 'installing' })
      bridge.installUpdate().then(
        () => dispatch({ kind: 'installed' }),
        (error) => dispatch({ kind: 'install-failed', message: ipcErrorMessage(error) }),
      )
    },
    closePopup: () => dispatch({ kind: 'close-popup' }),
  }
}
