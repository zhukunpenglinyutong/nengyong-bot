import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAIN_BOT, secretary } from '../shared/bot'
import { EMPTY_MCP_CONFIG, type HarnessEvent, type NengyongBotBridge, type TaskView } from '../shared/bridge'
import { BYTES_PER_MB, DEFAULT_LIMITS, type Limits, MESSAGE_MAX_CHARS } from '../shared/limits'
import type { ModelServicesView } from '../shared/modelServices'
import type { UsageView } from '../shared/usage'
import { App } from './App'
import { DEMO_SIDEBAR } from './demo/demoData'
import { renderDemoApp } from './demo/renderDemoApp'
import { RELEASES } from './settings/releases'
import { dutyOf } from '../shared/duty'

describe('App on the demo bridge', () => {
  it('shows the chief thread by default', async () => {
    renderDemoApp()
    expect(screen.getByRole('textbox', { name: '跟 小满 说点什么' })).toBeInTheDocument()
    expect(await screen.findByText('可以')).toBeInTheDocument()
  })

  it('switches bot from the sidebar', async () => {
    const { user } = renderDemoApp()
    await user.click(screen.getByRole('button', { name: /健身教练/ }))
    expect(screen.getByRole('textbox', { name: '跟 健身教练 说点什么' })).toBeInTheDocument()
    expect(await screen.findByText('最新进展怎么样？')).toBeInTheDocument()
    expect(screen.queryByText('可以')).not.toBeInTheDocument()
  })

  it('renders sent text literally and then auto-replies', async () => {
    const { user } = renderDemoApp()
    const input = screen.getByRole('textbox', { name: '跟 小满 说点什么' })
    await user.type(input, '<img src=x onerror=alert(1)>{enter}')
    const list = screen.getByTestId('messages')
    expect(within(list).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(list.querySelector('img')).toBeNull()
    expect(input).toBeEmptyDOMElement()
    expect(await screen.findByText(/收到，已记录/, undefined, { timeout: 3000 })).toBeInTheDocument()
  })

  it('ignores blank messages', async () => {
    const { user } = renderDemoApp()
    await screen.findByText('可以') // the history has loaded
    const before = screen.getByTestId('messages').children.length
    await user.type(screen.getByRole('textbox', { name: /说点什么/ }), '   {enter}')
    expect(screen.getByTestId('messages').children.length).toBe(before)
  })

  it('restores selection, sidebar and panel after a reload', async () => {
    const { user, unmount } = renderDemoApp()
    await user.click(screen.getByRole('button', { name: '展开面板' }))
    await user.click(screen.getByRole('button', { name: '收起侧边栏' }))
    await user.click(screen.getByRole('button', { name: '健身教练' }))
    unmount()

    renderDemoApp()
    expect(screen.getByRole('textbox', { name: '跟 健身教练 说点什么' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开侧边栏' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Bot 详情' })).toBeInTheDocument()
  })

  it('falls back to defaults when stored state is corrupted or stale', () => {
    localStorage.setItem('nengyongbot:botId', '"deleted-bot"')
    localStorage.setItem('nengyongbot:sidebarWidth', '99999')
    localStorage.setItem('nengyongbot:sidebarCollapsed', '{not json')
    renderDemoApp()
    expect(screen.getByRole('textbox', { name: '跟 小满 说点什么' })).toBeInTheDocument()
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '392')
  })

  it('narrows a wide panel so the chat keeps its room when the sidebar expands or the window shrinks', async () => {
    localStorage.setItem('nengyongbot:panelOpen', 'true')
    localStorage.setItem('nengyongbot:panelWidth', '900')
    localStorage.setItem('nengyongbot:sidebarCollapsed', 'true')
    const { user } = renderDemoApp()
    const panelWidth = () => screen.getByRole('separator', { name: '调整详情面板宽度' }).getAttribute('aria-valuenow')
    expect(panelWidth()).toBe(String(window.innerWidth - 92 - 440))

    await user.click(screen.getByRole('button', { name: '展开侧边栏' }))
    expect(panelWidth()).toBe(String(Math.max(336, window.innerWidth - 60 - 288 - 440)))

    const { innerWidth } = window
    window.innerWidth = 1600
    act(() => window.dispatchEvent(new Event('resize')))
    expect(panelWidth()).toBe('812')
    window.innerWidth = innerWidth
  })

  it('avatar reacts: thinking while the reply is pending, happy when it lands, then idle', async () => {
    const { user } = renderDemoApp()
    const avatarStates = () =>
      [...document.querySelectorAll('[data-activity]')]
        .filter((el) => el.closest('button')?.textContent?.includes('小满'))
        .map((el) => el.getAttribute('data-activity'))
    expect(new Set(avatarStates())).toEqual(new Set(['idle']))

    await user.type(screen.getByRole('textbox', { name: /说点什么/ }), '在吗{enter}')
    expect(new Set(avatarStates())).toEqual(new Set(['thinking']))
    // other bots are unaffected
    expect(screen.getByRole('button', { name: /健身教练/ }).querySelector('[data-activity]')).toHaveAttribute(
      'data-activity',
      'idle',
    )

    await waitFor(() => expect(new Set(avatarStates())).toEqual(new Set(['happy'])), { timeout: 3000 })
    await waitFor(() => expect(new Set(avatarStates())).toEqual(new Set(['idle'])), { timeout: 3000 })
  })

  it('shows an attached image in the thread after sending it', async () => {
    const { user } = renderDemoApp()
    await user.upload(
      screen.getByLabelText('选择附件'),
      new File([new Uint8Array([1])], '截图.png', { type: 'image/png' }),
    )
    await user.type(screen.getByRole('textbox', { name: /说点什么/ }), '看看这张{enter}')
    const list = screen.getByTestId('messages')
    expect(await within(list).findByRole('img', { name: '截图.png' })).toBeInTheDocument()
    expect(within(list).getByText('看看这张')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '待发送的附件' })).not.toBeInTheDocument()
  })

  it('has no account footer', () => {
    renderDemoApp()
    expect(screen.queryByText('连接应用')).not.toBeInTheDocument()
  })
})

const EMPTY_USAGE: UsageView = { today: 20_000, hour: 12, since: null, records: [], prices: [], botNames: {} }

const listeners = new Set<(e: HarnessEvent) => void>()
const emit = (e: HarnessEvent) => act(() => listeners.forEach((listener) => listener(e)))

const CONNECTED: ModelServicesView = {
  accounts: [
    { id: 'deepseek', service: 'deepseek', name: 'DeepSeek', baseURL: 'https://api.deepseek.com', keyHint: '••••7890' },
  ],
  chat: { accountId: 'deepseek', model: 'deepseek-flash' },
  searchAccountId: 'deepseek',
}
const NOTHING_CONNECTED: ModelServicesView = { accounts: [], chat: null, searchAccountId: null }
const NO_MODELS = { main: null, chat: null, tasks: null }

