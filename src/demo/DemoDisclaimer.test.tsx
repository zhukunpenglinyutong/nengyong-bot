import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DemoDisclaimer } from './DemoDisclaimer'
import { strings } from '../../shared/strings'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('says the data is made up in a banner and, on the first visit, in a dialog', () => {
  render(<DemoDisclaimer />)
  expect(screen.getByText(strings().demo.disclaimer.banner)).toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: strings().demo.disclaimer.title })).toBeInTheDocument()
})

it('does not show the dialog again once it was acknowledged', async () => {
  const { unmount } = render(<DemoDisclaimer />)
  fireEvent.click(screen.getByRole('button', { name: strings().demo.disclaimer.understood }))
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  unmount()
  render(<DemoDisclaimer />)
  expect(screen.getByText(strings().demo.disclaimer.banner)).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
