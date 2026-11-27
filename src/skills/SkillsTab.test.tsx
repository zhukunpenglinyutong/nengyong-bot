import { act, cleanup, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { NengyongBotBridge } from '../../shared/bridge'
import { createDemoBridge } from '../demo/demoBridge'
import { renderDemoApp } from '../demo/renderDemoApp'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const panel = () => screen.getByRole('complementary', { name: 'Bot 详情' })

// a skill's text is read when it is shown and suspends until then; outside act, the test environment never lets it resume
const settle = (click: () => Promise<void>) =>
  act(async () => {
    await click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

/** Opens a demo bot's chat (the main bot's is open at the start), then its panel at Bot 核心 · 技能. */
async function openSkills(botName: RegExp | null, bridge: NengyongBotBridge = createDemoBridge()) {
  const demo = renderDemoApp(bridge)
  if (botName) await demo.user.click(screen.getByRole('button', { name: botName }))
  await demo.user.click(screen.getByRole('button', { name: '展开面板' }))
  await demo.user.click(within(panel()).getByRole('button', { name: /^Bot 核心/ }))
  await demo.user.click(within(panel()).getByRole('button', { name: /^技能/ }))
  return demo
}

type User = ReturnType<typeof renderDemoApp>['user']

/** Unfolds the collection of skills from one place, e.g. anthropics/skills; the list is folded at first. */
async function openCollection(user: User, name: string) {
  await user.click(within(panel()).getByRole('button', { name: new RegExp(`^${name}`), expanded: false }))
  return within(within(panel()).getByRole('list', { name }))
}

/** Picks a skill folder or archive from the panel's 上传技能 menu. */
async function pickUpload(user: User, item: '技能文件夹' | '压缩包') {
  await user.click(within(panel()).getByRole('button', { name: '上传技能' }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}

it('lists the skills of a bot, opens one with its scripts and uses, and goes back', async () => {
  const { user } = await openSkills(/GitHub 数据日报/)
  const list = await openCollection(user, 'anthropics/skills')
  await settle(() => user.click(list.getByRole('button', { name: /pdf.*带 3 个脚本/ })))
  expect(within(panel()).getByRole('heading', { name: 'pdf' })).toBeInTheDocument()
  expect(within(panel()).getByText(/v1\.3\.0 · 来自 anthropics\/skills/)).toBeInTheDocument()
  expect(within(within(panel()).getByRole('list', { name: '带的脚本' })).getAllByRole('listitem')).toHaveLength(3)
  expect(within(panel()).getByRole('heading', { name: 'PDF Processing Guide' })).toBeInTheDocument()

  await user.click(within(panel()).getByRole('button', { name: '返回技能列表' }))
  expect(within(panel()).getByRole('list', { name: 'anthropics/skills' })).toBeInTheDocument()
})

it('folds each collection until opened, and folds it again on a second press', async () => {
  const { user } = await openSkills(/GitHub 数据日报/)
  expect(within(panel()).queryByRole('list', { name: 'anthropics/skills' })).not.toBeInTheDocument()
  await openCollection(user, 'anthropics/skills')
  await user.click(within(panel()).getByRole('button', { name: /^anthropics\/skills/, expanded: true }))
  expect(
    await within(panel()).findByRole('button', { name: /^anthropics\/skills/, expanded: false }),
  ).toBeInTheDocument()
})

it('lists the skills from one place together, and removes all of them at once once confirmed', async () => {
  const { user } = await openSkills(/GitHub 数据日报/)
  const collection = await openCollection(user, 'anthropics/skills')
  expect(collection.getAllByRole('listitem')).toHaveLength(2)
  await user.click(within(panel()).getByRole('button', { name: '全部卸载' }))
  const dialog = await screen.findByRole('dialog', { name: '卸载 anthropics/skills 的 2 个技能？' })
  await user.click(within(dialog).getByRole('button', { name: '卸载' }))
  expect(await within(panel()).findByRole('status')).toHaveTextContent('已卸载 pdf、docx')
  expect(within(panel()).getByText('还没有技能。')).toBeInTheDocument()
})

it('names the folder a lone skill came from, with nothing to remove all at once', async () => {
  const { user } = await openSkills(/发版助理/)
  expect((await openCollection(user, 'changelog-writer')).getAllByRole('listitem')).toHaveLength(1)
  expect(within(panel()).queryByRole('button', { name: '全部卸载' })).not.toBeInTheDocument()
})

it('says so when a bot has no skills, and offers to install one in the chat', async () => {
  const { user } = await openSkills(/Bug 反馈整理/)
  expect(within(panel()).getByText('还没有技能。')).toBeInTheDocument()
  await user.click(within(panel()).getByRole('button', { name: /给它装一个技能/ }))
  expect(screen.getByRole('textbox', { name: '跟 Bug 反馈整理 说点什么' }).textContent).toBe('帮我装一个技能：')
})

it("shows the main bot every bot's skills, under the bot that has each, folded until opened", async () => {
  const { user } = await openSkills(null)
  expect(within(panel()).getByRole('heading', { name: /GitHub 数据日报/ })).toBeInTheDocument()
  expect(within(panel()).getByRole('heading', { name: /发版助理/ })).toBeInTheDocument()
  expect(within(panel()).queryAllByRole('list', { name: 'anthropics/skills' })).toHaveLength(0)
  expect(within(panel()).getByText('其他 Bot 暂时无技能。')).toBeInTheDocument()
  await user.click(within(panel()).getByRole('button', { name: /GitHub 数据日报/, expanded: false }))
  expect((await openCollection(user, 'anthropics/skills')).getAllByRole('listitem')).toHaveLength(2)
})

it("keeps the main bot's opened group open after going back from one of its skills", async () => {
  const { user } = await openSkills(null)
  await user.click(within(panel()).getByRole('button', { name: /GitHub 数据日报/, expanded: false }))
  const list = await openCollection(user, 'anthropics/skills')
  await settle(() => user.click(list.getByRole('button', { name: /pdf/ })))
  await user.click(within(panel()).getByRole('button', { name: '返回技能列表' }))
  expect(within(panel()).getByRole('button', { name: /GitHub 数据日报/, expanded: true })).toBeInTheDocument()
  expect(within(panel()).getByRole('button', { name: /^anthropics\/skills/, expanded: true })).toBeInTheDocument()
})

it("shows a skill's files, SKILL.md first, and a script with a word on what runs it", async () => {
  const { user } = await openSkills(/GitHub 数据日报/)
  const list = await openCollection(user, 'anthropics/skills')
  await settle(() => user.click(list.getByRole('button', { name: /pdf/ })))
  await settle(() => user.click(within(panel()).getByRole('button', { name: '看全部文件' })))
  const dialog = screen.getByRole('dialog', { name: 'pdf 的文件' })
  const files = within(dialog).getByRole('navigation', { name: '文件' })
  expect(within(files).getAllByRole('button')[0]).toHaveAccessibleName(/SKILL\.md/)
  await settle(() => user.click(within(files).getByRole('button', { name: /fill_fillable_fields\.py/ })))
  expect(within(dialog).getByText(/后台任务会用 run_command/)).toBeInTheDocument()
})

it('removes a skill once confirmed, and says so', async () => {
  const { user } = await openSkills(/发版助理/)
  const list = await openCollection(user, 'changelog-writer')
  await settle(() => user.click(list.getByRole('button', { name: /changelog-writer/ })))
  await user.click(within(panel()).getByRole('button', { name: '卸载' }))
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '卸载' }))
  expect(await within(panel()).findByRole('status')).toHaveTextContent('已卸载 changelog-writer')
  expect(within(panel()).getByText('还没有技能。')).toBeInTheDocument()
})

it('installs a skill only once the user says yes on the card the tray above the message box opens', async () => {
  const { user } = await openSkills(/Bug 反馈整理/)
  const box = screen.getByRole('textbox', { name: '跟 Bug 反馈整理 说点什么' })
  await user.type(box, 'https://github.com/anthropics/skills/tree/main/skills/xlsx{Enter}')
  const messages = screen.getByTestId('messages')
  expect(await within(messages).findByRole('button', { name: /装上 xlsx？/ }, { timeout: 3000 })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '看一看' }))
  await user.click(screen.getByRole('button', { name: '装上' }))
  expect(await within(messages).findByText('已装上 xlsx')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '看一看' })).not.toBeInTheDocument()
  expect(await screen.findByRole('button', { name: /学会了新技能\s*xlsx/ })).toBeInTheDocument()
  expect((await openCollection(user, 'anthropics/skills')).getByRole('button', { name: /xlsx/ })).toBeInTheDocument()
})

