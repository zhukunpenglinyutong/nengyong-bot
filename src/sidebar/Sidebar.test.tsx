import { cleanup, fireEvent, screen, waitForElementToBeRemoved, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderDemoApp } from '../demo/renderDemoApp'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const section = (name: string) => screen.getByRole('region', { name })
const header = (name: string) => within(section(name)).getAllByRole('button')[0]
const openMenu = (el: Element) => fireEvent.contextMenu(el, { clientX: 100, clientY: 100 })
const item = (name: string | RegExp) => screen.getByRole('menuitem', { name })
const toggle = (name: string) => screen.getByRole('menuitemcheckbox', { name })
const row = (name: RegExp) => screen.getAllByRole('button', { name })[0] // sidebar comes before the chat header

// jsdom has no DataTransfer
function fakeDataTransfer() {
  const data = new Map<string, string>()
  return {
    effectAllowed: 'all',
    get types() {
      return [...data.keys()]
    },
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
  }
}

function dragOnto(name: RegExp, target: Element) {
  const dataTransfer = fakeDataTransfer()
  fireEvent.dragStart(row(name), { dataTransfer })
  fireEvent.dragOver(target, { dataTransfer })
  fireEvent.drop(target, { dataTransfer })
}

describe('sidebar sections', () => {
  it('collapses and expands a section from its header, and remembers it', async () => {
    const { user, unmount, bridge } = renderDemoApp()
    expect(within(section('生活')).getByText('健身教练')).toBeInTheDocument()
    await user.click(header('生活'))
    expect(header('生活')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('健身教练')).not.toBeInTheDocument()
    unmount()
    renderDemoApp(bridge, (await bridge.getSidebar()) ?? undefined)
    expect(header('生活')).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(header('生活'))
    expect(screen.getByText('健身教练')).toBeInTheDocument()
  })

  it('section menu: rename inline, reorder with disabled edges, delete keeps the bots', async () => {
    const { user } = renderDemoApp()
    openMenu(header('我的 App'))
    expect(screen.getByRole('menu', { name: '分组菜单' })).toBeInTheDocument()
    expect(item('上移')).toHaveAttribute('aria-disabled', 'true')

    await user.click(item('重命名'))
    const input = screen.getByRole('textbox', { name: '分组名称' })
    await user.clear(input)
    await user.type(input, '开源{enter}')
    expect(section('开源')).toBeInTheDocument()

    openMenu(header('开源'))
    await user.click(item('下移'))
    const names = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(names.slice(0, 2)).toEqual(['生活', '开源'])

    openMenu(header('开源'))
    await user.click(item('删除'))
    const dialog = screen.getByRole('dialog', { name: '删除“开源”' })
    expect(dialog).toHaveTextContent('里面的 Bot 都会回到「其他」，一个也不会删。')
    await user.click(within(dialog).getByRole('button', { name: '删除' }))
    expect(screen.queryByRole('region', { name: '开源' })).not.toBeInTheDocument()
    expect(within(section('其他')).getByText('GitHub 数据日报')).toBeInTheDocument()
  })

  it('escape on a rename keeps the old name; cancel in the confirm dialog keeps the section', async () => {
    const { user } = renderDemoApp()
    openMenu(header('生活'))
    await user.click(item('重命名'))
    await user.type(screen.getByRole('textbox', { name: '分组名称' }), 'xx{escape}')
    expect(section('生活')).toBeInTheDocument()

    openMenu(header('生活'))
    await user.click(item('删除'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }))
    expect(section('生活')).toBeInTheDocument()
  })
})

describe('dragging a bot row', () => {
  it('drops it into another section', () => {
    renderDemoApp()
    dragOnto(/GitHub 数据日报/, header('生活'))
    expect(within(section('生活')).getByText('GitHub 数据日报')).toBeInTheDocument()
  })

  it('drops it into 其他 to take it out of its section', () => {
    renderDemoApp()
    dragOnto(/GitHub 数据日报/, header('其他'))
    expect(within(section('其他')).getByText('GitHub 数据日报')).toBeInTheDocument()
  })
})