function fakeBridge(hasModel = true): NengyongBotBridge {
  return {
    isMac: false,
    getLanguage: vi.fn(async () => 'zh' as const),
    setLanguage: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    attachmentUrl: (path) => `attachment:${path}`,
    miniAppUrl: (botId, miniAppId, version) => `mini-app:${botId}/${miniAppId}/${version}`,
    askFromMiniApp: vi.fn(async () => {}),
    saveMiniAppData: vi.fn(async () => {}),
    restoreMiniApp: vi.fn(async () => {}),
    deleteMiniApp: vi.fn(async () => {}),
    miniAppHtml: vi.fn(async () => ''),
    history: vi.fn(async () => []),
    deleteMessages: vi.fn(async () => {}),
    previews: vi.fn(async () => ({ repo: '明天 **10 点** 开会，见 [CEO](bot:chief)' })),
    panel: vi.fn(async () => ({
      duty: dutyOf(''),
      routines: [],
      flows: [],
      skills: [],
      miniApps: [],
      library: [],
      tasks: [],
      models: NO_MODELS,
    })),
    tasksAndRoutines: vi.fn(async () => ({})),
    decisionCounts: vi.fn(async () => ({})),
    context: vi.fn(async () => null),
    setDebug: vi.fn(async () => {}),
    setRoutineEnabled: vi.fn(async () => {}),
    openLibraryItem: vi.fn(async () => {}),
    stopReply: vi.fn(async () => {}),
    stopTask: vi.fn(async () => {}),
    answerSkillOffer: vi.fn(async () => {}),
    answerDutyOffer: vi.fn(async () => {}),
    setDutyReview: vi.fn(async () => {}),
    uploadSkill: vi.fn(async () => null),
    answerSkillUpload: vi.fn(async () => {}),
    removeSkills: vi.fn(async () => {}),
    skillFiles: vi.fn(async () => []),
    skillFile: vi.fn(async () => null),
    revealSkill: vi.fn(async () => {}),
    getSidebar: vi.fn(async () => null),
    needsOnboarding: vi.fn(async () => false),
    saveSidebar: vi.fn(async () => []),
    deleteBot: vi.fn(async () => {}),
    getDataDir: vi.fn(async () => '/Users/me/.nengyongbot/data'),
    openDataDir: vi.fn(async () => {}),
    moveDataDir: vi.fn(async () => {}),
    exportData: vi.fn(async () => '/Users/me/Desktop/Nengyong Bot 备份 2026-11-18 2305'),
    importData: vi.fn(async () => {}),
    getModelServices: vi.fn(async () => (hasModel ? CONNECTED : NOTHING_CONNECTED)),
    listModels: vi.fn(async () => ['deepseek-flash', 'deepseek-pro']),
    saveAccount: vi.fn(async () => CONNECTED),
    removeAccount: vi.fn(async () => NOTHING_CONNECTED),
    setChatModel: vi.fn(async () => CONNECTED),
    setSearchAccount: vi.fn(async () => CONNECTED),
    getMcpConfig: vi.fn(async () => ({ text: EMPTY_MCP_CONFIG, servers: [] })),
    setMcpConfig: vi.fn(async (text: string) => ({ text, servers: [] })),
    getLimits: vi.fn(async () => DEFAULT_LIMITS),
    setLimits: vi.fn(async (limits: Limits) => limits),
    usage: vi.fn(async () => EMPTY_USAGE),
    setModelPrice: vi.fn(async () => EMPTY_USAGE),
    onboard: vi.fn(async () => []),
    getDevices: vi.fn(async () => ({ isLanOn: false, address: null, error: null, devices: [] })),
    setLanAccess: vi.fn(async () => ({ isLanOn: true, address: 'http://192.168.1.23:4317', error: null, devices: [] })),
    removeDevice: vi.fn(async () => ({ isLanOn: true, address: 'http://192.168.1.23:4317', error: null, devices: [] })),
    answerPairing: vi.fn(async () => {}),
    checkForUpdate: vi.fn(async () => ({ version: '1.0.0-beta.1', date: '2026-11-23T00:00:00.000Z', isNewer: false })),
    installUpdate: vi.fn(async () => {}),
    onEvent: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

const stamp = (seq: number, at = Date.now()) => ({ seq, at })
// the app counts every bot as seen when it starts: a failure must come later to be news
const afterAMoment = () => new Promise((resolve) => setTimeout(resolve, 5))
const failedTask = (): TaskView => ({
  id: 'digest',
  title: '整理反馈',
  status: 'failed',
  statusText: '',
  createdAt: Date.now() - 60_000,
  endedAt: Date.now(),
  requestedBy: null,
  isRoutine: true,
  failureReason: '连不上 GitHub',
})

let bridge: NengyongBotBridge
const renderApp = () => render(<App bridge={bridge} initialSidebar={DEMO_SIDEBAR} />)

beforeEach(() => {
  bridge = fakeBridge()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})

describe('App on a scripted bridge', () => {
  it('sends through the bridge and renders streamed and committed replies as markdown', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.type(screen.getByRole('textbox', { name: '跟 小满 说点什么' }), '你好{enter}')
    expect(bridge.send).toHaveBeenCalledWith('chief', '你好', [], null, null)

    await emit({ kind: 'entry', botId: 'chief', entry: { ...stamp(1), kind: 'user', text: '你好' } })
    await emit({ kind: 'streaming', botId: 'chief', text: '正在' })
    const list = screen.getByTestId('messages')
    expect(within(list).getByText('正在')).toBeInTheDocument()

    await emit({ kind: 'streaming', botId: 'chief', text: '' })
    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { ...stamp(2), kind: 'bot', text: '**已完成**，交给 [秘书](bot:secretary)' },
    })
    expect(within(list).queryByText('正在')).not.toBeInTheDocument()
    expect(within(list).getByText('已完成').tagName).toBe('STRONG')
    expect(within(list).getByText('秘书Bot')).toBeInTheDocument() // mention resolved to the bot's current name

    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { ...stamp(3), kind: 'bot', text: '我先建 [健身教练](bot) 再说' },
    })
    expect(within(list).getByText('健身教练').closest('a')).toBeNull() // id-less mention resolved by name, not a link
  })

  it('opens the mentioned bot when its mention in a reply is clicked', async () => {
    const user = userEvent.setup()
    renderApp()
    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { ...stamp(1), kind: 'bot', text: '交给 [秘书](bot:secretary)' },
    })
    await user.click(within(screen.getByTestId('messages')).getByRole('button', { name: '秘书Bot' }))
    expect(screen.getByRole('textbox', { name: '跟 秘书Bot 说点什么' })).toBeInTheDocument()
  })

  it('goes back to the chat a mention was clicked in', async () => {
    const user = userEvent.setup()
    renderApp()
    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { ...stamp(1), kind: 'bot', text: '交给 [秘书](bot:secretary)' },
    })
    await user.click(within(screen.getByTestId('messages')).getByRole('button', { name: '秘书Bot' }))
    await user.click(screen.getByRole('button', { name: '返回 小满' }))
    expect(screen.getByRole('textbox', { name: '跟 小满 说点什么' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^返回/ })).not.toBeInTheDocument()
  })

  it('offers no way back once another bot was opened in between', async () => {
    const user = userEvent.setup()
    renderApp()
    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { ...stamp(1), kind: 'bot', text: '交给 [秘书](bot:secretary)' },
    })
    await user.click(within(screen.getByTestId('messages')).getByRole('button', { name: '秘书Bot' }))
    const pinned = screen.getByRole('group', { name: '置顶区' })
    await user.click(within(pinned).getByRole('button', { name: /小满/ }))
    await user.click(within(pinned).getByRole('button', { name: /秘书Bot/ }))
    expect(screen.getByRole('textbox', { name: '跟 秘书Bot 说点什么' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^返回/ })).not.toBeInTheDocument()
  })

  it('adds a bot the harness created to the sidebar and saves the sidebar', async () => {
    renderApp()
    const created = { id: 'bxyz1', name: '周报助手', shape: 'bell', color: '#F0468C' } as const
    await emit({ kind: 'bot-created', bot: created })
    expect(screen.getByRole('button', { name: /周报助手/ })).toBeInTheDocument()
    expect(vi.mocked(bridge.saveSidebar).mock.calls.at(-1)?.[0].bots).toContainEqual(created)
  })

  it('renames a bot in the sidebar when the harness renames it, and saves the sidebar', async () => {
    renderApp()
    await emit({ kind: 'bot-renamed', botId: 'secretary', name: '灵感记录' })
    expect(screen.getAllByRole('button', { name: /灵感记录/ })).not.toHaveLength(0)
    const saved = vi.mocked(bridge.saveSidebar).mock.calls.at(-1)?.[0].bots
    expect(saved?.find((bot) => bot.id === 'secretary')?.name).toBe('灵感记录')
  })

  it('moves a bot into a new section when the harness moves it, and saves the sidebar', async () => {
    renderApp()
    await emit({ kind: 'bot-moved', botId: 'secretary', section: { id: 'sOps', name: '运营团队' } })
    expect(screen.getByText('运营团队')).toBeInTheDocument()
    const saved = vi.mocked(bridge.saveSidebar).mock.calls.at(-1)?.[0]
    expect([saved?.sections.at(-1)?.name, saved?.placement.secretary]).toEqual(['运营团队', 'sOps'])
  })

  it('does not flag a task that failed while its chat was open once the user moves on', async () => {
    const user = userEvent.setup()
    renderApp()
    await afterAMoment()
    await emit({ kind: 'tasks', botId: 'chief', tasks: [failedTask()] })
    const pinned = screen.getByRole('group', { name: '置顶区' })
    await user.click(within(pinned).getByRole('button', { name: /秘书Bot/ }))
    expect(
      within(within(pinned).getByRole('button', { name: /小满/ })).queryByRole('img', { name: '没跑成' }),
    ).toBeNull()
  })

  it('lists a reply in progress on the card of a bot whose task failed', async () => {
    const user = userEvent.setup()
    renderApp()
    await afterAMoment()
    await emit({ kind: 'tasks', botId: 'secretary', tasks: [failedTask()] })
    await emit({ kind: 'busy', botId: 'secretary', busy: true, runId: 'r1' })
    await user.hover(within(screen.getByRole('group', { name: '置顶区' })).getByRole('button', { name: /秘书Bot/ }))
    expect(within(await screen.findByRole('tooltip')).getByText('回复中')).toBeInTheDocument()
  })

  it('marks a bot unread when it replies while another bot is open', async () => {
    renderApp()
    await emit({ kind: 'entry', botId: 'secretary', entry: { ...stamp(1), kind: 'bot', text: '提醒已设好' } })
    const pinned = screen.getByRole('group', { name: '置顶区' })
    expect(within(within(pinned).getByRole('button', { name: /秘书Bot/ })).getByLabelText('未读')).toBeInTheDocument()
  })

  it('counts the unread replies of a bot once there is more than one', async () => {
    renderApp()
    await emit({ kind: 'entry', botId: 'secretary', entry: { ...stamp(1), kind: 'bot', text: '提醒已设好' } })
    await emit({ kind: 'entry', botId: 'secretary', entry: { ...stamp(2), kind: 'bot', text: '明早九点叫你' } })
    const pinned = screen.getByRole('group', { name: '置顶区' })
    expect(
      within(within(pinned).getByRole('button', { name: /秘书Bot/ })).getByLabelText('2 条未读'),
    ).toHaveTextContent('2')
  })

  it('opens the bot whose system notification was clicked and clears its unread mark', async () => {
    renderApp()
    await emit({ kind: 'entry', botId: 'secretary', entry: { ...stamp(1), kind: 'bot', text: '提醒已设好' } })
    await emit({ kind: 'open-bot', botId: 'secretary' })
    expect(screen.getByRole('textbox', { name: '跟 秘书Bot 说点什么' })).toBeInTheDocument()
    expect(screen.queryByLabelText('未读')).not.toBeInTheDocument()
  })

  it('counts a reply from the open bot as unread while the window is in the background, until it comes back', async () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    renderApp()
    await emit({ kind: 'entry', botId: 'chief', entry: { ...stamp(1), kind: 'bot', text: '报告写好了' } })
    const pinned = screen.getByRole('group', { name: '置顶区' })
    expect(within(within(pinned).getByRole('button', { name: /小满/ })).getByLabelText('未读')).toBeInTheDocument()
    hasFocus.mockRestore()
    act(() => window.dispatchEvent(new FocusEvent('focus')))
    expect(screen.queryByLabelText('未读')).not.toBeInTheDocument()
  })

  it('asks to connect DeepSeek when no model is set and passes the key to the main process', async () => {
    bridge = fakeBridge(false)
    const user = userEvent.setup()
    renderApp()
    await user.type(await screen.findByLabelText('API Key'), 'sk-test1234567890')
    await user.click(screen.getByRole('button', { name: '连接' }))
    expect(bridge.saveAccount).toHaveBeenCalledWith(
      { id: null, service: 'deepseek', name: '', baseURL: 'https://api.deepseek.com', apiKey: 'sk-test1234567890' },
      'chat',
    )
    expect(await screen.findByText('已换成 deepseek-flash')).toBeInTheDocument()
    expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument()
  })

  it('shows the main model and the saved accounts when the settings open with a model set', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '设置' }))
    expect(await screen.findByRole('button', { name: /deepseek-flash/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /DeepSeek.*在用：主模型、网络搜索/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument()
  })

  it('switches the theme from the general page and remembers it', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '通用' }))
    expect(screen.getByLabelText('主题')).toHaveValue('light')
    await user.selectOptions(screen.getByLabelText('主题'), '深色')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    cleanup()
    document.documentElement.removeAttribute('data-theme')
    renderApp()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('continues following the system after a reload until a fixed theme is chosen', async ({ onTestFinished }) => {
    const darkScheme = Object.assign(new EventTarget(), {
      media: '(prefers-color-scheme: dark)',
      matches: true,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })
    const matchMedia = window.matchMedia
    const media = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((query) => (query === darkScheme.media ? darkScheme : matchMedia(query)))
    onTestFinished(() => media.mockRestore())
    const changeSystemTheme = (matches: boolean) => {
      darkScheme.matches = matches
      act(() => darkScheme.dispatchEvent(Object.assign(new Event('change'), { matches, media: darkScheme.media })))
    }

    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '通用' }))
    await user.selectOptions(screen.getByLabelText('主题'), '跟随系统')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    changeSystemTheme(false)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')

    cleanup()
    changeSystemTheme(true)
    renderApp()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '通用' }))
    expect(screen.getByLabelText('主题')).toHaveDisplayValue('跟随系统')
    await user.selectOptions(screen.getByLabelText('主题'), '深色')
    changeSystemTheme(false)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('offers the fine-grained limits in the settings only while debug mode is on', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '通用' }))
    await user.click(screen.getByRole('switch', { name: '调试模式', checked: true }))
    expect(screen.queryByRole('button', { name: '精细化配置' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: '调试模式', checked: false }))
    await user.click(screen.getByRole('button', { name: '精细化配置' }))
    const steps = screen.getByRole('spinbutton', { name: '每轮步数' })
    await user.clear(steps)
    await user.type(steps, '50{Enter}')
    expect(bridge.setLimits).toHaveBeenCalledWith({ ...DEFAULT_LIMITS, chatSteps: 50 })
  })

  it('shows the data dir on the data page and where an export went', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '设置' }))
    // the page suspends until the data dir is read; outside act, the test environment never lets it resume
    await act(() => user.click(screen.getByRole('button', { name: '数据' })))
    expect(await screen.findByText('/Users/me/.nengyongbot/data')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '导出…' }))
    expect(await screen.findByText('已导出到 /Users/me/Desktop/Nengyong Bot 备份 2026-11-18 2305')).toBeInTheDocument()
  })

  it('opens the release notes from the version at the bottom of the settings', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: /^Nengyong Bot \d+\.\d+\.\d+(-[\w.]+)? · 更新记录$/ }))
    expect(screen.getByRole('heading', { name: '更新记录' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /^放大：/ })[0])
    expect(screen.getByRole('button', { name: '缩小' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '缩小' }))
    expect(screen.queryByRole('button', { name: '缩小' })).not.toBeInTheDocument()
  })

  it('shows why opening the data dir failed, without the IPC prefix', async () => {
    const openDataDir = vi.fn(async () =>
      Promise.reject(new Error("Error invoking remote method 'nengyongbot:openDataDir': Error: 打不开数据目录")),
    )
    bridge = { ...fakeBridge(), openDataDir }
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '数据' }))
    await user.click(screen.getByRole('button', { name: '打开' }))
    expect(openDataDir).toHaveBeenCalled()
    expect(await screen.findByText('打不开数据目录')).toBeInTheDocument()
  })

  it('shows the last reply of each bot in the sidebar, as plain text', async () => {
    renderApp()
    expect(await screen.findByText('明天 10 点 开会，见 CEO')).toBeInTheDocument()
  })

  it('shows a progress row with what the bot is doing while it works', async () => {
    renderApp()
    await emit({ kind: 'busy', botId: 'chief', busy: true, runId: 'r1' })
    expect(screen.getByTestId('progress')).toBeInTheDocument()
    await emit({ kind: 'activity', botId: 'chief', activity: { kind: 'tool', tool: 'start_task' } })
    expect(screen.getByRole('status')).toHaveTextContent('正在安排任务')
    await emit({
      kind: 'activity',
      botId: 'chief',
      activity: { kind: 'tool', tool: 'remember' },
    })
    expect(screen.getByRole('status')).toHaveTextContent('记到小本本上')
    await emit({ kind: 'busy', botId: 'chief', busy: false, runId: 'r1' })
    expect(screen.queryByTestId('progress')).not.toBeInTheDocument()
  })

  it('stops the reply of the open bot that is running, from the message box, which offers it only then', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(screen.queryByRole('button', { name: '停止回复' })).not.toBeInTheDocument()
    await emit({ kind: 'busy', botId: 'chief', busy: true, runId: 'r1' })
    await user.click(screen.getByRole('button', { name: '停止回复' }))
    expect(bridge.stopReply).toHaveBeenCalledWith('chief', 'r1')
  })

  it('shows what the background tasks are doing under the chat while the bot is not replying', async () => {
    const task = { endedAt: null, requestedBy: null, isRoutine: false, createdAt: Date.now() }
    const tasks: TaskView[] = [
      { ...task, id: 't1', title: '调研', status: 'running', statusText: '读仓库' },
      { ...task, id: 't2', title: '写周报', status: 'waiting', statusText: '' },
    ]
    bridge = {
      ...fakeBridge(),
      panel: vi.fn(async () => ({
        duty: dutyOf(''),
        routines: [],
        flows: [],
        skills: [],
        miniApps: [],
        library: [],
        tasks,
        models: NO_MODELS,
      })),
    }
    renderApp()
    const list = await screen.findByRole('list', { name: '后台任务' })
    expect(screen.getByText('2 个后台任务进行中')).toBeInTheDocument()
    expect(within(list).getByText('读仓库')).toBeInTheDocument()
    expect(within(list).getByText('排队中')).toBeInTheDocument()

    await emit({ kind: 'busy', botId: 'chief', busy: true, runId: 'r1' })
    expect(screen.queryByRole('list', { name: '后台任务' })).not.toBeInTheDocument()
    await emit({ kind: 'busy', botId: 'chief', busy: false, runId: 'r1' })
    expect(screen.getByRole('list', { name: '后台任务' })).toBeInTheDocument()
  })

  it('groups the recent tasks by the day they ended, also one a restart interrupted days after it started', async () => {
    const day = 86_400_000
    const now = Date.now()
    const task = { requestedBy: null, isRoutine: false, statusText: '' }
    const tasks: TaskView[] = [
      { ...task, id: 't3', title: '今天的任务', status: 'done', createdAt: now - 2000, endedAt: now - 1000 },
      { ...task, id: 't2', title: '前天的任务', status: 'done', createdAt: now - 2 * day, endedAt: now - 2 * day },
      { ...task, id: 't1', title: '被重启打断', status: 'interrupted', createdAt: now - 3 * day, endedAt: now },
    ]
    bridge = {
      ...fakeBridge(),
      panel: vi.fn(async () => ({
        duty: dutyOf(''),
        routines: [],
        flows: [],
        skills: [],
        miniApps: [],
        library: [],
        tasks,
        models: NO_MODELS,
      })),
    }
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '展开面板' }))
    const recent = await screen.findByRole('list', { name: '最近任务' })
    const days = within(recent).getAllByRole('heading')
    expect(days.map((heading) => heading.textContent)).toEqual(['今天', expect.not.stringMatching('今天')])
  })

  it('shows a message sent while the bot is busy as queued until its turn reads it', async () => {
    renderApp()
    const list = screen.getByTestId('messages')
    await emit({ kind: 'queued', botId: 'chief', texts: ['顺便问下明天几点开会'] })
    expect(within(list).getByText('顺便问下明天几点开会')).toBeInTheDocument()
    expect(within(list).getByText(/正忙，这一轮做完后一起看/)).toBeInTheDocument()
    await emit({ kind: 'queued', botId: 'chief', texts: [] })
    await emit({ kind: 'entry', botId: 'chief', entry: { ...stamp(1), kind: 'user', text: '顺便问下明天几点开会' } })
    expect(within(list).getAllByText('顺便问下明天几点开会')).toHaveLength(1)
    expect(within(list).queryByText(/正忙，这一轮做完后一起看/)).not.toBeInTheDocument()
  })

  it('shows a failed history load in the conversation instead of hiding it in the console', async () => {
    bridge = { ...fakeBridge(), history: vi.fn(async () => Promise.reject(new Error('磁盘读不了'))) }
    renderApp()
    expect(await screen.findByText('出错了：读取对话记录失败：磁盘读不了')).toBeInTheDocument()
  })

  it('reads the model services again when the first read failed and the user opens the settings', async () => {
    const getModelServices = vi.fn(async () => CONNECTED).mockRejectedValueOnce(new Error('主进程没响应'))
    bridge = { ...fakeBridge(), getModelServices }
    const user = userEvent.setup()
    renderApp()
    expect(await screen.findByText('出错了：读取模型服务失败：主进程没响应')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '设置' }))
    expect(await screen.findByRole('heading', { name: '模型服务' })).toBeInTheDocument()
  })

  it('shows the tasks the harness reports in the panel, and stops one through the bridge', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '展开面板' }))
    await emit({
      kind: 'tasks',
      botId: 'chief',
      tasks: [
        {
          id: 't1',
          title: '调研',
          status: 'running',
          statusText: '读仓库',
          createdAt: Date.now(),
          endedAt: null,
          requestedBy: null,
          isRoutine: false,
        },
      ],
    })
    const panel = screen.getByRole('complementary', { name: 'Bot 详情' })
    expect(within(panel).getByText('调研')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: '停止任务 调研' }))
    expect(bridge.stopTask).toHaveBeenCalledWith('chief', 't1')
  })

  it('shows why a task could not be stopped', async () => {
    const user = userEvent.setup()
    bridge.stopTask = vi.fn(async () => {
      throw new Error("Error invoking remote method 'nengyongbot:stopTask': Error: 没有进行中的任务 t1")
    })
    renderApp()
    await user.click(screen.getByRole('button', { name: '展开面板' }))
    await emit({
      kind: 'tasks',
      botId: 'chief',
      tasks: [
        {
          id: 't1',
          title: '调研',
          status: 'waiting',
          statusText: '',
          createdAt: Date.now(),
          endedAt: null,
          requestedBy: null,
          isRoutine: false,
        },
      ],
    })
    await user.click(screen.getByRole('button', { name: '停止任务 调研' }))
    expect(await screen.findByText('出错了：停止任务失败：没有进行中的任务 t1')).toBeInTheDocument()
  })

  it('shows harness errors in the thread', async () => {
    renderApp()
    await emit({ kind: 'error', botId: 'chief', message: '账户余额不足' })
    expect(screen.getByText('出错了：账户余额不足')).toBeInTheDocument()
  })
})

