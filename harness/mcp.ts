import fs from 'node:fs'
import path from 'node:path'
import { createMCPClient } from '@ai-sdk/mcp'
import { StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'
import type { ToolSet } from 'ai'
import { z } from 'zod'
import { EMPTY_MCP_CONFIG, type McpConfigView, type McpServerView } from '../shared/bridge'
import type { Limits } from '../shared/limits'
import { strings } from '../shared/strings'
import { loginShellPath } from './loginShellPath'

const FILE_NAME = 'mcp.json'
const CONFIG_MAX_CHARS = 100_000
const TOOL_NAME_MAX = 64 // OpenAI-compatible APIs reject longer function names

const StdioServer = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  cwd: z.string().optional(),
})
const RemoteServer = z.object({
  url: z.string().url(),
  type: z.enum(['http', 'sse']).default('http'),
  headers: z.record(z.string(), z.string()).default({}),
})
const Server = z.union([StdioServer, RemoteServer], {
  error: () => strings().harness.mcp.commandOrUrl,
})
type Server = z.infer<typeof Server>
// Claude Desktop's format, so a config from another app can be pasted as is
const McpConfig = z.object({ mcpServers: z.record(z.string().min(1), Server) })

/** The servers that connected, by name, and their tools, each named `server__tool`. */
interface McpToolbox {
  servers: string[]
  tools: ToolSet
}

interface Connection {
  view: McpServerView
  tools: ToolSet
  close: () => Promise<void>
}

interface Loaded {
  text: string
  servers: string[]
  connections: Promise<Connection[]>
}

/** The local MCP servers saved in `dir`: connected at start and again on every save. Only tasks use their tools. */
export function createMcp(dir: string, limits: () => Limits) {
  const file = path.join(dir, FILE_NAME)
  let loaded = load()

  function load(): Loaded {
    let text = EMPTY_MCP_CONFIG
    try {
      if (fs.existsSync(file)) text = fs.readFileSync(file, 'utf8')
      return connectAll(text, parseConfig(text))
    } catch (error) {
      const connections = Promise.resolve([failed(FILE_NAME, error)])
      return { text, servers: [], connections }
    }
  }

  function connectAll(text: string, servers: Record<string, Server>): Loaded {
    const connections = Promise.all(
      Object.entries(servers).map(([name, server]) => connect(name, server, dir, limits().mcpConnectSeconds * 1000)),
    )
    return { text, servers: Object.keys(servers), connections }
  }

  async function view(): Promise<McpConfigView> {
    const { text, connections } = loaded
    return { text, servers: (await connections).map((connection) => connection.view) }
  }

  return {
    /** Names of the configured servers, connected or not: the chat tells the model what its tasks can reach. */
    configured: () => loaded.servers,
    async toolbox(): Promise<McpToolbox> {
      const ready = (await loaded.connections).filter((connection) => connection.view.kind === 'ready')
      return {
        servers: ready.map((connection) => connection.view.name),
        tools: Object.fromEntries(ready.flatMap((connection) => Object.entries(connection.tools))),
      }
    },
    view,
    /** Saves the config and reconnects every server; an invalid one throws its reason and nothing changes. */
    async save(input: unknown): Promise<McpConfigView> {
      const text = z.string().max(CONFIG_MAX_CHARS, strings().harness.mcp.tooLong).parse(input)
      const servers = parseConfig(text)
      fs.writeFileSync(file, text)
      const previous = loaded.connections
      loaded = connectAll(text, servers)
      void previous.then(closeAll)
      return view()
    },
    close: () => loaded.connections.then(closeAll),
  }
}

export type Mcp = Pick<ReturnType<typeof createMcp>, 'configured' | 'toolbox'>

function parseConfig(text: string): Record<string, Server> {
  const parsed = McpConfig.safeParse(parseJson(text))
  if (parsed.success) return parsed.data.mcpServers
  const [issue] = parsed.error.issues
  const where = issue.path.join('.') || strings().harness.mcp.topLevel
  throw new Error(strings().harness.mcp.invalid(where, issue.message))
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(strings().harness.mcp.notJson(messageOf(error)))
  }
}

// home: where a local server starts unless its config says otherwise, as the packaged app's own cwd is /, not writable
async function connect(name: string, server: Server, home: string, timeoutMs: number): Promise<Connection> {
  try {
    const transport =
      'command' in server
        ? new StdioMCPTransport({
            ...server,
            cwd: server.cwd ?? home,
            env: { ...withPath(await loginShellPath()), ...server.env },
          })
        : server
    const client = await createMCPClient({
      transport,
      clientName: 'nengyongbot',
      initializationOptions: { timeout: timeoutMs },
    })
    const tools = await client.tools().catch(async (error: unknown) => {
      await client.close()
      throw error
    })
    const named = Object.entries(tools).map(([tool, definition]) => [toolName(name, tool), definition] as const)
    return {
      view: {
        kind: 'ready',
        name,
        tools: Object.entries(tools).map(([tool, definition]) => ({
          name: tool,
          description: typeof definition.description === 'string' ? definition.description : undefined,
        })),
      },
      tools: Object.fromEntries(named),
      close: () => client.close(),
    }
  } catch (error) {
    return failed(name, error)
  }
}

const withPath = (shellPath: string | undefined): Record<string, string> => (shellPath ? { PATH: shellPath } : {})

const toolName = (server: string, tool: string) => `${server}__${tool}`.replace(/[^\w-]/g, '_').slice(0, TOOL_NAME_MAX)

function failed(name: string, error: unknown): Connection {
  const message =
    error instanceof Error && 'code' in error && error.code === 'ENOENT'
      ? strings().harness.mcp.commandNotFound
      : messageOf(error)
  return { view: { kind: 'failed', name, message }, tools: {}, close: async () => {} }
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function closeAll(connections: Connection[]) {
  await Promise.all(
    connections.map((connection) =>
      connection
        .close()
        .catch((error: unknown) => console.error(`MCP server ${connection.view.name} did not close:`, error)),
    ),
  )
}
