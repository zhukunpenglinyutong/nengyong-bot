import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { renderDemoApp } from '../demo/renderDemoApp'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('opens the panel, toggles the routine, filters the library, and closes', async () => {
  const { user } = renderDemoApp()
  await user.click(screen.getByRole('button', { name: '展开面板' }))
  const panel = screen.getByRole('complementary', { name: 'Bot 详情' })

  const sw = await within(panel).findByRole('switch', { name: 'AI 编程与开源动态简报' })
  expect(sw).toHaveAttribute('aria-checked', 'false')
  expect(within(panel).getByText('已暂停')).toBeInTheDocument()
  await user.click(sw)
  expect(sw).toHaveAttribute('aria-checked', 'true')
  expect(within(panel).getByText(/^下次 /)).toBeInTheDocument()

  await user.click(within(panel).getByRole('button', { name: '资料库' }))
  expect(within(panel).getAllByText(/截图|json|同步/)).toHaveLength(5)
  await user.click(within(panel).getByRole('button', { name: '图片影音' }))
  expect(within(panel).getByRole('button', { name: /同步设置页截图\.png/ })).toBeInTheDocument()
  expect(within(panel).queryByText('sync/同步方案草稿.md')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '收起面板' }))
  expect(screen.queryByRole('complementary', { name: 'Bot 详情' })).not.toBeInTheDocument()
})

const openChiefPanel = async ({ isDebug = true } = {}) => {
  localStorage.setItem('nengyongbot:preferences', JSON.stringify({ isDebug }))
  const { user, bridge } = renderDemoApp()
  await user.click(screen.getByRole('button', { name: '展开面板' }))
  return { user, bridge, panel: screen.getByRole('complementary', { name: 'Bot 详情' }) }
}

it('shows which models the bot works with, read only, and how to change them', async () => {
  const { panel } = await openChiefPanel()
  const models = within(panel).getByRole('list', { name: '模型' })
  expect(within(models).getByText('跟随主模型')).toBeInTheDocument()
  expect(within(models).getAllByText('deepseek-flash')).toHaveLength(2)
  expect(within(models).queryByRole('button')).not.toBeInTheDocument()
  expect(within(panel).getByText(/想换模型，直接跟它说/)).toBeInTheDocument()
})

it('shows a running task with its progress, and stops it', async () => {
  const { user, panel } = await openChiefPanel({ isDebug: true })
  const running = within(panel).getByRole('list', { name: '进行中' })
  expect(within(running).getByText('写同步方案草稿')).toBeInTheDocument()
  expect(within(running).getByText(/对比三种冲突处理办法/)).toBeInTheDocument()
  await user.click(within(running).getByRole('button', { name: '停止任务 写同步方案草稿' }))
  expect(within(panel).queryByRole('list', { name: '进行中' })).not.toBeInTheDocument()
  const recent = within(panel).getByRole('list', { name: '最近任务' })
  expect(rowOf(recent, '写同步方案草稿').getByRole('img', { name: '已停止' })).toBeInTheDocument()
})

it('hides recent tasks until debug mode is turned on in the settings', async () => {
  const { user, panel } = await openChiefPanel({ isDebug: false })
  expect(within(panel).queryByRole('list', { name: '最近任务' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '设置' }))
  await user.click(screen.getByRole('button', { name: '通用' }))
  await user.click(screen.getByRole('switch', { name: '调试模式' }))
  await user.click(screen.getByRole('button', { name: '关闭' }))
  expect(within(panel).getByRole('list', { name: '最近任务' })).toBeInTheDocument()
})

it('lists recent tasks with how they ended, who asked for them and whether a routine started them', async () => {
  const { panel } = await openChiefPanel({ isDebug: true })
  const recent = within(panel).getByRole('list', { name: '最近任务' })
  expect(rowOf(recent, '本周进度汇总').getByRole('img', { name: '完成' })).toBeInTheDocument()
  expect(rowOf(recent, '本周进度汇总').getByText('例行')).toBeInTheDocument()
  expect(rowOf(recent, '核对报销发票').getByRole('img', { name: '失败' })).toBeInTheDocument()
  expect(rowOf(recent, '核对报销发票').getByText('来自 秘书Bot')).toBeInTheDocument()
})

function rowOf(list: HTMLElement, title: string) {
  const row = within(list).getByText(title).closest('li')
  if (!row) throw new Error(`没有「${title}」这一行`)
  return within(row)
}

