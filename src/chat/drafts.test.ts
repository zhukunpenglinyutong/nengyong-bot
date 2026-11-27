import { expect, it, vi } from 'vitest'
import { createDrafts, fillWith } from './drafts'

it("keeps each bot's draft apart and tells subscribers when one changes", () => {
  const drafts = createDrafts()
  const listener = vi.fn()
  drafts.subscribe(listener)
  drafts.edit('chief', () => ({ text: '写到一半' }))
  expect(drafts.of('chief').text).toBe('写到一半')
  expect(drafts.of('secretary').text).toBe('')
  expect(listener).toHaveBeenCalledTimes(1)
})

it('starts the box over each time a text is filled in from outside it', () => {
  const drafts = createDrafts()
  drafts.edit('chief', fillWith('第一句'))
  drafts.edit('chief', fillWith('第二句'))
  expect(drafts.of('chief')).toMatchObject({ text: '第二句', fills: 2 })
})
