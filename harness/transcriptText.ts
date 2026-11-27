import type { ModelMessage } from 'ai'
import type { Entry } from '../shared/bridge'
import { withAttachments } from './attachments'
import { clip } from './textWindow'
import type { HarnessState } from './types'
import type { Workspace } from './workspace'

/** Transcript → chat messages. A tool record becomes a one-line note: the model knows what it did, without the output. */
export function toMessages(
  transcriptId: string,
  entries: Entry[],
  state: HarnessState,
  workspace: Workspace,
): ModelMessage[] {
  return entries.flatMap((e): ModelMessage[] => {
    switch (e.kind) {
      case 'user': {
        const notes = [
          e.quote && `（用户在回复 ${transcriptId}#${e.quote.seq} 这条消息，它的开头是：「${e.quote.text}」）`,
          e.miniApp &&
            (e.miniApp.isSentByApp
              ? `（这条是用户在小程序「${e.miniApp.name}」[${e.miniApp.id}] 里点按钮发出的）`
              : `（用户发这条消息时开着小程序「${e.miniApp.name}」[${e.miniApp.id}] v${e.miniApp.version}）`),
        ]
        const text = [...notes.filter(Boolean), e.text].join('\n')
        return [{ role: 'user', content: e.attachments ? withAttachments(workspace, text, e.attachments) : text }]
      }
      case 'bot':
        return [{ role: 'assistant', content: e.text }]
      case 'from-bot':
        return [
          {
            role: 'user',
            content: `（来自 Bot「${state.bots[e.from]?.name ?? e.from}」的委托，不是用户本人）\n${e.text}`,
          },
        ]
      case 'routine':
        return [{ role: 'user', content: `（例行任务「${e.name}」到点了，不是用户本人发的）\n${e.text}` }]
      case 'task-result':
        return [
          {
            role: 'user',
            content: `（任务「${e.title}」[${e.taskId}] ${e.status === 'done' ? '完成了' : '失败了'}，这是任务交回的结论，不是用户发的；过程从 ${e.taskId}#1 开始，可以用 read_history 打开）\n${e.text}`,
          },
        ]
      case 'skill-answer': {
        const target = e.botId === transcriptId ? '你' : `「${state.bots[e.botId]?.name ?? e.botId}」[${e.botId}]`
        return [{ role: 'user', content: `（系统记录，不是用户发的）用户${skillAnswerNote(e, target)}` }]
      }
      case 'tool':
        return [{ role: 'user', content: `（系统记录，不是用户发的）你${toolNote(e)}` }]
      default:
        return e satisfies never
    }
  })
}

/** An entry as plain text, for transcripts the model reads as text: a message's own, or a one-line note of a record. */
export function entryText(entry: Entry): string {
  if ('text' in entry) return entry.text
  return entry.kind === 'tool' ? toolNote(entry) : skillAnswerNote(entry, ` ${entry.botId}`)
}

const NOTE_FIELD_CHARS = 200
const shorten = (text: string) => (text.length > NOTE_FIELD_CHARS ? `${clip(text, NOTE_FIELD_CHARS)}…` : text)

/** A tool record as one line for the model: what was called and how it went, without the output itself. */
function toolNote(entry: Extract<Entry, { kind: 'tool' }>): string {
  const args = shorten(JSON.stringify(entry.input ?? {}))
  const { output } = entry
  if (typeof output === 'object' && output !== null && 'error' in output)
    return `调用 ${entry.name} 失败（参数 ${args}）：${shorten(String(output.error))}`
  if (output === undefined) return `调用了 ${entry.name}（参数 ${args}）`
  const size = typeof output === 'string' ? output.length : JSON.stringify(output).length
  return `调用了 ${entry.name}（参数 ${args}），当时拿到了 ${size} 字的结果（这里不再重复原文）`
}

/** How the user answered an install card, said of the bot the skills went to. */
const skillAnswerNote = (entry: Extract<Entry, { kind: 'skill-answer' }>, target: string) =>
  entry.names.length
    ? `在确认卡上点了「装上」：技能 ${entry.names.join('、')} 已经装给${target}，现在就能用；卡上别的没勾，没有装。`
    : '在确认卡上点了「不装」：卡上的技能一个都没有装。'

/** Who wrote an entry, for transcripts the model reads as plain text (summaries, search results). */
export function speaker(entry: Entry, state: HarnessState, botName: string): string {
  switch (entry.kind) {
    case 'user':
    case 'skill-answer':
      return '用户'
    case 'bot':
      return botName
    case 'from-bot':
      return `委托自 ${state.bots[entry.from]?.name ?? entry.from}`
    case 'routine':
      return `例行任务「${entry.name}」`
    case 'task-result':
      return `任务「${entry.title}」`
    case 'tool':
      return '工具'
    default:
      return entry satisfies never
  }
}
