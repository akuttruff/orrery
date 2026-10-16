import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

/**
 * The astrology tools, called directly. astro-mcp is an MCP server over
 * stdio; LM Studio starts it for the chat app, and this starts it the same
 * way for itself. One process is kept running: the ephemeris loads once,
 * and each call is then well under a second.
 */

export interface ServerSpec {
  command: string
  args?: string[]
  env?: Record<string, string>
}

/** LM Studio's own MCP config: the one place the server's command is written down. */
export const MCP_CONFIG_PATH = path.join(os.homedir(), '.lmstudio', 'mcp.json')
/** The entry in it that is astro-mcp. */
export const ASTRO_SERVER_NAME = 'astrology-v2'
/** Where the repo lives when the config has no entry for it. */
const FALLBACK: ServerSpec = { command: path.join(os.homedir(), 'Code', 'astro-mcp', 'start-server.sh') }

export function readAstroSpec(file = MCP_CONFIG_PATH, name = ASTRO_SERVER_NAME): ServerSpec {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { mcpServers?: Record<string, ServerSpec> }
    const spec = parsed.mcpServers?.[name]
    if (spec?.command) return spec
  } catch { /* no config, or not ours to parse: the fallback below */ }
  return FALLBACK
}

export class AstroToolError extends Error {}

export type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<string>

export class Astro {
  private client: Client | null = null
  private connecting: Promise<Client> | null = null

  constructor(private readonly spec: ServerSpec = readAstroSpec(), private readonly timeoutMs = 60_000) {}

  private connect(): Promise<Client> {
    if (this.client) return Promise.resolve(this.client)
    if (!this.connecting) {
      this.connecting = (async () => {
        const transport = new StdioClientTransport({
          command: this.spec.command,
          args: this.spec.args ?? [],
          env: { ...(process.env as Record<string, string>), ...this.spec.env },
          stderr: 'ignore',
        })
        const client = new Client({ name: 'orrery', version: '1.0.0' })
        transport.onclose = () => { if (this.client === client) this.client = null }
        await client.connect(transport)
        this.client = client
        return client
      })().finally(() => { this.connecting = null })
    }
    return this.connecting
  }

  /** Call one tool and return its text. A server that died is started again once. */
  async call(name: string, args: Record<string, unknown>): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      const client = await this.connect()
      try {
        const result = await client.callTool({ name, arguments: args }, undefined, { timeout: this.timeoutMs })
        const content = (result.content as { type: string; text?: string }[] | undefined) ?? []
        const text = content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n')
        if (result.isError) throw new AstroToolError(text || `${name} failed`)
        return text
      } catch (err) {
        if (err instanceof AstroToolError || attempt > 0) throw err
        // The transport broke: forget it and try once on a fresh one.
        this.client = null
        await client.close().catch(() => { /* already gone */ })
      }
    }
  }

  async close(): Promise<void> {
    const c = this.client
    this.client = null
    await c?.close().catch(() => { /* already gone */ })
  }
}
