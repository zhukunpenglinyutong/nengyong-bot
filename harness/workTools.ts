import { tool } from 'ai'
import { z } from 'zod'
import type { Limits } from '../shared/limits'
import { runCommand } from './command'
import { Offset } from './textWindow'
import { fetchUrl, webSearch } from './web'
import type { Workspace } from './workspace'

interface WorkContext {
  workspace: Workspace
  searchKey: () => string | null // the key of the DeepSeek account web_search goes through; null: web search is off
  limits: Limits
  onStatus: (text: string) => void // set_status: what the task is doing now, shown to the user
}

/** Files, the web and progress: the tools that do the work itself. */
export function workTools({ workspace, searchKey, limits, onStatus }: WorkContext) {
  return {
    set_status: tool({
      description:
        '更新你现在在做什么，显示给用户看（例如“核对日程”“整理周报”）。动手做多步工作前调用一次，切换到新阶段时再调用。',
      inputSchema: z.object({ text: z.string().min(1).max(24).describe('动宾短语，不加“正在”，不超过 12 个字') }),
      execute: async ({ text }) => {
        onStatus(text)
        return { ok: true }
      },
    }),
    web_search: tool({
      description:
        '搜索网页，返回标题、链接、来源、日期和摘要。支持 site:、"精确词"、-排除词、after:2026-01-01 等写法。要看全文再用 fetch_url 打开链接。',
      inputSchema: z.object({ query: z.string().min(1).max(128) }),
      execute: async ({ query }) => {
        const key = searchKey()
        if (!key) throw new Error('网络搜索没有打开：请用户在设置「模型服务」里打开，它要用 DeepSeek 账号')
        return webSearch(query, key)
      },
    }),
    fetch_url: tool({
      description: '读取一个公开网址或 API 的内容（http/https，返回纯文本，一次一段）。不知道地址时先用 web_search。',
      inputSchema: z.object({
        url: z.string().url(),
        accept: z
          .string()
          .max(100)
          .optional()
          .describe('可选的 Accept 头；GitHub 加星时间要用 application/vnd.github.star+json'),
        offset: Offset,
      }),
      execute: async ({ url, accept, offset }) => fetchUrl(url, limits, accept, offset),
    }),
    list_files: tool({
      description: '列出一个目录里的文件（目录以 / 结尾）。',
      inputSchema: z.object({ dir: z.string().default('.') }),
      execute: async ({ dir }) => workspace.list(dir),
    }),
    read_file: tool({
      description: '读取文本文件，一次一段。',
      inputSchema: z.object({ path: z.string(), offset: Offset }),
      execute: async ({ path, offset }) => workspace.read(path, offset, limits),
    }),
    write_file: tool({
      description: '写入（新建或覆盖）文本文件，目录会自动创建。',
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }) => ({ written: workspace.write(path, content) }),
    }),
    edit_file: tool({
      description:
        '改文本文件里的一处：oldText 是从文件里一字不差抄下的一段，只能对上一处，换成 newText。改已有文件的局部用它，一次改一处，不要用 write_file 整篇重写。',
      inputSchema: z.object({ path: z.string(), oldText: z.string().min(1), newText: z.string() }),
      execute: async ({ path, oldText, newText }) => ({ edited: workspace.edit(path, oldText, newText, limits) }),
    }),
    run_command: tool({
      description: `在用户电脑上执行一条命令（由 ${process.platform === 'win32' ? 'Windows 的 cmd.exe' : '/bin/sh'} 执行），工作目录是本地资料库，返回它打印的内容。一条命令最多跑 ${limits.commandTimeoutMinutes} 分钟，超时会被中止。用来打包压缩、转换格式、生成图片、跑脚本这类文件工具做不到的事。不能交互：会等输入的命令要加参数跳过。输出很长时重定向到文件，再用 read_file 读。`,
      inputSchema: z.object({ command: z.string().min(1) }),
      execute: async ({ command }, { abortSignal }) =>
        runCommand(command, workspace.root, limits.readWindowChars, limits.commandTimeoutMinutes * 60_000, abortSignal),
    }),
  }
}