const openSecretaryPanelWith = async (user: ReturnType<typeof renderDemoApp>['user']) => {
  await user.click(screen.getByRole('button', { name: /秘书Bot/ }))
  await user.click(screen.getByRole('button', { name: '展开面板' }))
}

const openSecretaryPanel = async () => {
  const { user } = renderDemoApp()
  await openSecretaryPanelWith(user)
  return user
}

it('reports why a library file could not be opened', async () => {
  const { user } = renderDemoApp()
  await user.click(screen.getByRole('button', { name: '展开面板' }))
  const panel = screen.getByRole('complementary', { name: 'Bot 详情' })
  await user.click(within(panel).getByRole('button', { name: '资料库' }))
  await user.click(await within(panel).findByRole('button', { name: /同步方案草稿\.md/ }))
  expect(await screen.findByText(/打开文件失败：网页版不能做这件事/)).toBeInTheDocument()
})

it('shows an empty feed for bots without routines', async () => {
  await openSecretaryPanel()
  expect(screen.getByText('暂无近况')).toBeInTheDocument()
})

it('shows an empty library for bots without data', async () => {
  const user = await openSecretaryPanel()
  await user.click(screen.getByRole('button', { name: '资料库' }))
  expect(screen.getByText('暂无资料')).toBeInTheDocument()
})

it('resizes the panel from its left edge, clamps it, and closes below 296', async () => {
  const { innerWidth } = window
  window.innerWidth = 1164
  const { user } = renderDemoApp()
  await user.click(screen.getByRole('button', { name: '展开面板' }))
  const handle = () => screen.getByRole('separator', { name: '调整详情面板宽度' })
  const drag = (from: number, to: number) => {
    fireEvent.pointerDown(handle(), { pointerId: 1, clientX: from })
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: to })
    fireEvent.pointerUp(handle(), { pointerId: 1 })
  }
  expect(handle()).toHaveAttribute('aria-valuenow', '336')
  // max = 1164 window - 60 rail - 288 list - 440 main = 376
  drag(500, 480) // wider by 20
  expect(handle()).toHaveAttribute('aria-valuenow', '356')
  drag(500, 530) // 356 - 30 = 326: held at the 336 minimum
  expect(handle()).toHaveAttribute('aria-valuenow', '336')
  drag(500, 300) // much wider: clamped
  expect(handle()).toHaveAttribute('aria-valuenow', '376')
  expect(localStorage.getItem('nengyongbot:panelWidth')).toBe('376')
  drag(500, 590) // 376 - 90 = 286 < 296: closes on release
  await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Bot 详情' })).not.toBeInTheDocument())
  window.innerWidth = innerWidth
})

it('reopens the panel when dragged back to 308 before release, and stays closing inside the dead zone', async () => {
  const { user } = renderDemoApp()
  await user.click(screen.getByRole('button', { name: '展开面板' }))
  const handle = () => screen.getByRole('separator', { name: '调整详情面板宽度' })
  const drag = (from: number, ...to: number[]) => {
    fireEvent.pointerDown(handle(), { pointerId: 1, clientX: from })
    to.forEach((x) => fireEvent.pointerMove(handle(), { pointerId: 1, clientX: x }))
    fireEvent.pointerUp(handle(), { pointerId: 1 })
  }
  drag(500, 590, 520) // 246 closes, back to 316 reopens at the 336 minimum
  expect(handle()).toHaveAttribute('aria-valuenow', '336')
  drag(500, 554, 530) // 282 closes, back to 306: still under 308, closes on release
  await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Bot 详情' })).not.toBeInTheDocument())
})

it('edits the avatar from the panel: each pick applies and is saved, Esc and an outside press close the picker', async () => {
  const { user, bridge } = renderDemoApp()
  await openSecretaryPanelWith(user)
  const panel = screen.getByRole('complementary', { name: 'Bot 详情' })
  const trigger = within(panel).getByRole('button', { name: '换头像' })

  await user.click(trigger)
  const editor = within(panel).getByRole('dialog', { name: '换个样子' })
  expect(within(editor).getByRole('radio', { name: '幸运草' })).toHaveAttribute('aria-checked', 'true')
  await user.click(within(editor).getByRole('radio', { name: '猫猫' }))
  await user.click(within(editor).getByRole('radio', { name: '天空' }))
  expect(within(editor).getByRole('radio', { name: '猫猫' })).toHaveAttribute('aria-checked', 'true')
  expect((await bridge.getSidebar())?.bots).toContainEqual(
    expect.objectContaining({ id: 'secretary', shape: 'cat', color: '#4A8CFF' }),
  )

  await user.keyboard('{Escape}')
  expect(within(panel).queryByRole('dialog', { name: '换个样子' })).not.toBeInTheDocument()
  await user.click(trigger)
  await user.click(within(panel).getByRole('button', { name: '近况' }))
  expect(within(panel).queryByRole('dialog', { name: '换个样子' })).not.toBeInTheDocument()
})

