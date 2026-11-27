import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { McpConfigView, NengyongBotBridge } from '../../shared/bridge'
import { ToolsSettings } from './ToolsSettings'

const SAVED: McpConfigView = {
  text: '{"mcpServers":{"playwright":{"command":"npx"}}}',
  servers: [
    {
      kind: 'ready',
      name: 'playwright',
      tools: [{ name: 'browser_click', description: '点击页面上的元素' }, { name: 'browser_close' }],
    },
  ],
}

afterEach(cleanup)

// the page suspends until the config is read; outside act, the test environment never lets it resume
const renderPage = async (setMcpConfig: NengyongBotBridge['setMcpConfig']) => {
  await act(async () => {
    render(<ToolsSettings bridge={{ getMcpConfig: async () => SAVED, setMcpConfig }} />)
  })
}

it('formats the MCP config with two-space indentation', async () => {
  await renderPage(vi.fn())
  await userEvent.click(await screen.findByRole('button', { name: '格式化' }))
  expect(screen.getByRole('textbox', { name: 'MCP 配置' })).toHaveValue(JSON.stringify(JSON.parse(SAVED.text), null, 2))
})

it('says the MCP config is not JSON when formatting fails', async () => {
  await renderPage(vi.fn())
  await userEvent.type(await screen.findByRole('textbox', { name: 'MCP 配置' }), ',')
  await userEvent.click(screen.getByRole('button', { name: '格式化' }))
  expect(screen.getByRole('alert')).toHaveTextContent('MCP 配置不是合法的 JSON')
})

it('shows the saved config and how each server connected', async () => {
  await renderPage(vi.fn())
  expect(await screen.findByRole('textbox', { name: 'MCP 配置' })).toHaveValue(SAVED.text)
  expect(screen.getByText('2 个工具')).toBeInTheDocument()
  expect(screen.getByText('已连接')).toBeInTheDocument()
})

it("lists a connected server's tools when its row is opened", async () => {
  await renderPage(vi.fn())
  expect(screen.queryByRole('button', { name: 'browser_click' })).not.toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: /playwright/ }))
  expect(screen.getByRole('button', { name: 'browser_click' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'browser_close' })).toBeInTheDocument()
})

it('shows what a tool does when its name is clicked', async () => {
  await renderPage(vi.fn())
  await userEvent.click(await screen.findByRole('button', { name: /playwright/ }))
  await userEvent.click(screen.getByRole('button', { name: 'browser_click' }))
  expect(screen.getByText('点击页面上的元素')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'browser_close' }))
  expect(screen.getByText('没有说明')).toBeInTheDocument()
})

it('saves the edited config and shows the servers as they reconnected', async () => {
  const setMcpConfig = vi.fn(async (text: string) => ({
    text,
    servers: [{ kind: 'failed' as const, name: 'figma', message: '找不到这个命令' }],
  }))
  await renderPage(setMcpConfig)
  const box = await screen.findByRole('textbox', { name: 'MCP 配置' })
  await userEvent.clear(box)
  await userEvent.paste('{"mcpServers":{"figma":{"command":"figma-mcp"}}}')
  await userEvent.click(screen.getByRole('button', { name: '保存并连接' }))
  expect(setMcpConfig).toHaveBeenCalledWith('{"mcpServers":{"figma":{"command":"figma-mcp"}}}')
  expect(await screen.findByText('找不到这个命令')).toBeInTheDocument()
  expect(screen.getByText('连接失败')).toBeInTheDocument()
})

it('says 已保存 on the button once the config is saved', async () => {
  await renderPage(vi.fn(async () => SAVED))
  await userEvent.click(await screen.findByRole('button', { name: '保存并连接' }))
  expect(await screen.findByRole('button', { name: '已保存' })).toBeInTheDocument()
})

it('shows why the config was not saved', async () => {
  const setMcpConfig = vi.fn(async () => {
    throw new Error("Error invoking remote method 'nengyongbot:setMcpConfig': Error: MCP 配置不是合法的 JSON")
  })
  await renderPage(setMcpConfig)
  await userEvent.click(await screen.findByRole('button', { name: '保存并连接' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('MCP 配置不是合法的 JSON')
})

it('explains the MCP config format in a dialog opened from the question mark', async () => {
  await renderPage(vi.fn())
  await userEvent.click(screen.getByRole('button', { name: 'MCP 使用教程' }))
  expect(screen.getByRole('dialog', { name: '怎么接入 MCP' })).toHaveTextContent('@playwright/mcp@latest')
})