describe('updates', () => {
  const NEWER = { version: '9.0.0', date: '2026-12-01T00:00:00.000Z', isNewer: true }
  // the check runs a moment after launch
  const launch = async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderApp()
    await act(() => vi.advanceTimersByTimeAsync(3000))
    return user
  }
  const openReleaseNotes = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: /^Nengyong Bot \d+\.\d+\.\d+(-[\w.]+)? · / }))
  }

  it('offers a newer version found after launch, and downloads it only when asked', async () => {
    bridge = {
      ...fakeBridge(),
      checkForUpdate: vi.fn(async () => NEWER),
      installUpdate: vi.fn(() => new Promise<void>(() => {})),
    }
    const user = await launch()
    expect(screen.getByRole('heading', { name: '发现新版本 9.0.0' })).toBeInTheDocument()
    expect(bridge.installUpdate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '立即更新' }))
    await emit({
      kind: 'update-progress',
      percent: 42.7,
      transferredBytes: 42 * BYTES_PER_MB,
      totalBytes: 100 * BYTES_PER_MB,
    })
    expect(bridge.installUpdate).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '正在下载 9.0.0… 42%' })).toBeInTheDocument()
    expect(screen.getByText('42 MB / 100 MB')).toBeInTheDocument()
  })

  it('says it is restarting once the download is done, and why when it fails', async () => {
    const installUpdate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(
        new Error("Error invoking remote method 'nengyongbot:installUpdate': Error: 新版本没下载完"),
      )
      .mockResolvedValueOnce(undefined)
    bridge = { ...fakeBridge(), checkForUpdate: vi.fn(async () => NEWER), installUpdate }
    const user = await launch()
    await user.click(screen.getByRole('button', { name: '立即更新' }))
    expect(await screen.findByRole('heading', { name: '更新失败' })).toBeInTheDocument()
    expect(screen.getByText('新版本没下载完')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '下载完成，正在重启…' })).toBeInTheDocument()
  })

  it('says why installing failed after the download, instead of restarting forever', async () => {
    bridge = { ...fakeBridge(), checkForUpdate: vi.fn(async () => NEWER) }
    const user = await launch()
    await user.click(screen.getByRole('button', { name: '立即更新' }))
    expect(await screen.findByRole('heading', { name: '下载完成，正在重启…' })).toBeInTheDocument()
    await emit({ kind: 'update-error', message: '新版本装不上，到 GitHub Releases 下载安装' })
    expect(screen.getByRole('heading', { name: '更新失败' })).toBeInTheDocument()
    expect(screen.getByText('新版本装不上，到 GitHub Releases 下载安装')).toBeInTheDocument()
  })

  it('waits for the onboarding to end before offering an update', async () => {
    bridge = { ...fakeBridge(), checkForUpdate: vi.fn(async () => NEWER) }
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<App bridge={bridge} needsOnboarding />)
    await act(() => vi.advanceTimersByTimeAsync(3000))
    expect(bridge.checkForUpdate).toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: '发现新版本 9.0.0' })).not.toBeInTheDocument()
  })

  it('stays quiet when the check after launch finds nothing new or fails', async () => {
    bridge = { ...fakeBridge(), checkForUpdate: vi.fn(async () => Promise.reject(new Error('offline'))) }
    await launch()
    expect(bridge.checkForUpdate).toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: /发现新版本|检查失败/ })).not.toBeInTheDocument()
  })

  it('keeps a postponed update on the 更新记录 page', async () => {
    bridge = { ...fakeBridge(), checkForUpdate: vi.fn(async () => NEWER) }
    const user = await launch()
    await user.click(screen.getByRole('button', { name: '稍后' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: '发现新版本 9.0.0' })).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: /^Nengyong Bot .* · 有新版本$/ }))
    expect(screen.getByRole('status')).toHaveTextContent('发现新版本 9.0.0（12月1日发布）')
    expect(screen.getByRole('button', { name: '立即更新' })).toBeInTheDocument()
  })

  it('answers a check the user asked for on the 更新记录 page', async () => {
    const user = userEvent.setup()
    renderApp()
    await openReleaseNotes(user)
    await user.click(screen.getByRole('button', { name: '检查更新' }))
    expect(await screen.findByText('已是最新版本 · 最新版是 1.0.0-beta.1（11月23日发布）')).toBeInTheDocument()
  })

  it('says why a check the user asked for failed', async () => {
    bridge = {
      ...fakeBridge(),
      checkForUpdate: vi.fn(async () =>
        Promise.reject(new Error("Error invoking remote method 'nengyongbot:checkForUpdate': Error: 连不上 GitHub")),
      ),
    }
    const user = userEvent.setup()
    renderApp()
    await openReleaseNotes(user)
    await user.click(screen.getByRole('button', { name: '检查更新' }))
    expect(await screen.findByText('检查失败：连不上 GitHub')).toBeInTheDocument()
  })

  it('warns that updating stops the bots at work', async () => {
    bridge = { ...fakeBridge(), checkForUpdate: vi.fn(async () => NEWER) }
    await launch()
    await emit({ kind: 'busy', botId: 'chief', busy: true, runId: 'r1' })
    expect(screen.getByText('小满正在干活，更新要重启应用，会打断它。')).toBeInTheDocument()
  })

  it('says once what the new version brought, on its first run', async () => {
    localStorage.setItem('nengyongbot:lastVersion', JSON.stringify('0.9.0'))
    const user = userEvent.setup()
    const { unmount } = renderApp()
    expect(screen.getByRole('heading', { name: `已更新到 ${RELEASES[0].version}` })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '看看更新记录' }))
    expect(await screen.findByRole('heading', { name: '更新记录' })).toBeInTheDocument()

    unmount()
    renderApp()
    expect(screen.queryByRole('heading', { name: /^已更新到/ })).not.toBeInTheDocument()
  })
})

