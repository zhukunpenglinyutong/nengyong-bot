import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'
import { MentionContext } from './MentionContext'

afterEach(cleanup)

const LIBRARY_IMAGE = '/Users/me/data/library/UI参考/海报 1.png'
const LIBRARY_IMAGE_URL = 'file:///Users/me/data/library/UI%E5%8F%82%E8%80%83/%E6%B5%B7%E6%8A%A5%201.png'

const SKILL = {
  name: 'pdf',
  description: 'For PDFs.',
  source: { kind: 'local' as const, root: '/x', path: '/x' },
  installedAt: 1,
  fileCount: 1,
  scripts: [],
  isUserInvoked: false,
  uses: 0,
  lastUsedAt: null,
}

function renderReply(text: string, openFile = vi.fn(), openSkill = vi.fn()) {
  render(
    <MentionContext
      value={{
        chatBotId: 'chief',
        bots: [],
        open: vi.fn(),
        flows: [],
        openFlow: vi.fn(),
        miniApps: [],
        openMiniApp: vi.fn(),
        thumbUrl: () => '',
        fileUrl: (path) => `attachment:${path}`,
        openFile,
        skills: [
          { ...SKILL, botId: 'chief' },
          { ...SKILL, botId: 'balance' },
        ],
        openSkill,
        answerSkillOffer: vi.fn(),
        openSkillFiles: vi.fn(),
      }}
    >
      <Markdown text={text} />
    </MentionContext>,
  )
  return openFile
}

it('bolds a phrase that ends in Chinese punctuation and runs straight into more text', () => {
  render(<Markdown text="**「没找到」**是指路径写错了" />)
  expect(screen.getByText('「没找到」', { selector: 'strong' })).toBeInTheDocument()
})

it('shows an image from a file:// URL through the library, by its decoded path', () => {
  renderReply(`![海报](${LIBRARY_IMAGE_URL})`)
  expect(screen.getByRole('img', { name: '海报' })).toHaveAttribute('src', `attachment:${LIBRARY_IMAGE}`)
})

it('shows only the description of a remote image', () => {
  renderReply('![海报](https://example.com/a.png)')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByText('海报')).toBeInTheDocument()
})

it('opens the file a file:// link points to', () => {
  const openFile = renderReply(`[原图链接](${LIBRARY_IMAGE_URL})`)
  fireEvent.click(screen.getByRole('button', { name: '原图链接' }))
  expect(openFile).toHaveBeenCalledWith(LIBRARY_IMAGE)
})

it('opens a library image at full size when clicked', () => {
  renderReply(`![海报](${LIBRARY_IMAGE_URL})`)
  fireEvent.click(screen.getByRole('button', { name: '查看 海报' }))
  expect(screen.getByRole('dialog', { name: '海报' })).toBeInTheDocument()
})

it("opens a skill named in a reply, the chat's own unless the link says whose", () => {
  const openSkill = vi.fn()
  renderReply('用 [pdf](skill:pdf) 和 [pdf](skill:balance/pdf)', vi.fn(), openSkill)
  const [own, theirs] = screen.getAllByRole('button', { name: 'pdf' })
  fireEvent.click(own)
  fireEvent.click(theirs)
  expect(openSkill.mock.calls).toEqual([
    ['chief', 'pdf'],
    ['balance', 'pdf'],
  ])
})

it('leaves a skill no bot has as plain text', () => {
  renderReply('[xlsx](skill:xlsx)')
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.getByText('xlsx')).toBeInTheDocument()
})