it('uploads skills from this computer: one card in the panel, the ticked ones installed, nothing in the chat', async () => {
  const { user } = await openSkills(/Bug 反馈整理/)
  await pickUpload(user, '技能文件夹')
  expect(within(panel()).getByText('还没有技能。')).toBeInTheDocument()
  const upload = within(panel()).getByRole('region', { name: '上传技能' })
  await user.click(await within(upload).findByRole('checkbox', { name: /^pdf/ }))
  await user.click(within(upload).getByRole('checkbox', { name: /^docx/ }))
  await user.click(within(upload).getByRole('checkbox', { name: /^changelog-writer/ }))
  await user.click(within(upload).getByRole('button', { name: '装上 1 个' }))
  expect(await within(upload).findByText('已装上 xlsx')).toBeInTheDocument()
  expect((await openCollection(user, 'anthropics/skills')).getByRole('button', { name: /xlsx/ })).toBeInTheDocument()
  expect(within(screen.getByTestId('messages')).queryByText(/xlsx/)).not.toBeInTheDocument()
})

it('offers the upload only on the skills side', async () => {
  const { user } = await openSkills(/Bug 反馈整理/)
  expect(within(panel()).getByRole('button', { name: '上传技能' })).toBeInTheDocument()
  await user.click(within(panel()).getByRole('button', { name: /^流程/ }))
  expect(within(panel()).queryByRole('button', { name: '上传技能' })).not.toBeInTheDocument()
})

