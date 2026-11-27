import { z } from 'zod'

export const MESSAGE_MAX_CHARS = 20_000 // the text of one message the user sends

const count = (min: number, max: number) => z.number().int().min(min).max(max)

/** 精细化配置: the limits of a bot's work, changed in debug mode. Each name carries its unit. */
export const Limits = z.object({
  chatSteps: count(1, 500),
  modelSilenceSeconds: count(10, 3600),
  recentEntries: count(10, 1000), // older entries are folded into the summary once there are twice as many
  taskSteps: count(1, 1000),
  runningTasks: count(1, 20),
  taskTimeoutMinutes: count(1, 24 * 60),
  commandTimeoutMinutes: count(1, 24 * 60),
  taskResultChars: count(200, 100_000),
  endedTasksShown: count(0, 50),
  readWindowChars: count(1000, 200_000),
  searchPreviewChars: count(50, 5000),
  maxFacts: count(10, 2000),
  maxRoutines: count(1, 200),
  maxFlows: count(1, 200),
  fileMegabytes: count(1, 500),
  webMegabytes: count(1, 100),
  webTimeoutSeconds: count(1, 600),
  attachmentsPerMessage: count(1, 50),
  attachmentMegabytes: count(1, 200),
  mcpConnectSeconds: count(5, 600),
})
export type Limits = z.infer<typeof Limits>

export const DEFAULT_LIMITS: Limits = {
  chatSteps: 30,
  modelSilenceSeconds: 300,
  recentEntries: 80,
  taskSteps: 100,
  runningTasks: 3,
  taskTimeoutMinutes: 15,
  commandTimeoutMinutes: 5,
  taskResultChars: 2000,
  endedTasksShown: 5,
  readWindowChars: 20_000,
  searchPreviewChars: 300,
  maxFacts: 200,
  maxRoutines: 20,
  maxFlows: 30,
  fileMegabytes: 5,
  webMegabytes: 2,
  webTimeoutSeconds: 15,
  attachmentsPerMessage: 10,
  attachmentMegabytes: 20,
  mcpConnectSeconds: 60,
}

export const BYTES_PER_MB = 1_000_000
