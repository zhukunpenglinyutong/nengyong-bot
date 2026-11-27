// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { MAIN_BOT, MAIN_BOT_ID, secretary } from '../shared/bot'
import type { OnboardingChoices } from '../shared/bridge'
import { setLanguage } from '../shared/language'
import { SidebarState } from '../shared/sidebar'
import { needsOnboarding, onboard } from './onboarding'
import { createStore, type Store } from './store'

let store: Store
afterEach(() => setLanguage('zh'))
beforeEach(() => {
  store = createStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-')), 'nengyongbot.db'))
})

const choices: OnboardingChoices = {
  bossName: '小猪',
  address: '老朱',
  hires: [
    { name: '竞品分析师', shape: 'cloud', color: '#7B5CF5', duty: '每周一汇总竞品动态' },
    { name: '需求整理员', shape: 'drop', color: '#F0468C', duty: '把零散反馈归成需求清单' },
  ],
  suggestions: ['每周一早上给我一份竞品动态'],
}

it('remembers how the user wants to be addressed, for every bot', () => {
  onboard(store, choices, true)
  expect(store.get().userFacts.map((fact) => fact.text)).toEqual(['用户希望被称呼为「老朱」'])
})

it('remembers nothing when the user gave no address', () => {
  onboard(store, { ...choices, address: '' }, true)
  expect(store.get().userFacts).toEqual([])
})

it('hires the secretary first, then each bot asked with its duty as its purpose, waiting for the sidebar to show them', () => {
  const { bots } = onboard(store, choices, true)
  expect(bots.map((bot) => bot.name)).toEqual(['秘书Bot', '竞品分析师', '需求整理员'])
  expect(bots[0]).toEqual(secretary())
  expect(store.get().bots[bots[1]?.id ?? '']?.duty.purpose).toBe('每周一汇总竞品动态')
  expect(store.get().pending.map((bot) => bot.id)).toEqual(bots.map((bot) => bot.id))
})

it('greets in the main chat by the chosen names, mentioning each hire, with the suggestions attached', () => {
  const { bots, greeting } = onboard(store, choices, true)
  expect(store.history(MAIN_BOT_ID)).toEqual([greeting])
  if (greeting.kind !== 'bot') throw new Error('the greeting is a bot message')
  expect(greeting.text).toContain('老朱你好，我是小猪')
  expect(greeting.text).toContain(
    `[秘书Bot](bot:secretary)、[竞品分析师](bot:${bots[1]?.id}) 和 [需求整理员](bot:${bots[2]?.id})`,
  )
  expect(greeting.suggestions).toEqual(['每周一早上给我一份竞品动态'])
})

it('says the model is not connected yet when there is no key', () => {
  const { greeting } = onboard(store, choices, false)
  expect(greeting.kind === 'bot' && greeting.text).toContain('还没接上大模型')
})

it('still hires the secretary when nobody else was kept', () => {
  const { bots, greeting } = onboard(store, { ...choices, hires: [], suggestions: [] }, true)
  expect(bots).toEqual([secretary()])
  expect(store.get().bots.secretary?.duty.purpose).toContain('日程')
  expect(greeting.kind === 'bot' && greeting.text).toContain('我先帮你招了 [秘书Bot](bot:secretary)，在左边')
  expect(greeting.kind === 'bot' && greeting.suggestions).toBeUndefined()
})

it('runs once: a second call is refused and changes nothing', () => {
  onboard(store, choices, true)
  const before = store.get()
  expect(() => onboard(store, choices, true)).toThrow('初始引导已经走完了')
  expect(store.get()).toEqual(before)
  expect(store.history(MAIN_BOT_ID)).toHaveLength(1)
})

it('is still due when bots were saved before the onboarding ever ran', () => {
  store.saveSidebar(SidebarState.parse({ bots: [MAIN_BOT] }))
  expect(needsOnboarding(store)).toBe(true)
})

it('is no longer due once the onboarding has hired, even before the sidebar is saved', () => {
  onboard(store, { ...choices, hires: [] }, true)
  expect(needsOnboarding(store)).toBe(false)
})

it('greets in English without a name to call the user when the app is in English and none was given', () => {
  setLanguage('en')
  const { greeting } = onboard(store, { ...choices, address: '' }, true)
  expect(greeting.kind === 'bot' && greeting.text.split('\n')[0]).toBe("Hi, I'm 小猪, your chief of staff.")
})