it('says why an upload could not be read', async () => {
  const bridge = createDemoBridge()
  const { user } = await openSkills(/Bug 反馈整理/, {
    ...bridge,
    uploadSkill: async () => {
      throw new Error('压缩包坏了，或者不是 .zip 格式')
    },
  })
  await pickUpload(user, '压缩包')
  expect(await within(panel()).findByRole('alert')).toHaveTextContent('没读出来：压缩包坏了')
})

it('installs nothing from a card with every skill unticked', async () => {
  const { user } = await openSkills(/Bug 反馈整理/)
  await pickUpload(user, '技能文件夹')
  await user.click(await within(panel()).findByRole('button', { name: '全不选' }))
  expect(within(panel()).getByRole('button', { name: '装上 0 个' })).toBeDisabled()
  await user.click(within(panel()).getByRole('button', { name: '全选' }))
  expect(within(panel()).getByRole('button', { name: '装上 4 个' })).toBeEnabled()
})

it('lists the skills an upload found but cannot install, with why', async () => {
  const { user } = await openSkills(/Bug 反馈整理/)
  await pickUpload(user, '技能文件夹')
  expect(await within(panel()).findByText('1 个装不了')).toBeInTheDocument()
  expect(within(panel()).getByText(/^notes：SKILL\.md 开头缺少 description/)).toBeInTheDocument()
})

it('keeps the card it showed when the user cancels the next pick', async () => {
  const bridge = createDemoBridge()
  let isCancelled = false
  const { user } = await openSkills(/Bug 反馈整理/, {
    ...bridge,
    uploadSkill: (botId, kind) => (isCancelled ? Promise.resolve(null) : bridge.uploadSkill(botId, kind)),
  })
  await pickUpload(user, '技能文件夹')
  expect(await within(panel()).findByRole('button', { name: '装上 4 个' })).toBeInTheDocument()
  isCancelled = true
  await pickUpload(user, '压缩包')
  expect(within(panel()).getByRole('button', { name: '装上 4 个' })).toBeInTheDocument()
})