it('dresses the bot from the outfit page: an unlocked piece goes on and comes off, a locked one says how far off it is', async () => {
  const { user, bridge } = renderDemoApp()
  await openSecretaryPanelWith(user)
  await user.click(screen.getByRole('button', { name: '换头像' }))
  const editor = screen.getByRole('dialog', { name: '换个样子' })
  await user.click(within(editor).getByRole('button', { name: '装扮' }))
  const outfitOf = async () => (await bridge.getSidebar())?.bots.find((bot) => bot.id === 'secretary')?.outfit

  await user.click(within(editor).getByRole('button', { name: '派对帽' }))
  expect(within(editor).getByRole('button', { name: '派对帽' })).toHaveAttribute('aria-pressed', 'true')
  expect(await outfitOf()).toEqual(['partyHat'])

  await user.click(within(editor).getByRole('button', { name: '彩虹冠，Lv.99 解锁' }))
  expect(within(editor).getByRole('status')).toHaveTextContent(/^彩虹冠要到 Lv\.99「满级」，还差 \d+ 级$/)
  expect(await outfitOf()).toEqual(['partyHat'])

  await user.click(within(editor).getByRole('button', { name: '摘下头饰' }))
  expect(await outfitOf()).toEqual([])
})

it('lets the main bot take its gold crown off and put it back whatever its level', async () => {
  const { user, panel, bridge } = await openChiefPanel()
  await user.click(within(panel).getByRole('button', { name: '换头像' }))
  await user.click(within(panel).getByRole('button', { name: '装扮' }))
  const crown = within(panel).getByRole('button', { name: '金冠' })
  const outfitOf = async () => (await bridge.getSidebar())?.bots.find((bot) => bot.id === 'chief')?.outfit
  expect(crown).toHaveAttribute('aria-pressed', 'true')

  await user.click(crown)
  expect(await outfitOf()).toEqual([])
  await user.click(crown)
  expect(await outfitOf()).toEqual(['goldCrown'])
})

it('closes the avatar picker when its button is pressed again', async () => {
  const { user } = renderDemoApp()
  await openSecretaryPanelWith(user)
  const trigger = screen.getByRole('button', { name: '换头像' })
  await user.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await user.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('dialog', { name: '换个样子' })).not.toBeInTheDocument()
})

it('renames the bot from the panel title with Enter, and the sidebar follows', async () => {
  const { user, bridge } = renderDemoApp()
  await openSecretaryPanelWith(user)
  const field = screen.getByRole('textbox', { name: 'Bot 名称' })
  await user.clear(field)
  await user.type(field, '  日程秘书  {enter}')
  expect(screen.getByRole('textbox', { name: 'Bot 名称' })).toHaveValue('日程秘书')
  expect(screen.getByRole('textbox', { name: '跟 日程秘书 说点什么' })).toBeInTheDocument()
  expect((await bridge.getSidebar())?.bots).toContainEqual(
    expect.objectContaining({ id: 'secretary', name: '日程秘书' }),
  )
})

it('keeps the old name when the panel title is left blank or the edit is cancelled with Esc', async () => {
  const { user } = renderDemoApp()
  await openSecretaryPanelWith(user)
  const field = screen.getByRole('textbox', { name: 'Bot 名称' })
  await user.clear(field)
  await user.tab()
  expect(screen.getByRole('textbox', { name: 'Bot 名称' })).toHaveValue('秘书Bot')

  await user.type(screen.getByRole('textbox', { name: 'Bot 名称' }), '改了一半{Escape}')
  await user.tab()
  expect(screen.getByRole('textbox', { name: 'Bot 名称' })).toHaveValue('秘书Bot')
  expect(screen.getByRole('textbox', { name: '跟 秘书Bot 说点什么' })).toBeInTheDocument()
})
