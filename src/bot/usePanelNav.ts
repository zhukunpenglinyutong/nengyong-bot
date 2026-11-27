import { useState } from 'react'
import { usePersistentState } from '../ui/usePersistentState'
import { ABILITY_LISTS, type Ability } from './AbilitiesTab'
import { PanelTab } from './BotPanel'

/** The panel's tab and what its abilities tab shows; opening a flow or a skill opens the panel at it. */
export function usePanelNav(openPanel: () => void) {
  const [tab, setTab] = usePersistentState('panelTab', PanelTab)
  const [ability, setAbility] = useState<Ability>(ABILITY_LISTS.flows)
  const showList = () => setAbility((current) => ABILITY_LISTS[current.kind])
  const openAbility = (next: Ability) => {
    openPanel()
    setTab('abilities')
    setAbility(next)
  }
  return {
    tab,
    ability,
    setAbility,
    changeTab(next: PanelTab) {
      setTab(next)
      showList()
    },
    showList, // back to the list of the kind shown, as when another bot opens
    openFlow: (flowId: string | null) => openAbility({ kind: 'flows', flowId }),
    openSkill: (botId: string, name: string) => openAbility({ kind: 'skills', skill: { botId, name } }),
  }
}
