import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnimatePresence } from 'motion/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PairingDialog } from './PairingDialog'

const REQUEST = { id: 'request-1', name: 'iPhone', kind: 'phone' } as const

afterEach(cleanup)

function renderDialog(answerPairing = vi.fn(async () => {})) {
  render(
    <AnimatePresence>
      <PairingDialog request={REQUEST} bridge={{ answerPairing }} />
    </AnimatePresence>,
  )
  return answerPairing
}

it('says which device asks', () => {
  renderDialog()
  expect(screen.getByRole('dialog', { name: '允许「iPhone」连接？' })).toBeInTheDocument()
})

it('lets the device in with the code typed from its screen', async () => {
  const answerPairing = renderDialog()
  await userEvent.type(screen.getByRole('textbox', { name: '配对码' }), '0427')
  await userEvent.click(screen.getByRole('button', { name: '允许' }))
  expect(answerPairing).toHaveBeenCalledWith('request-1', '0427')
})

it('cannot allow before all four digits are typed', async () => {
  renderDialog()
  await userEvent.type(screen.getByRole('textbox', { name: '配对码' }), '04a')
  expect(screen.getByRole('textbox', { name: '配对码' })).toHaveValue('04')
  expect(screen.getByRole('button', { name: '允许' })).toBeDisabled()
})

it('turns the device away when denied', async () => {
  const answerPairing = renderDialog()
  await userEvent.click(screen.getByRole('button', { name: '拒绝' }))
  expect(answerPairing).toHaveBeenCalledWith('request-1', null)
})

it('says when the code is wrong', async () => {
  renderDialog(vi.fn(async () => Promise.reject(new Error('配对码不对，照手机上显示的再输一遍'))))
  await userEvent.type(screen.getByRole('textbox', { name: '配对码' }), '1111')
  await userEvent.click(screen.getByRole('button', { name: '允许' }))
  expect(await screen.findByText('配对码不对，照手机上显示的再输一遍')).toBeInTheDocument()
})
