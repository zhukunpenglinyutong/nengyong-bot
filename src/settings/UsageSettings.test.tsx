import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { MAIN_BOT } from '../../shared/bot'
import { setLanguage } from '../../shared/language'
import type { ModelPrice, Price, UsageRecord, UsageView } from '../../shared/usage'
import { UsageSettings } from './UsageSettings'

afterEach(() => {
  cleanup()
  localStorage.clear()
  setLanguage('zh')
})

const TODAY = 20_000
const FLASH: Price = { input: 0.3, cached: 0.006, output: 1.2 }

const record = (patch: Partial<UsageRecord>): UsageRecord => ({
  day: TODAY,
  hour: 9,
  botId: MAIN_BOT.id,
  source: { kind: 'chat' },
  model: 'deepseek-flash',
  input: 1_000_000,
  cached: 0,
  output: 10_000,
  runs: 1,
  cost: 1,
  ...patch,
})

const view = (
  records: UsageRecord[],
  prices: ModelPrice[] = [{ model: 'deepseek-flash', price: FLASH, isCustom: false }],
): UsageView => ({
  today: TODAY,
  hour: 19,
  since: TODAY - 29,
  records,
  prices,
  botNames: { [MAIN_BOT.id]: MAIN_BOT.name },
})

// the page suspends until the usage is read; outside act, the test environment never lets it resume
async function renderPage(shown: UsageView, saved: UsageView = shown) {
  const bridge = { usage: vi.fn(async () => shown), setModelPrice: vi.fn(async () => saved) }
  await act(async () => {
    render(<UsageSettings bridge={bridge} bots={[MAIN_BOT]} />)
  })
  return bridge
}

it("shows the range's estimated spend in yuan, and the month's once 30 days are chosen", async () => {
  const user = userEvent.setup()
  await renderPage(view([record({ cost: 1.5 }), record({ day: TODAY - 10, cost: 2 })]))
  expect(await screen.findByText('¥10.02', { selector: 'div' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '30 天' }))
  expect(screen.getByText('近 30 天花费（估算）')).toBeInTheDocument()
  expect(screen.getByText('¥23.38', { selector: 'div' })).toBeInTheDocument()
})

it('shows today hour by hour once 今天 is chosen, averaged over the hours so far', async () => {
  const user = userEvent.setup()
  await renderPage(view([record({ cost: 1 }), record({ hour: 14, cost: 1 }), record({ day: TODAY - 1, cost: 5 })]))
  await user.click(await screen.findByRole('button', { name: '今天' }))
  expect(screen.getByText('今天花费（估算）')).toBeInTheDocument()
  expect(screen.getByText('¥13.36', { selector: 'div' })).toBeInTheDocument()
  expect(screen.getByText('时均')).toBeInTheDocument()
  expect(screen.getByText('¥0.67', { selector: 'div' })).toBeInTheDocument()
})

async function chooseMeasure(label: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '花费 ¥' }))
  await user.click(screen.getByRole('menuitemcheckbox', { name: label }))
}

it('shows the spend in dollars once chosen, and still on the next visit', async () => {
  const shown = view([record({ cost: 1.5 })])
  await renderPage(shown)
  await chooseMeasure('花费 $')
  expect(screen.getByText('$1.50', { selector: 'div' })).toBeInTheDocument()
  cleanup()
  await renderPage(shown)
  expect(await screen.findByText('$1.50', { selector: 'div' })).toBeInTheDocument()
})

it('counts tokens once chosen, so a model with no price shows what it used beside the priced one', async () => {
  const prices = [
    { model: 'deepseek-flash', price: FLASH, isCustom: false },
    { model: 'qwen-local', price: null, isCustom: false },
  ]
  await renderPage(view([record({}), record({ model: 'qwen-local', input: 3_000_000, output: 0, cost: null })], prices))
  await chooseMeasure('Token')
  expect(screen.getByText('近 7 天 Token')).toBeInTheDocument()
  expect(screen.getByText('401 万', { selector: 'div' })).toBeInTheDocument()
  expect(screen.queryByText('价格未知')).not.toBeInTheDocument()
})

