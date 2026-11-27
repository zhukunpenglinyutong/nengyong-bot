// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import { miniAppTools } from '../harness/miniApps'
import { createStore, type Store } from '../harness/store'
import { createWorkspace, type Workspace } from '../harness/workspace'
import { imageResponse, libraryFileResponse, miniAppResponse } from './libraryResponses'

let store: Store
let workspace: Workspace
beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'library-responses-'))
  store = createStore(path.join(dir, 'nengyongbot.db'))
  store.syncRoster([{ id: 'chief', name: '小满' }])
  workspace = createWorkspace(path.join(dir, 'library'))
})

async function savedMiniAppId(): Promise<string> {
  const run = miniAppTools({ botId: 'chief', store, workspace, emit: () => {} }).save_app.execute
  if (!run) throw new Error('save_app has no execute')
  const input = { name: '收入汇总', icon: 'chart', color: 'sky', change: '第一版', html: '<p>v</p>' } as const
  await run(input, { toolCallId: 't', messages: [], context: {} })
  const app = store.get().bots.chief?.miniApps?.[0]
  if (!app) throw new Error('save_app saved nothing')
  return app.id
}

it('serves a mini app page sandboxed even when it is opened on its own', async () => {
  const response = miniAppResponse(store, workspace, `chief/${await savedMiniAppId()}/1`)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-security-policy')).toMatch(/^sandbox allow-scripts;/)
})

it('opens no file a bot wrote as a page on a device', async () => {
  fs.mkdirSync(path.join(workspace.root, 'out'), { recursive: true })
  fs.writeFileSync(path.join(workspace.root, 'out', 'page.html'), '<script>alert(1)</script>')
  expect((await libraryFileResponse(workspace, 'out/page.html')).status).toBe(403)
})

it('shows a document as plain text, with nothing in it running', async () => {
  fs.writeFileSync(path.join(workspace.root, '周报.md'), '# 周报')
  const response = await libraryFileResponse(workspace, encodeURIComponent('周报.md'))
  expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  expect(response.headers.get('content-security-policy')).toMatch(/^sandbox;/)
  expect(await response.text()).toBe('# 周报')
})

it('shows a HEIC photo, which the panel lists as media, on a device as an image', async () => {
  fs.writeFileSync(path.join(workspace.root, 'photo.HEIC'), 'x')
  const response = await libraryFileResponse(workspace, 'photo.HEIC')
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('image/heic')
})

it('serves no image from outside the library', async () => {
  expect((await imageResponse(workspace, '..%2F..%2Fsecret.png')).status).toBe(404)
})
