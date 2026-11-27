import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { DismissedSettings } from './DismissedSettings'

afterEach(cleanup)

const ADOPTED = {
  bot: { id: 'lead', name: '开源负责人', shape: 'blob' as const, color: '#1E1E22' },
  sectionId: 's1',
  at: Date.now(),
}

const renderPage = (onDelete = vi.fn(async () => {})) => {
  render(<DismissedSettings dismissed={[ADOPTED]} onRestore={vi.fn()} onDelete={onDelete} />)
  return onDelete
}

it('deletes a bot for good only after the user confirms', async () => {
  const onDelete = renderPage()
  await userEvent.click(screen.getByRole('button', { name: '彻底删除 开源负责人' }))
  const dialog = screen.getByRole('dialog', { name: '彻底删除“开源负责人”？' })
  expect(onDelete).not.toHaveBeenCalled()
  await userEvent.click(within(dialog).getByRole('button', { name: '彻底删除' }))
  expect(onDelete).toHaveBeenCalledWith('lead')
})

it('says why a bot could not be deleted', async () => {
  renderPage(
    vi.fn(async () => {
      throw new Error('数据目录不可写')
    }),
  )
  await userEvent.click(screen.getByRole('button', { name: '彻底删除 开源负责人' }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '彻底删除' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('数据目录不可写')
})
