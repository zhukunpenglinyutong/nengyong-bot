import { describe, expect, it } from 'vitest'
import { DEMO_SIDEBAR as DEMO } from '../demo/demoData'
import {
  addUnread,
  createBot,
  createSectionWith,
  daysLeftOf,
  deleteSection,
  dismissBot,
  INITIAL_SIDEBAR,
  markSeen,
  markUnseenAsSeen,
  moveSection,
  moveToSection,
  placeBot,
  renameBot,
  renameSection,
  restoreBot,
  setBotAvatar,
  setBotLook,
  setHidden,
  setUnread,
  togglePin,
  toggleSection,
  withoutExpired,
} from './sidebarState'
import { sidebarView } from '../sidebarView'

const ids = (bots: { id: string }[]) => bots.map((bot) => bot.id)

describe('sidebar updates', () => {
  it('starts with only the main bot, pinned', () => {
    const view = sidebarView(INITIAL_SIDEBAR)
    expect([ids(INITIAL_SIDEBAR.bots), ids(view.pinned), view.sections, view.ungrouped, view.hidden]).toEqual([
      ['chief'],
      ['chief'],
      [],
      [],
      [],
    ])
  })

  it('lays out pinned bots, the named sections and 其他', () => {
    const view = sidebarView(DEMO)
    expect(ids(view.pinned)).toEqual(['chief', 'secretary'])
    expect(view.sections.map((s) => s.name)).toEqual(['我的 App', '生活', '家庭'])
    expect(ids(view.ungrouped)).toEqual(['ideas'])
    expect(view.hidden).toEqual([])
  })

  it('pinning takes a bot out of its section and back', () => {
    const pinned = togglePin(DEMO, 'repo')
    expect(ids(sidebarView(pinned).pinned)).toEqual(['chief', 'secretary', 'repo'])
    expect(ids(sidebarView(pinned).sections[0].bots)).not.toContain('repo')
    expect(ids(sidebarView(togglePin(pinned, 'repo')).sections[0].bots)).toContain('repo')
  })

  it('moves bots between sections, back to 其他, and creates a new section around a bot', () => {
    const moved = moveToSection(DEMO, 'repo', 's2')
    expect(ids(sidebarView(moved).sections[1].bots)).toContain('repo')
    expect(ids(sidebarView(moveToSection(moved, 'repo', null)).ungrouped)).toContain('repo')
    const last = sidebarView(createSectionWith(moved, 'travel', 'sNew')).sections.slice(-1)[0]
    expect([last.id, last.name, ids(last.bots)]).toEqual(['sNew', '未命名分组', ['travel']])
  })

  it('renames (ignoring blanks), reorders within bounds and collapses sections', () => {
    expect(renameSection(DEMO, 's1', '  工作  ').sections[0].name).toBe('工作')
    expect(renameSection(DEMO, 's1', '   ')).toBe(DEMO)
    expect(moveSection(DEMO, 's1', 1).sections.map((s) => s.id)).toEqual(['s2', 's1', 's3'])
    expect(moveSection(DEMO, 's1', -1)).toBe(DEMO)
    expect(moveSection(DEMO, 's3', 1)).toBe(DEMO)
    expect(toggleSection(DEMO, 's2').sections[1].collapsed).toBe(true)
  })

  it('deleting a section keeps its bots in 其他', () => {
    const view = sidebarView(deleteSection(DEMO, 's1'))
    expect(view.sections.map((s) => s.id)).toEqual(['s2', 's3'])
    expect(ids(view.ungrouped)).toEqual(['repo', 'content', 'support', 'release', 'ideas'])
  })

  it('hides (and unpins) a bot and restores it', () => {
    const hidden = setHidden(DEMO, 'chief', true)
    expect(ids(sidebarView(hidden).hidden)).toEqual(['chief'])
    expect(ids(sidebarView(hidden).pinned)).toEqual(['secretary'])
    expect(ids(sidebarView(setHidden(hidden, 'chief', false)).ungrouped)).toContain('chief')
  })

  it('marks a bot unread, and leaves the state untouched when nothing changes', () => {
    expect(setUnread(DEMO, 'support', true).unread).toEqual({ support: 1 })
    expect(setUnread(DEMO, 'support', false)).toBe(DEMO)
  })

  it('counts the replies the user has not seen, and clears them all at once', () => {
    const twice = addUnread(addUnread(DEMO, 'support'), 'support')
    expect(twice.unread).toEqual({ support: 2 })
    expect(setUnread(twice, 'support', true)).toBe(twice)
    expect(setUnread(twice, 'support', false).unread).toEqual({})
  })

  it('renames a bot in place, capped at BOT_NAME_MAX; section names are capped at SECTION_NAME_MAX', () => {
    const long = '字'.repeat(100)
    expect(renameBot(DEMO, 'support', '运维').bots.find((bot) => bot.id === 'support')?.name).toBe('运维')
    expect(renameBot(DEMO, 'support', long).bots.find((bot) => bot.id === 'support')?.name).toHaveLength(40)
    expect(renameBot(DEMO, 'support', '  ')).toBe(DEMO)
    expect(renameSection(DEMO, 's1', long).sections[0].name).toHaveLength(80)
  })

  it('lets a bot go with every reference to it, keeping it to restore, but never the main bot', () => {
    const gone = dismissBot(setUnread(togglePin(DEMO, 'support'), 'support', true), 'support', 5)
    expect(ids(gone.bots)).not.toContain('support')
    expect([gone.pinned, gone.unread, gone.placement.support]).toEqual([['chief', 'secretary'], {}, undefined])
    expect(gone.seenAt).not.toHaveProperty('support')
    expect(gone.dismissed).toEqual([{ bot: DEMO.bots.find((bot) => bot.id === 'support'), sectionId: 's1', at: 5 }])
    expect(dismissBot(DEMO, 'chief', 5)).toBe(DEMO)
  })

  it('restores a bot let go into the section it was in, or into 其他 when that section is gone', () => {
    const gone = dismissBot(DEMO, 'support', 5)
    const back = restoreBot(gone, 'support')
    expect([back.placement.support, back.dismissed]).toEqual(['s1', []])
    expect(back.bots.find((bot) => bot.id === 'support')).toEqual(DEMO.bots.find((bot) => bot.id === 'support'))
    expect('support' in restoreBot(deleteSection(gone, 's1'), 'support').placement).toBe(false)
    expect(restoreBot(gone, 'nobody')).toBe(gone)
  })

  it('forgets bots let go once their days to be restored have run out', () => {
    const day = 86_400_000
    const gone = dismissBot(dismissBot(DEMO, 'support', 0), 'repo', 2 * day)
    expect([daysLeftOf(0, 0), daysLeftOf(0, day + 1), daysLeftOf(0, 7 * day)]).toEqual([7, 6, 0])
    expect(withoutExpired(gone, 7 * day).dismissed.map(({ bot }) => bot.id)).toEqual(['repo'])
  })

  it('remembers when the user last looked at each bot, keeping the others', () => {
    expect(markSeen({ ...DEMO, seenAt: { repo: 1 } }, ['chief', 'support'], 5).seenAt).toEqual({
      repo: 1,
      chief: 5,
      support: 5,
    })
  })

  it('counts bots never looked at as seen now, and leaves the times it already has', () => {
    const seenAt = markUnseenAsSeen({ ...DEMO, seenAt: { repo: 1 } }, 5).seenAt
    expect(seenAt.repo).toBe(1)
    expect(seenAt.support).toBe(5)
  })

  it('creates a bot into 其他 (expanded), and ignores a bot that is already there', () => {
    const created = createBot(
      { ...DEMO, ungroupedCollapsed: true },
      { id: 'b1', name: '  写作助手 ', shape: 'cat', color: '#2BC48A' },
    )
    expect(sidebarView(created).ungrouped.slice(-1)[0]).toMatchObject({ id: 'b1', name: '写作助手', shape: 'cat' })
    expect(created.ungroupedCollapsed).toBe(false)
    expect(createBot(created, { id: 'b1', name: '重复', shape: 'blob', color: '#1E1E22' })).toBe(created)
  })

  it('creates a bot into the section of that name, expanded, and makes the section when there is none', () => {
    const bot = { id: 'b1', name: '运营专员', shape: 'cat', color: '#2BC48A' } as const
    const into = (state: typeof DEMO, name: string) => createBot(state, { ...bot, section: { id: 'sNew', name } })
    const collapsed = { ...DEMO, sections: DEMO.sections.map((section) => ({ ...section, collapsed: true })) }
    const existing = DEMO.sections[0]
    const joined = into(collapsed, existing.name)
    expect(joined.placement.b1).toBe(existing.id)
    expect(joined.sections).toHaveLength(DEMO.sections.length)
    expect(joined.sections[0].collapsed).toBe(false)
    const made = into(DEMO, '运营团队')
    expect(made.sections.slice(-1)).toEqual([{ id: 'sNew', name: '运营团队', collapsed: false }])
    expect(made.placement.b1).toBe('sNew')
  })

  it('moves a bot into the section of that name, making it when there is none, or back to 其他', () => {
    const existing = DEMO.sections[0]
    expect(placeBot(DEMO, 'travel', { id: 'sNew', name: existing.name }).placement.travel).toBe(existing.id)
    const made = placeBot(DEMO, 'repo', { id: 'sNew', name: '运营团队' })
    expect(made.sections.slice(-1)).toEqual([{ id: 'sNew', name: '运营团队', collapsed: false }])
    expect(made.placement.repo).toBe('sNew')
    const twice = placeBot(made, 'support', { id: 'sOther', name: '运营团队' })
    expect([twice.sections.length, twice.placement.support]).toEqual([made.sections.length, 'sNew'])
    const back = placeBot({ ...made, ungroupedCollapsed: true }, 'repo', undefined)
    expect(['repo' in back.placement, back.ungroupedCollapsed]).toEqual([false, false])
  })

  it('an uploaded picture replaces the look until a new look is picked', () => {
    const avatar = 'data:image/webp;base64,AAAA'
    const withPicture = setBotAvatar(DEMO, 'repo', avatar)
    expect(withPicture.bots.find((bot) => bot.id === 'repo')?.avatar).toBe(avatar)
    const relooked = setBotLook(withPicture, 'repo', { shape: 'cat', color: '#4A8CFF' })
    expect(relooked.bots.find((bot) => bot.id === 'repo')).toMatchObject({ shape: 'cat', color: '#4A8CFF' })
    expect(relooked.bots.find((bot) => bot.id === 'repo')?.avatar).toBeUndefined()
  })

  it('removing the picture puts the shape back', () => {
    const withPicture = setBotAvatar(DEMO, 'repo', 'data:image/webp;base64,AAAA')
    expect(setBotAvatar(withPicture, 'repo', undefined).bots.find((bot) => bot.id === 'repo')?.avatar).toBeUndefined()
  })
})