describe('fresh app', () => {
  it('starts with only the main bot, named CEO, which has no delete action', async () => {
    render(<App bridge={bridge} />)
    expect(screen.getByRole('textbox', { name: '跟 CEO 说点什么' })).toBeInTheDocument()
    const pinned = screen.getByRole('group', { name: '置顶区' })
    expect(
      within(pinned)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['CEO'])
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(vi.mocked(bridge.saveSidebar).mock.calls.at(-1)?.[0].bots).toEqual([MAIN_BOT])

    fireEvent.contextMenu(within(pinned).getByRole('button', { name: /CEO/ }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).not.toContain('离职…')
  })
})

describe('the message box', () => {
  const box = () => screen.getByRole('textbox', { name: '跟 小满 说点什么' })
  const image = () => new File([new Uint8Array([1, 2])], 'a.png', { type: 'image/png' })

  it('keeps a draft for each bot: its text, @mentions and attachments wait while another bot is open', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.upload(screen.getByLabelText('选择附件'), image())
    await user.type(box(), '问问 @健身{enter}')
    await user.keyboard('明天')

    await user.click(screen.getByRole('button', { name: /健身教练/ }))
    const other = screen.getByRole('textbox', { name: '跟 健身教练 说点什么' })
    expect(other).toBeEmptyDOMElement()
    expect(screen.queryByRole('list', { name: '待发送的附件' })).not.toBeInTheDocument()
    await user.type(other, '早')

    await user.click(within(screen.getByRole('group', { name: '置顶区' })).getByRole('button', { name: /小满/ }))
    expect(within(box()).getByText('健身教练')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: '待发送的附件' })).getByRole('img', { name: 'a.png' })).toBeVisible()
    await user.type(box(), '{enter}')
    expect(bridge.send).toHaveBeenCalledWith(
      'chief',
      '问问 @健身教练 明天',
      [expect.objectContaining({ name: 'a.png' })],
      null,
      null,
    )

    await user.click(screen.getByRole('button', { name: /健身教练/ }))
    expect(screen.getByRole('textbox', { name: '跟 健身教练 说点什么' })).toHaveTextContent('早')
  })

  it('starts a new line on Shift+Enter and sends both lines on Enter', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.type(box(), '第一行{Shift>}{Enter}{/Shift}第二行')
    expect(box().textContent).toBe('第一行\n第二行')
    expect(bridge.send).not.toHaveBeenCalled()
    await user.type(box(), '{enter}')
    expect(bridge.send).toHaveBeenCalledWith('chief', '第一行\n第二行', [], null, null)
  })

  it('starts a new line on Enter and sends on ⌘↵ once that is chosen in the settings', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '通用' }))
    await user.click(screen.getByRole('switch', { name: 'Enter 键换行' }))
    await user.click(screen.getByRole('button', { name: '关闭' }))
    await user.type(box(), '第一行{Enter}第二行')
    expect(box().textContent).toBe('第一行\n第二行')
    expect(bridge.send).not.toHaveBeenCalled()
    await user.type(box(), '{Meta>}{Enter}{/Meta}')
    expect(bridge.send).toHaveBeenCalledWith('chief', '第一行\n第二行', [], null, null)
  })

  it('does not send on the Enter that confirms an input-method candidate', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.type(box(), 'nihao')
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true })
    expect(bridge.send).not.toHaveBeenCalled()
    expect(box().textContent).toBe('nihao')
  })

  it('sends a picked file with the message, and a message of files alone', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.upload(screen.getByLabelText('选择附件'), image())
    expect(within(screen.getByRole('list', { name: '待发送的附件' })).getByRole('img', { name: 'a.png' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() =>
      expect(bridge.send).toHaveBeenCalledWith(
        'chief',
        '',
        [{ name: 'a.png', data: new Uint8Array([1, 2]) }],
        null,
        null,
      ),
    )
    expect(screen.queryByRole('list', { name: '待发送的附件' })).not.toBeInTheDocument()
  })

  it('takes files dropped anywhere on the chat and shows a hint while they are dragged over it', async () => {
    renderApp()
    const chat = screen.getByRole('main')
    fireEvent.dragOver(chat, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.getByText('松开即可添加为附件')).toBeInTheDocument()
    fireEvent.drop(chat, { dataTransfer: { types: ['Files'], files: [image()] } })
    await waitFor(() => expect(screen.queryByText('松开即可添加为附件')).not.toBeInTheDocument())
    expect(within(screen.getByRole('list', { name: '待发送的附件' })).getByRole('img', { name: 'a.png' })).toBeVisible()
  })

  it('attaches a pasted screenshot', async () => {
    renderApp()
    fireEvent.paste(box(), { clipboardData: { types: ['Files'], files: [image()] } })
    expect(within(screen.getByRole('list', { name: '待发送的附件' })).getByRole('img', { name: 'a.png' })).toBeVisible()
  })

  it('removes a file before sending', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.upload(screen.getByLabelText('选择附件'), image())
    await user.click(screen.getByRole('button', { name: '移除 a.png' }))
    expect(screen.queryByRole('list', { name: '待发送的附件' })).not.toBeInTheDocument()
  })

  it('refuses a file over the size limit, says why and keeps what was typed', async () => {
    const user = userEvent.setup()
    renderApp()
    const huge = new File([new Uint8Array([1])], '录像.mov')
    Object.defineProperty(huge, 'size', { value: 30_000_000 })
    await user.upload(screen.getByLabelText('选择附件'), huge)
    await user.type(box(), '看这个{enter}')
    expect(bridge.send).not.toHaveBeenCalled()
    expect(screen.getByText(/「录像.mov」超过 20 MB/)).toBeInTheDocument()
    expect(box().textContent).toBe('看这个')
  })

  it('refuses a message over the length limit, says why and keeps what was typed', async () => {
    const user = userEvent.setup()
    renderApp()
    const long = '字'.repeat(MESSAGE_MAX_CHARS + 1)
    box().textContent = long
    fireEvent.input(box())
    await user.type(box(), '{enter}')
    expect(bridge.send).not.toHaveBeenCalled()
    expect(screen.getByText(/消息太长了/)).toBeInTheDocument()
    expect(box().textContent).toBe(long)
  })

  it('shows the images and files a sent message carries', async () => {
    renderApp()
    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { ...stamp(1), kind: 'user', text: '', attachments: ['uploads/x/a.png', 'uploads/y/表.csv'] },
    })
    const list = screen.getByTestId('messages')
    expect(within(list).getByRole('img', { name: 'a.png' })).toHaveAttribute('src', 'attachment:uploads/x/a.png')
    expect(within(list).getByText('表.csv')).toBeInTheDocument()
  })

  it('opens a sent image large on click and closes it on the backdrop', async () => {
    const user = userEvent.setup()
    renderApp()
    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { ...stamp(1), kind: 'user', text: '', attachments: ['uploads/x/a.png'] },
    })
    await user.click(screen.getByRole('button', { name: '查看 a.png' }))
    const preview = screen.getByRole('dialog', { name: 'a.png' })
    expect(within(preview).getByRole('img', { name: 'a.png' })).toHaveAttribute('src', 'attachment:uploads/x/a.png')
    await user.click(preview)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('replying to a message', () => {
  const messages = () => within(screen.getByTestId('messages'))

  it('shows what is quoted in the message box and sends the quote with the reply', async () => {
    const user = userEvent.setup()
    renderApp()
    await emit({ kind: 'entry', botId: 'chief', entry: { ...stamp(1), kind: 'bot', text: '**三件事**要办' } })
    await user.click(messages().getByRole('button', { name: '回复' }))

    const box = screen.getByRole('textbox', { name: '回复…' })
    expect(box).toHaveFocus()
    expect(screen.getByRole('main').querySelector('form')).toHaveTextContent('三件事要办')
    await user.type(box, '第一件呢{enter}')
    expect(bridge.send).toHaveBeenCalledWith('chief', '第一件呢', [], 1, null)
    expect(screen.getByRole('textbox', { name: '跟 小满 说点什么' })).toBeInTheDocument()
  })

  it('drops the quote when it is cancelled, and keeps it to the chat it was picked in', async () => {
    const user = userEvent.setup()
    renderApp()
    await emit({ kind: 'entry', botId: 'chief', entry: { ...stamp(1), kind: 'bot', text: '好' } })
    await user.click(messages().getByRole('button', { name: '回复' }))
    await user.click(screen.getByRole('button', { name: '取消回复' }))
    expect(screen.getByRole('textbox', { name: '跟 小满 说点什么' })).toBeInTheDocument()

    await user.click(messages().getByRole('button', { name: '回复' }))
    await user.click(screen.getByRole('button', { name: /健身教练/ }))
    await user.type(screen.getByRole('textbox', { name: '跟 健身教练 说点什么' }), '你好{enter}')
    expect(bridge.send).toHaveBeenCalledWith('fitness', '你好', [], null, null)
    await user.click(within(screen.getByRole('group', { name: '置顶区' })).getByRole('button', { name: /小满/ }))
    expect(screen.getByRole('textbox', { name: '回复…' })).toBeInTheDocument()
  })

  it('shows above a sent message what it replies to', async () => {
    renderApp()
    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { ...stamp(2), kind: 'user', text: '第一件呢', quote: { seq: 1, text: '**三件事**要办' } },
    })
    expect(messages().getByText('三件事要办')).toBeInTheDocument()
  })

  it('copies a reply, and the id of the API call that wrote it, from its menu', async () => {
    const user = userEvent.setup()
    renderApp()
    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { ...stamp(1), kind: 'bot', text: '**好**', requestId: 'chatcmpl-42' },
    })
    await user.click(messages().getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('menuitem', { name: '复制' }))
    expect(await screen.findByRole('menuitem', { name: '已复制' })).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe('**好**')

    await user.click(messages().getByRole('button', { name: '更多' }))
    await user.click(screen.getByRole('menuitem', { name: '复制请求 ID' }))
    expect(await navigator.clipboard.readText()).toBe('chatcmpl-42')
  })

  it('says in its menu which model wrote a reply and when', async () => {
    const user = userEvent.setup()
    renderApp()
    const at = new Date('2026-11-21T15:05:00Z').getTime()
    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { seq: 1, at, kind: 'bot', text: '好', model: 'qwen/qwen3.8-27b' },
    })
    await user.click(messages().getByRole('button', { name: '更多' }))
    const menu = screen.getByRole('menu', { name: '消息菜单' })
    expect(within(menu).getByText('qwen/qwen3.8-27b')).toBeInTheDocument()
    expect(within(menu).getByText(/23:05/)).toBeInTheDocument()
  })

  it('says under a reply and in its menu that the main model stood in for one that could not be reached', async () => {
    const user = userEvent.setup()
    renderApp()
    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { ...stamp(1), kind: 'bot', text: '好', model: 'deepseek-flash', fallbackFrom: 'qwen/qwen3.8-27b' },
    })
    expect(messages().getByText(/连不上，这条用了主模型/)).toBeInTheDocument()
    await user.click(messages().getByRole('button', { name: '更多' }))
    const menu = screen.getByRole('menu', { name: '消息菜单' })
    expect(within(menu).getByText('qwen/qwen3.8-27b 连不上')).toBeInTheDocument()
    expect(within(menu).getByText('这条用了 deepseek-flash')).toBeInTheDocument()
  })

  it('offers no request id for a message the model did not write', async () => {
    const user = userEvent.setup()
    renderApp()
    await emit({ kind: 'entry', botId: 'chief', entry: { ...stamp(1), kind: 'user', text: '你好' } })
    await user.click(messages().getByRole('button', { name: '更多' }))
    expect(screen.getByRole('menuitem', { name: '复制' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '复制请求 ID' })).not.toBeInTheDocument()
  })
})