describe('bot menu', () => {
  it('lists the bot actions under its name and work number, with its section beside 移至', () => {
    renderDemoApp()
    openMenu(row(/GitHub 数据日报/))
    const menu = screen.getByRole('menu', { name: 'Bot 操作' })
    expect(within(menu).getByText('GitHub 数据日报')).toBeInTheDocument()
    expect(within(menu).getByText('工号 REPO')).toBeInTheDocument()
    expect(
      within(menu)
        .getAllByRole('menuitemcheckbox')
        .map((m) => m.textContent),
    ).toEqual(['置顶', '未读'])
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['改名', '复制 ID', '移至我的 App', '藏起来', '离职…'])
  })

  it('copies the bot id from 复制 ID and says 已复制 on the tile before the menu closes', async () => {
    const { user } = renderDemoApp()
    openMenu(row(/GitHub 数据日报/))
    await user.click(item('复制 ID'))
    expect(await screen.findByRole('menuitem', { name: '已复制' })).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe('repo')
    await waitForElementToBeRemoved(() => screen.queryByRole('menu', { name: 'Bot 操作' }))
  })

  it('says 复制失败 on the tile when the clipboard refuses', async () => {
    const { user } = renderDemoApp()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    openMenu(row(/GitHub 数据日报/))
    await user.click(item('复制 ID'))
    expect(await screen.findByRole('menuitem', { name: '复制失败' })).toBeInTheDocument()
  })

  it('pins with the 置顶 toggle, shown as on until it unpins', async () => {
    const { user } = renderDemoApp()
    openMenu(row(/GitHub 数据日报/))
    expect(toggle('置顶')).not.toBeChecked()
    await user.click(toggle('置顶'))
    expect(within(screen.getByRole('group', { name: '置顶区' })).getByText('GitHub 数据日报')).toBeInTheDocument()

    openMenu(within(screen.getByRole('group', { name: '置顶区' })).getByRole('button', { name: /GitHub 数据日报/ }))
    expect(toggle('置顶')).toBeChecked()
    await user.click(toggle('置顶'))
    expect(within(section('我的 App')).getByText('GitHub 数据日报')).toBeInTheDocument()
  })

  it('moves to another section via the submenu, or into a freshly created one', async () => {
    const { user } = renderDemoApp()
    openMenu(row(/GitHub 数据日报/))
    await user.click(item('移至'))
    const sub = screen.getByRole('menu', { name: '移至' })
    expect(
      within(sub)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['我的 App', '生活', '家庭', '其他', '新开一个分组'])
    await user.click(within(sub).getByRole('menuitem', { name: '生活' }))
    expect(within(section('生活')).getByText('GitHub 数据日报')).toBeInTheDocument()

    openMenu(row(/GitHub 数据日报/))
    await user.click(item('移至'))
    await user.click(item('新开一个分组'))
    const input = screen.getByRole('textbox', { name: '分组名称' })
    expect(input).toHaveValue('未命名分组')
    await user.clear(input)
    await user.type(input, '代码{enter}')
    expect(within(section('代码')).getByText('GitHub 数据日报')).toBeInTheDocument()
  })

  it('marks unread with a dot, cleared by opening the bot', async () => {
    const { user } = renderDemoApp()
    openMenu(row(/Bug 反馈整理/))
    await user.click(toggle('未读'))
    expect(within(row(/Bug 反馈整理/)).getByLabelText('未读')).toBeInTheDocument()
    await user.click(row(/Bug 反馈整理/))
    expect(within(row(/Bug 反馈整理/)).queryByLabelText('未读')).not.toBeInTheDocument()
  })

  it('hides into 藏起来的 Bot and shows again', async () => {
    const { user } = renderDemoApp()
    openMenu(row(/家庭记账/))
    await user.click(item('藏起来'))
    expect(screen.queryByText('家庭记账')).not.toBeInTheDocument()
    await user.click(header('藏起来的 Bot'))
    openMenu(row(/家庭记账/))
    await user.click(item('取消隐藏'))
    expect(within(section('家庭')).getByText('家庭记账')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '藏起来的 Bot' })).not.toBeInTheDocument()
  })

  it('renames a bot everywhere it is shown', async () => {
    const { user } = renderDemoApp()
    await user.click(row(/健身教练/))
    openMenu(row(/健身教练/))
    await user.click(item('改名'))
    const input = screen.getByRole('textbox', { name: 'Bot 名称' })
    await user.clear(input)
    await user.type(input, '健身教练{enter}')
    expect(screen.getByRole('textbox', { name: '跟 健身教练 说点什么' })).toBeInTheDocument()
  })

  it('lets a bot leave after confirmation and falls back to another chat', async () => {
    const { user } = renderDemoApp()
    await user.click(row(/Bug 反馈整理/))
    openMenu(row(/Bug 反馈整理/))
    await user.click(item('离职…'))
    await user.click(
      within(screen.getByRole('dialog', { name: '让“Bug 反馈整理”离职' })).getByRole('button', { name: '离职' }),
    )
    expect(screen.queryByText('Bug 反馈整理')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '跟 小满 说点什么' })).toBeInTheDocument()
  })

  it('brings a bot that was let go back from 离职冷静期 in the settings', async () => {
    const { user } = renderDemoApp()
    openMenu(row(/Bug 反馈整理/))
    await user.click(item('离职…'))
    await user.click(
      within(screen.getByRole('dialog', { name: '让“Bug 反馈整理”离职' })).getByRole('button', { name: '离职' }),
    )
    await user.click(screen.getByRole('button', { name: '设置' }))
    const dialog = await screen.findByRole('dialog', { name: '模型服务' })
    await user.click(within(dialog).getByRole('button', { name: '离职冷静期' }))
    expect(within(dialog).getByText('还剩 7 天')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '恢复 Bug 反馈整理' }))
    expect(within(dialog).getByText('没有离职的 Bot。')).toBeInTheDocument()
    expect(row(/Bug 反馈整理/)).toBeInTheDocument()
  })

  it('closes the menu with Escape and supports arrow keys', async () => {
    const { user } = renderDemoApp()
    openMenu(row(/GitHub 数据日报/))
    expect(toggle('置顶')).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(toggle('未读')).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(toggle('置顶')).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(item('移至')).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('menu', { name: '移至' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: '移至' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('sidebar width', () => {
  it('collapses the list into bot icons on the rail, and expands it again', async () => {
    const { user } = renderDemoApp()
    await user.click(screen.getByRole('button', { name: '收起侧边栏' }))
    expect(screen.queryByText('我的 App')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GitHub 数据日报' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '展开侧边栏' }))
    expect(screen.getByText('我的 App')).toBeInTheDocument()
  })

  it('drags the sidebar: follows the pointer, collapses below 216, re-expands from 228', () => {
    renderDemoApp()
    const handle = () => screen.getByRole('separator', { name: '调整侧边栏宽度' })
    const drag = (pointerId: number, from: number, ...to: number[]) => {
      fireEvent.pointerDown(handle(), { pointerId, clientX: from })
      to.forEach((x) => fireEvent.pointerMove(handle(), { pointerId, clientX: x }))
      fireEvent.pointerUp(handle(), { pointerId })
    }
    expect(handle()).toHaveAttribute('aria-valuenow', '288')

    drag(1, 288, 330, 999) // wider, clamped at 392
    expect(handle()).toHaveAttribute('aria-valuenow', '392')
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100 }) // released: ignored
    expect(handle()).toHaveAttribute('aria-valuenow', '392')

    drag(2, 392, 300, 230) // 230 is under the 260 minimum: holds at 260, still expanded
    expect(handle()).toHaveAttribute('aria-valuenow', '260')
    expect(screen.getByRole('button', { name: '收起侧边栏' })).toBeInTheDocument()

    drag(3, 260, 215) // pointer width 215 < 216: the list folds away, the rail stays
    expect(handle()).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('button', { name: '展开侧边栏' })).toBeInTheDocument()

    drag(4, 0, 227) // 227: still inside the dead zone
    expect(screen.getByRole('button', { name: '展开侧边栏' })).toBeInTheDocument()
    drag(5, 0, 228, 300) // 228 expands; then follows the pointer
    expect(handle()).toHaveAttribute('aria-valuenow', '300')
    expect(localStorage.getItem('nengyongbot:sidebarWidth')).toBe('300')
    expect(localStorage.getItem('nengyongbot:sidebarCollapsed')).toBe('false')
  })

  it('resizes with the keyboard: Home, End and arrows across the rail boundary', () => {
    renderDemoApp()
    const handle = () => screen.getByRole('separator', { name: '调整侧边栏宽度' })
    const press = (key: string) => fireEvent.keyDown(handle(), { key })
    press('ArrowRight')
    expect(handle()).toHaveAttribute('aria-valuenow', '308')
    press('Home')
    expect(handle()).toHaveAttribute('aria-valuenow', '0')
    press('ArrowLeft') // already collapsed: stays
    expect(handle()).toHaveAttribute('aria-valuenow', '0')
    press('ArrowRight') // out of the rail straight to the 260 minimum
    expect(handle()).toHaveAttribute('aria-valuenow', '260')
    press('ArrowLeft') // at 260: collapses
    expect(handle()).toHaveAttribute('aria-valuenow', '0')
    press('End')
    expect(handle()).toHaveAttribute('aria-valuenow', '392')
    fireEvent.keyDown(handle(), { key: 'Home', metaKey: true }) // modified keys are left alone
    expect(handle()).toHaveAttribute('aria-valuenow', '392')
  })
})

describe('sidebar rail', () => {
  it('opens the settings on the 用量 page', async () => {
    const { user } = renderDemoApp()
    await user.click(screen.getByRole('button', { name: '用量' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: '用量' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens the settings on the model page from 设置', async () => {
    const { user } = renderDemoApp()
    await user.click(screen.getByRole('button', { name: '设置' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: '模型服务' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('sidebar search', () => {
  const search = () => screen.getByRole('searchbox', { name: '搜索 Bot' })

  it('counts the unread replies in the search field and lists only those bots while the count is pressed', async () => {
    const { user } = renderDemoApp()
    expect(screen.queryByRole('button', { name: /只看有未读的 Bot/ })).not.toBeInTheDocument()
    openMenu(row(/Bug 反馈整理/))
    await user.click(toggle('未读'))
    openMenu(row(/GitHub 数据日报/))
    await user.click(toggle('未读'))
    await user.click(screen.getByRole('button', { name: '只看有未读的 Bot（共 2 条未读）' }))
    expect(screen.getByText('未读 · 2 个')).toBeInTheDocument()
    expect(row(/GitHub 数据日报/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /健身教练/ })).not.toBeInTheDocument()
  })

  it('keeps a bot opened from the unread list there until the list is let go', async () => {
    const { user } = renderDemoApp()
    openMenu(row(/Bug 反馈整理/))
    await user.click(toggle('未读'))
    await user.click(screen.getByRole('button', { name: /只看有未读的 Bot/ }))
    await user.click(row(/Bug 反馈整理/))
    expect(screen.getByText('未读 · 0 个')).toBeInTheDocument()
    expect(row(/Bug 反馈整理/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '看全部' }))
    expect(section('生活')).toBeInTheDocument()
  })

  it('puts the counts away while a query is typed', async () => {
    const { user } = renderDemoApp()
    const busyCount = await screen.findByRole('button', { name: /只看在干活的 Bot/ })
    await user.type(search(), 'g')
    expect(busyCount).not.toBeInTheDocument()
    await user.clear(search())
    expect(await screen.findByRole('button', { name: /只看在干活的 Bot/ })).toBeInTheDocument()
  })

  it('lists the bots whose names match, without the sections and the pinned grid', async () => {
    const { user } = renderDemoApp()
    await user.type(search(), 'g')
    expect(screen.queryByRole('region', { name: '我的 App' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '置顶区' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /GitHub 数据日报/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bug 反馈整理/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /健身教练/ })).not.toBeInTheDocument()
  })

  it('matches names regardless of case and finds hidden bots too', async () => {
    const { user } = renderDemoApp()
    openMenu(row(/Bug 反馈整理/))
    await user.click(item('藏起来'))
    await user.type(search(), 'bug')
    expect(screen.getByRole('button', { name: /Bug 反馈整理/ })).toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    const { user } = renderDemoApp()
    await user.type(search(), '不存在的名字')
    expect(screen.getByText('没有找到「不存在的名字」')).toBeInTheDocument()
  })

  it('clears with Escape and brings the sections back', async () => {
    const { user } = renderDemoApp()
    await user.type(search(), 'g{Escape}')
    expect(search()).toHaveValue('')
    expect(section('我的 App')).toBeInTheDocument()
  })

  it('opens a bot picked from the results', async () => {
    const { user } = renderDemoApp()
    await user.type(search(), '健身')
    await user.click(screen.getByRole('button', { name: /健身教练/ }))
    expect(screen.getByRole('textbox', { name: '跟 健身教练 说点什么' })).toBeInTheDocument()
  })
})

describe('bot status', () => {
  const dot = (name: RegExp, label: string) => within(row(name)).queryByRole('img', { name: label })

  it('shows a bot running a task with a turning disc and what it runs', async () => {
    renderDemoApp()
    expect(await within(row(/发版助理/)).findByRole('img', { name: '在干活' })).toBeInTheDocument()
    expect(within(row(/发版助理/)).getByText(/在跑「PR #491 能不能合」/)).toBeInTheDocument()
  })

  it('flags a failed task until the bot is opened', async () => {
    const { user } = renderDemoApp()
    expect(await within(row(/Bug 反馈整理/)).findByText(/「整理本周 Bug 反馈」没跑成/)).toBeInTheDocument()
    await user.click(row(/Bug 反馈整理/))
    await user.click(row(/健身教练/))
    expect(dot(/Bug 反馈整理/, '没跑成')).not.toBeInTheDocument()
  })

  it('remembers after a restart that a failure was seen', async () => {
    const { user, unmount, bridge } = renderDemoApp()
    await within(row(/Bug 反馈整理/)).findByRole('img', { name: '没跑成' })
    await user.click(row(/Bug 反馈整理/))
    await user.click(row(/健身教练/))
    unmount()
    renderDemoApp(bridge, (await bridge.getSidebar()) ?? undefined)
    await within(row(/发版助理/)).findByRole('img', { name: '在干活' })
    expect(dot(/Bug 反馈整理/, '没跑成')).not.toBeInTheDocument()
  })

  it('counts the bots at work and those that failed on a collapsed section', async () => {
    const { user } = renderDemoApp()
    await within(row(/发版助理/)).findByRole('img', { name: '在干活' })
    await user.click(header('我的 App'))
    expect(within(header('我的 App')).getByRole('img', { name: '在干活' })).toBeInTheDocument()
    expect(within(header('我的 App')).getByRole('img', { name: '没跑成' })).toBeInTheDocument()
  })

  it('lists only the bots at work while their count in the search field is pressed', async () => {
    const { user } = renderDemoApp()
    await user.click(await screen.findByRole('button', { name: /只看在干活的 Bot/ }))
    expect(screen.getByText('在干活 · 2 个')).toBeInTheDocument()
    expect(row(/发版助理/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /健身教练/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '看全部' }))
    expect(section('生活')).toBeInTheDocument()
  })

  it('shows when an idle bot next runs a routine', async () => {
    renderDemoApp()
    expect(await within(row(/GitHub 数据日报/)).findByText('下次例行任务')).toBeInTheDocument()
  })

  it('tells why a task failed in the card shown while the pointer rests on the bot', async () => {
    const { user } = renderDemoApp()
    await within(row(/Bug 反馈整理/)).findByRole('img', { name: '没跑成' })
    await user.hover(row(/Bug 反馈整理/))
    const card = await screen.findByRole('tooltip')
    expect(within(card).getByText('连不上 GitHub：等了 30 秒没响应')).toBeInTheDocument()
    await user.unhover(row(/Bug 反馈整理/))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