it('counts runs once chosen', async () => {
  await renderPage(view([record({ runs: 3 }), record({ day: TODAY - 1, runs: 2 })]))
  await chooseMeasure('次数')
  expect(screen.getByText('近 7 天运行')).toBeInTheDocument()
  expect(screen.getByText('5 次', { selector: 'div' })).toBeInTheDocument()
})

it('offers the breakdown by model only once the range used more than one model', async () => {
  const user = userEvent.setup()
  const prices = [
    { model: 'deepseek-flash', price: FLASH, isCustom: false },
    { model: 'gpt-5', price: { input: 1.25, cached: 0.125, output: 10 }, isCustom: false },
  ]
  await renderPage(view([record({}), record({ day: TODAY - 10, model: 'gpt-5' })], prices))
  const breakdown = await screen.findByRole('group', { name: '明细按什么分' })
  expect(breakdown).not.toHaveTextContent('模型')
  await user.click(screen.getByRole('button', { name: '30 天' }))
  expect(breakdown).toHaveTextContent('模型')
})

it('opens a bot to what it spent on each of its sources', async () => {
  const user = userEvent.setup()
  await renderPage(view([record({ runs: 3 }), record({ source: { kind: 'routine', name: '每日汇报' }, cost: 0.5 })]))
  await user.click(await screen.findByRole('button', { name: new RegExp(MAIN_BOT.name) }))
  expect(screen.getByText('例行任务「每日汇报」')).toBeInTheDocument()
  expect(screen.getByText('3 轮')).toBeInTheDocument()
})

it('closes the open row when the range changes', async () => {
  const user = userEvent.setup()
  await renderPage(view([record({}), record({ day: TODAY - 10, botId: 'ledger', cost: 2 })]))
  const row = await screen.findByRole('button', { name: new RegExp(MAIN_BOT.name) })
  await user.click(row)
  expect(row).toHaveAttribute('aria-expanded', 'true')
  await user.click(screen.getByRole('button', { name: '30 天' }))
  expect(screen.getByRole('button', { name: new RegExp(MAIN_BOT.name) })).toHaveAttribute('aria-expanded', 'false')
})

it('counts the tokens of each model a bot used in English too', async () => {
  const user = userEvent.setup()
  const prices = [
    { model: 'deepseek-flash', price: FLASH, isCustom: false },
    { model: 'gpt-5', price: { input: 1.25, cached: 0.125, output: 10 }, isCustom: false },
  ]
  setLanguage('en')
  await renderPage(view([record({}), record({ model: 'gpt-5' })], prices))
  await user.click(await screen.findByRole('button', { name: new RegExp(MAIN_BOT.name) }))
  expect(screen.getAllByText('1M tokens')).toHaveLength(2)
})

it('refuses a price without input and output, then saves a full one and shows the spend it prices', async () => {
  const user = userEvent.setup()
  const unpriced = view(
    [record({ model: 'qwen-plus', cost: null })],
    [{ model: 'qwen-plus', price: null, isCustom: false }],
  )
  const priced = view(
    [record({ model: 'qwen-plus', cost: 0.12 })],
    [{ model: 'qwen-plus', price: { input: 0.11, cached: 0.11, output: 0.28 }, isCustom: true }],
  )
  const bridge = await renderPage(unpriced, priced)
  await user.click(await screen.findByRole('button', { name: '填价格' }))
  await user.type(screen.getByRole('textbox', { name: '输入' }), '0.11')
  await user.click(screen.getByRole('button', { name: '保存' }))
  expect(screen.getByRole('alert')).toHaveTextContent('输入和输出都要填')
  await user.type(screen.getByRole('textbox', { name: '输出' }), '0.28')
  await user.click(screen.getByRole('button', { name: '保存' }))
  expect(bridge.setModelPrice).toHaveBeenCalledWith('qwen-plus', { input: 0.11, cached: 0.11, output: 0.28 })
  expect(await screen.findByText('你填的价格')).toBeInTheDocument()
})

it('says nothing has been recorded yet before the first model call', async () => {
  await renderPage({ ...view([]), since: null })
  expect(await screen.findByText('还没有用量')).toBeInTheDocument()
})
