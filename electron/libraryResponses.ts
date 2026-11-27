import fs from 'node:fs'
import { z } from 'zod'
import { libraryFile } from '../harness/library'
import { miniAppHtml } from '../harness/miniApps'
import type { Store } from '../harness/store'
import type { Workspace } from '../harness/workspace'
import { imageType, mediaType } from '../shared/attachment'
import { BotId } from '../shared/bot'
import { strings } from '../shared/strings'

export const MiniAppId = z.string().regex(/^[\w-]{1,40}$/)
export const Version = z.number().int().min(1)

// a mini app's page is model output: no network, no other page, nothing loaded but what is inline or a data: URL.
// sandbox: opened on its own (a link in a reply), it would otherwise run on the app's origin, with a device's cookie
const MINI_APP_CSP =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'"
// a file a bot wrote, opened on a device: shown as it is, nothing in it runs
const LIBRARY_FILE_CSP = "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'"

/** `<botId>/<miniAppId>/<version>`: that version's page with its data, for a sandboxed iframe only. */
export function miniAppResponse(store: Store, workspace: Workspace, path: string): Response {
  const [botId, miniAppId, version] = path.split('/').map(decodeURIComponent)
  try {
    const html = miniAppHtml(
      store,
      workspace,
      BotId.parse(botId),
      MiniAppId.parse(miniAppId),
      Version.parse(Number(version)),
    )
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': MINI_APP_CSP,
        'cache-control': 'no-store', // 重新进入 loads the same URL and must read the data as it is now
      },
    })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), { status: 404 })
  }
}

/** An image in the library, by its URL-encoded path; nothing a bot wrote (an .html page, say) is ever loaded this way. */
export async function imageResponse(workspace: Workspace, path: string): Promise<Response> {
  const file = decodeURIComponent(path)
  const type = imageType(file)
  if (!type) return new Response(null, { status: 404 })
  try {
    return new Response(new Uint8Array(await fs.promises.readFile(workspace.resolve(file))), {
      headers: { 'content-type': type },
    })
  } catch {
    // outside the library, or gone: the same answer, so a probe learns nothing about the disk
    return new Response(null, { status: 404 })
  }
}

/** A document or a picture in the library, to look at on a device; other files open only on this computer. */
export async function libraryFileResponse(workspace: Workspace, path: string): Promise<Response> {
  const wanted = decodeURIComponent(path)
  try {
    const { absolute, kind } = libraryFile(workspace, wanted)
    const type = kind === 'doc' ? 'text/plain; charset=utf-8' : mediaType(absolute)
    if (!type) return text(403, strings().main.library.desktopOnly)
    return new Response(new Uint8Array(await fs.promises.readFile(absolute)), {
      headers: { 'content-type': type, 'content-security-policy': LIBRARY_FILE_CSP },
    })
  } catch {
    return text(404, strings().main.library.missing)
  }
}

const text = (status: number, message: string) =>
  new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
