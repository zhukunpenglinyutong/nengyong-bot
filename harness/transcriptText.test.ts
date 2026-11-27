import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { entryText, toMessages } from './transcriptText'
import type { HarnessState } from './types'
import { createWorkspace } from './workspace'

const emptyLibrary = () => createWorkspace(fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-')))

const stamp = { seq: 1, at: 0 }
const state: HarnessState = { userFacts: [], bots: {}, roster: [], pending: [], onboardedAt: null }

it('notes how long a successful result was, not the result itself', () => {
  const note = entryText({
    ...stamp,
    kind: 'tool',
    name: 'read_file',
    input: { path: 'a.md' },
    output: 'z'.repeat(500),
  })
  expect(note).toBe('调用了 read_file（参数 {"path":"a.md"}），当时拿到了 500 字的结果（这里不再重复原文）')
})

it('clips a long failure message, which can carry the whole rejected input', () => {
  const error = `Invalid input for tool write_file: ${'x'.repeat(30_000)}`
  const note = entryText({ ...stamp, kind: 'tool', name: 'write_file', input: {}, output: { error } })
  expect(note.startsWith('调用 write_file 失败（参数 {}）：Invalid input for tool write_file')).toBe(true)
  expect(note.length).toBeLessThan(300)
})

it('tells the model a task result is not from the user and where its run is recorded', () => {
  const [message] = toMessages(
    'chief',
    [{ ...stamp, kind: 'task-result', taskId: 't1', title: '日报', status: 'failed', text: '网页打不开' }],
    state,
    emptyLibrary(),
  )
  expect(message).toEqual({
    role: 'user',
    content:
      '（任务「日报」[t1] 失败了，这是任务交回的结论，不是用户发的；过程从 t1#1 开始，可以用 read_history 打开）\n网页打不开',
  })
})

it('names attached files by their library path and sends the images that are still there as images', () => {
  const library = emptyLibrary()
  library.write('uploads/a/图.png', new Uint8Array([1, 2]))
  const [message] = toMessages(
    'chief',
    [
      {
        ...stamp,
        kind: 'user',
        text: '看看',
        attachments: ['uploads/a/图.png', 'uploads/b/表.csv', 'uploads/c/删了.jpg'],
      },
    ],
    state,
    library,
  )
  expect(message).toEqual({
    role: 'user',
    content: [
      {
        type: 'text',
        text: '看看\n\n（用户附上的文件，已存进本地资料库：uploads/a/图.png、uploads/b/表.csv、uploads/c/删了.jpg）',
      },
      { type: 'file', data: Buffer.from([1, 2]), mediaType: 'image/png' },
    ],
  })
})

it('tells the model which mini app the user had open, and which one sent a message for them', () => {
  const sent = (isSentByApp: boolean) =>
    toMessages(
      'chief',
      [{ ...stamp, kind: 'user', text: '改一下', miniApp: { id: 'a1', name: '收入汇总', version: 2, isSentByApp } }],
      state,
      emptyLibrary(),
    )[0]
  expect(sent(false)).toEqual({ role: 'user', content: '（用户发这条消息时开着小程序「收入汇总」[a1] v2）\n改一下' })
  expect(sent(true)).toEqual({ role: 'user', content: '（这条是用户在小程序「收入汇总」[a1] 里点按钮发出的）\n改一下' })
})
