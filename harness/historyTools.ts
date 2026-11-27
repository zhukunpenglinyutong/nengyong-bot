import { tool } from 'ai'
import { z } from 'zod'
import { BOT_ID_PATTERN } from '../shared/bot'
import type { Entry } from '../shared/bridge'
import type { Limits } from '../shared/limits'
import { TIMEZONE } from '../shared/timezone'
import type { Store } from './store'
import { clip, Offset, textWindow } from './textWindow'
import { entryText, speaker } from './transcriptText'
import type { HarnessState } from './types'

const REF = new RegExp(`^(${BOT_ID_PATTERN})#(\\d+)$`)
const REF_HINT = 'ref 形如 chief#12，用 search_history 或 read_history 返回的值'
const refOf = (transcriptId: string, seq: number) => `${transcriptId}#${seq}`

/** Searching and opening transcripts by ref: the way back to anything that left the context. */
export function historyTools(store: Store, { searchPreviewChars, readWindowChars }: Limits) {
  const preview = (text: string) =>
    text.length > searchPreviewChars
      ? `${clip(text, searchPreviewChars)}…（共 ${text.length} 字，打开这条的 ref 看全文）`
      : text

  return {
    search_history: tool({
      description:
        '在所有 Bot 的历史对话里按关键词搜索（不区分大小写），返回最近的匹配。每条带 ref，要看当时的上下文用 read_history 打开。',
      inputSchema: z.object({ query: z.string().min(1), botId: z.string().optional() }),
      execute: async ({ query, botId: only }) => {
        const needle = query.toLowerCase()
        const state = store.get()
        const ids = only ? [only] : Object.keys(state.bots)
        const hits = ids.flatMap((id) =>
          store
            .history(id)
            .flatMap((entry) =>
              'text' in entry && entry.text.toLowerCase().includes(needle) ? [{ id, entry, text: entry.text }] : [],
            ),
        )
        return hits
          .toSorted((a, b) => a.entry.at - b.entry.at)
          .slice(-20)
          .map(({ id, entry, text }) => {
            const name = state.bots[id]?.name ?? id
            return { bot: name, ...historyItem(state, id, name, entry, preview(text)) }
          })
      },
    }),
    read_history: tool({
      description:
        '打开历史对话或任务过程里的一条（ref 来自 search_history、read_history 或任务结果），连同前后的记录一起读。这一条很长时分段给出，前后各条只给开头。',
      inputSchema: z.object({
        ref: z.string().trim().regex(REF, REF_HINT).describe('形如 chief#12'),
        around: z.number().int().min(0).max(10).default(5).describe('前后各读几条（工具调用也算一条）'),
        offset: Offset,
      }),
      execute: async ({ ref, around, offset }) => {
        const match = REF.exec(ref)
        if (!match) throw new Error(REF_HINT)
        const [, id, seqText] = match
        const seq = Number(seqText)
        const state = store.get()
        const owner = Object.hasOwn(state.bots, id) ? id : store.task(id)?.botId
        if (!owner) throw new Error(`没有 id 为 ${id} 的 Bot 或任务`)
        const name = state.bots[owner]?.name ?? owner
        const entries = store.range(id, seq - around, seq + around)
        if (!entries.some((e) => e.seq === seq)) throw new Error(`没有这条记录：${ref}`)
        return entries.map((e) => {
          const text = entryText(e)
          const shown = e.seq === seq ? textWindow(text, offset, readWindowChars) : preview(text)
          return historyItem(state, id, name, e, shown)
        })
      },
    }),
  }
}

/** One transcript entry as the history tools hand it to the model. */
function historyItem(state: HarnessState, transcriptId: string, botName: string, entry: Entry, text: string) {
  return {
    ref: refOf(transcriptId, entry.seq),
    who: speaker(entry, state, botName),
    at: new Date(entry.at).toLocaleString('zh-CN', { timeZone: TIMEZONE, hour12: false }),
    text,
  }
}