describe('deleting, picking and sharing messages', () => {
  const messages = () => within(screen.getByTestId('messages'))
  const chat = async () => {
    renderApp()
    await emit({ kind: 'entry', botId: 'chief', entry: { ...stamp(1), kind: 'user', text: '你好' } })
    await emit({ kind: 'entry', botId: 'chief', entry: { ...stamp(2), kind: 'bot', text: '**好的**' } })
    await emit({ kind: 'entry', botId: 'chief', entry: { ...stamp(3), kind: 'user', text: '再见' } })
  }
  const startPicking = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(messages().getAllByRole('button', { name: '更多' })[0])
    await user.click(screen.getByRole('menuitem', { name: '多选' }))
    return screen.getByRole('toolbar', { name: '多选操作' })
  }

  it('deletes one message from its menu once confirmed, and keeps it when cancelled', async () => {
    const user = userEvent.setup()
    await chat()
    await user.click(messages().getAllByRole('button', { name: '更多' })[1])
    await user.click(screen.getByRole('menuitem', { name: '删除' }))
    await user.click(
      within(screen.getByRole('dialog', { name: '删除这条消息？' })).getByRole('button', { name: '取消' }),
    )
    expect(bridge.deleteMessages).not.toHaveBeenCalled()

    await user.click(messages().getAllByRole('button', { name: '更多' })[1])
    await user.click(screen.getByRole('menuitem', { name: '删除' }))
    await user.click(
      within(screen.getByRole('dialog', { name: '删除这条消息？' })).getByRole('button', { name: '删除' }),
    )
    expect(bridge.deleteMessages).toHaveBeenCalledWith('chief', [2])
    await waitFor(() => expect(messages().queryByText('好的')).not.toBeInTheDocument())
    expect(messages().getByText('你好')).toBeInTheDocument()
  })

  it('starts picking on a long press, picks more with a click and deletes them together', async () => {
    const user = userEvent.setup()
    await chat()
    fireEvent.pointerDown(messages().getByText('你好'), { button: 0 })
    const bar = await screen.findByRole('toolbar', { name: '多选操作' }, { timeout: 1500 })
    expect(bar).toHaveTextContent('已选 1 条')
    expect(screen.queryByRole('textbox', { name: '跟 小满 说点什么' })).not.toBeInTheDocument()

    await user.click(messages().getAllByRole('checkbox', { name: '选中这条消息' })[2])
    expect(bar).toHaveTextContent('已选 2 条')
    await user.click(within(bar).getByRole('button', { name: '删除' }))
    await user.click(
      within(screen.getByRole('dialog', { name: '删除 2 条消息？' })).getByRole('button', { name: '删除' }),
    )
    expect(bridge.deleteMessages).toHaveBeenCalledWith('chief', [1, 3])
    expect(screen.queryByRole('toolbar', { name: '多选操作' })).not.toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: '跟 小满 说点什么' })).toBeInTheDocument()
  })

  it('does not start picking on a short click', async () => {
    const user = userEvent.setup()
    await chat()
    await user.click(messages().getByText('你好'))
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(screen.queryByRole('toolbar', { name: '多选操作' })).not.toBeInTheDocument()
  })

  it('picks every message with ⌘A, none on a second press of 全选, and leaves on Esc', async () => {
    const user = userEvent.setup()
    await chat()
    const bar = await startPicking(user)
    await user.keyboard('{Meta>}a{/Meta}')
    expect(bar).toHaveTextContent('已选 3 条')
    await user.click(within(bar).getByRole('button', { name: '取消全选' }))
    expect(bar).toHaveTextContent('已选 0 条')
    expect(within(bar).getByRole('button', { name: '删除' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('toolbar', { name: '多选操作' })).not.toBeInTheDocument()
  })

  it('copies the picked messages as text, a paragraph each with who said it', async () => {
    const user = userEvent.setup()
    await chat()
    const bar = await startPicking(user)
    await user.click(messages().getAllByRole('checkbox', { name: '选中这条消息' })[1])
    await user.click(within(bar).getByRole('button', { name: '复制' }))
    expect(await within(bar).findByRole('button', { name: '已复制' })).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe('我：你好\n\n小满：**好的**')
  })

  it('lays the picked messages out on a share card, in the look chosen', async () => {
    const user = userEvent.setup()
    await chat()
    const bar = await startPicking(user)
    await user.click(within(bar).getByRole('button', { name: '分享图片' }))
    const dialog = screen.getByRole('dialog', { name: '分享图片' })
    expect(dialog).toHaveTextContent('和我的对话')
    expect(dialog).toHaveTextContent('你好')
    expect(dialog).not.toHaveTextContent('再见')
    await user.click(within(dialog).getByRole('button', { name: '深色' }))
    expect(within(dialog).getByRole('button', { name: '深色' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('the island at the top of the chat', () => {
  const said = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ ...stamp(index + 1), kind: 'user' as const, text: '在吗' }))
  const island = () => screen.findByRole('button', { name: /小满\s*Lv\.\s*2/ })

  const debugOff = () => localStorage.setItem('nengyongbot:preferences', JSON.stringify({ isDebug: false }))

  it("shows the open bot's level, and its details on a click until Esc", async () => {
    debugOff()
    bridge = { ...fakeBridge(), history: vi.fn(async () => said(25)) }
    const user = userEvent.setup()
    renderApp()
    await user.click(await island())
    expect(screen.getByText('经验 0 / 10')).toBeInTheDocument()
    expect(screen.getByText('次对话').nextSibling).toHaveTextContent('5')
    await user.keyboard('{Escape}')
    expect(screen.queryByText('经验 0 / 10')).not.toBeInTheDocument()
  })

  it('explains the levels from the badge on the opened island, and goes back', async () => {
    debugOff()
    bridge = { ...fakeBridge(), history: vi.fn(async () => said(25)) }
    const user = userEvent.setup()
    renderApp()
    await user.click(await island())
    await user.click(screen.getByRole('button', { name: 'Lv.2 等级说明' }))
    expect(screen.getByText('怎么涨经验')).toBeInTheDocument()
    expect(screen.getByText(/Lv\.2 → 3 要 10，还差 10/)).toBeInTheDocument()
    expect(screen.queryByText('经验 0 / 10')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.getByText('经验 0 / 10')).toBeInTheDocument()
  })

  it('turns debug mode on from the opened island and says so', async () => {
    debugOff()
    bridge = { ...fakeBridge(), history: vi.fn(async () => said(25)) }
    const user = userEvent.setup()
    renderApp()
    await user.click(await island())
    await user.click(screen.getByRole('button', { name: '调试模式', pressed: false }))
    expect(screen.getByText('调试模式已开启')).toBeInTheDocument()
    expect(bridge.setDebug).toHaveBeenLastCalledWith(true)
  })

  it('turns debug mode off from the opened island and says so', async () => {
    bridge = { ...fakeBridge(), history: vi.fn(async () => said(25)) }
    const user = userEvent.setup()
    renderApp()
    await user.click(await island())
    await user.click(screen.getByRole('button', { name: '调试模式', pressed: true }))
    expect(screen.getByText('调试模式已关闭')).toBeInTheDocument()
    expect(bridge.setDebug).toHaveBeenLastCalledWith(false)
  })

  it('announces a reply from another bot and opens that bot', async () => {
    const user = userEvent.setup()
    renderApp()
    await emit({ kind: 'entry', botId: 'secretary', entry: { ...stamp(1), kind: 'bot', text: '**提醒**已设好' } })
    expect(screen.getByText('提醒已设好')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '打开' }))
    expect(screen.getByRole('textbox', { name: '跟 秘书Bot 说点什么' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开' })).not.toBeInTheDocument()
  })

  it('announces a task of the open bot ending, with what following a flow earned', async () => {
    renderApp()
    const result = { kind: 'task-result', taskId: 't1', title: '竞品调研', status: 'done', text: '结论' } as const
    await emit({ kind: 'entry', botId: 'chief', entry: { ...stamp(1), ...result, flowId: 'f1' } })
    expect(screen.getByRole('button', { name: /任务完成\s*竞品调研\s*\+50 经验/ })).toBeInTheDocument()
  })

  it('celebrates when a message lifts the open bot to the next level', async () => {
    bridge = { ...fakeBridge(), history: vi.fn(async () => said(24)) }
    renderApp()
    expect(await screen.findAllByText('在吗')).toHaveLength(24) // the history has loaded
    await emit({ kind: 'entry', botId: 'chief', entry: { ...stamp(25), kind: 'user', text: '再来一个' } })
    expect(screen.getByText('信任升级')).toBeInTheDocument()
    expect(screen.getByText('升到 Lv.2')).toBeInTheDocument()
  })

  it('shows what the open bot is running in the background', async () => {
    const running: TaskView = {
      id: 't1',
      title: '竞品调研',
      status: 'running',
      statusText: '读网页',
      createdAt: Date.now(),
      endedAt: null,
      requestedBy: null,
      isRoutine: false,
    }
    bridge = {
      ...fakeBridge(),
      panel: vi.fn(async () => ({
        duty: dutyOf(''),
        routines: [],
        flows: [],
        skills: [],
        miniApps: [],
        library: [],
        tasks: [running],
        models: NO_MODELS,
      })),
    }
    renderApp()
    expect(await screen.findByRole('button', { name: /后台：竞品调研/ })).toBeInTheDocument()
  })
})

describe('App before the onboarding has run', () => {
  it('shows the onboarding first, saves nothing meanwhile and does not push the settings for the missing key', async () => {
    bridge = fakeBridge(false)
    render(<App bridge={bridge} needsOnboarding />)
    expect(screen.getByRole('dialog', { name: '初始引导' })).toBeInTheDocument()
    await waitFor(() => expect(bridge.getModelServices).toHaveBeenCalled())
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(bridge.saveSidebar).not.toHaveBeenCalled()
  })

  it('pins the secretary right after the main bot once the onboarding has hired', async () => {
    bridge = { ...fakeBridge(false), onboard: vi.fn(async () => [secretary()]) }
    const user = userEvent.setup()
    render(<App bridge={bridge} needsOnboarding />)
    await user.click(await screen.findByRole('button', { name: '确定' }))
    await user.click(await screen.findByRole('button', { name: '确定' }))
    await user.click(await screen.findByRole('button', { name: '下一步' }))
    await user.click(await screen.findByRole('button', { name: '跳过介绍' }))
    await user.click(await screen.findByRole('button', { name: '稍后再说' }))
    await user.click(await screen.findByRole('button', { name: '跳过' }))
    await emit({ kind: 'bot-created', bot: secretary() })
    const pinned = await screen.findByRole('group', { name: '置顶区' })
    await waitFor(() =>
      expect(
        within(pinned)
          .getAllByRole('button')
          .map((tile) => tile.textContent),
      ).toEqual(['CEO', '秘书Bot']),
    )
  })

  it('puts a suggestion of the greeting into the message box without sending it', async () => {
    const user = userEvent.setup()
    renderApp()
    const suggestion = '每周一早上给我一份竞品动态'
    await emit({
      kind: 'entry',
      botId: 'chief',
      entry: { ...stamp(1), kind: 'bot', text: '你好', suggestions: [suggestion] },
    })
    await user.click(screen.getByRole('button', { name: suggestion }))
    expect(screen.getByRole('textbox', { name: '跟 小满 说点什么' }).textContent).toBe(suggestion)
    expect(bridge.send).not.toHaveBeenCalled()
  })
})
