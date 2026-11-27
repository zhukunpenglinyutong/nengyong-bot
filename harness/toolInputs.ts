import { z } from 'zod'
import { ModelChoice } from '../shared/modelServices'

// models often fill an optional id with "": that means none, never a flow or app whose id is empty
export const OptionalId = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional())

/** A line of text a tool takes: trimmed, not empty, at most `max` characters. */
export const line = (max: number) => z.string().trim().min(1).max(max)

/** The model a tool call names: only when the user asked for one in the chat. */
export const MODEL_INPUT = ModelChoice.optional().describe(
  '用户在聊天里点名要用的模型：账号 id（见「模型」）和 list_models 列出的模型名；用户没提就不填',
)
