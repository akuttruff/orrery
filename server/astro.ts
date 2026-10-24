import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'

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

/** The entry that is tarot-mcp, which deals the cards. */
export const TAROT_SERVER_NAME = 'tarot'
const TAROT_FALLBACK: ServerSpec = { command: 'node', args: [path.join(os.homedir(), 'Code', 'tarot-mcp', 'dist', 'index.js')] }

/** One server's entry in LM Studio's config, or the fallback when it has none. */
export function readServerSpec(name: string, fallback: ServerSpec, file = MCP_CONFIG_PATH): ServerSpec {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { mcpServers?: Record<string, ServerSpec> }
    const spec = parsed.mcpServers?.[name]
    if (spec?.command) return spec
  } catch { /* no config, or not ours to parse: the fallback */ }
  return fallback
}

export const readAstroSpec = (file = MCP_CONFIG_PATH, name = ASTRO_SERVER_NAME): ServerSpec => readServerSpec(name, FALLBACK, file)
export const readTarotSpec = (file = MCP_CONFIG_PATH): ServerSpec => readServerSpec(TAROT_SERVER_NAME, TAROT_FALLBACK, file)

/** Where tarot-mcp keeps the card pictures: deck/ beside the dist/ its command names. */
export function tarotDeckDir(spec: ServerSpec = readTarotSpec()): string {
  const entry = spec.args?.find((a) => a.endsWith('.js'))
  return entry ? path.resolve(path.dirname(entry), '..', 'deck') : path.resolve(path.dirname(TAROT_FALLBACK.args![0]!), '..', 'deck')
}

export class AstroToolError extends Error {}

export type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<string>

/** The part of an MCP client a call needs; a test passes its own. */
export type ToolClient = Pick<Client, 'callTool' | 'close'>
/** Starts the server and connects to it; `onClose` is called when the connection goes, however it goes. */
export type ConnectClient = (onClose: () => void) => Promise<ToolClient>

/**
 * Whether a failed call means the server itself is gone, so starting a fresh
 * one is worth it. A timeout or a JSON-RPC error is the call's own: other
 * calls on the same server are fine, and a restart would cut them off.
 */
export function connectionLost(err: unknown): boolean {
  if (err instanceof McpError) return err.code === ErrorCode.ConnectionClosed
  const code = (err as NodeJS.ErrnoException | null)?.code
  return code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED' || (err instanceof Error && err.message === 'Not connected')
}

/** A name for the log: the repo the server runs from (astro-mcp, tarot-mcp). */
export function serverLabel(spec: ServerSpec): string {
  const entry = spec.args?.find((a) => a.endsWith('.js'))
  return path.basename(entry ? path.dirname(path.dirname(entry)) : path.dirname(spec.command)) || 'mcp'
}

/** The real server over stdio. Its stderr goes to the log, a line at a time and labelled, so a crash says why. */
function stdioClient(spec: ServerSpec, label: string): ConnectClient {
  return async (onClose) => {
    const transport = new StdioClientTransport({
      command: spec.command,
      args: spec.args ?? [],
      env: { ...(process.env as Record<string, string>), ...spec.env },
      stderr: 'pipe',
    })
    let rest = ''
    transport.stderr?.on('data', (chunk: Buffer) => {
      const lines = (rest + chunk.toString('utf8')).split('\n')
      rest = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) console.error(`[${label}] ${line}`)
    })
    const client = new Client({ name: 'orrery', version: '1.0.0' })
    transport.onclose = onClose
    await client.connect(transport)
    return client
  }
}

export class Astro {
  private client: ToolClient | null = null
  private connecting: Promise<ToolClient> | null = null
  private readonly open: ConnectClient

  constructor(spec: ServerSpec = readAstroSpec(), private readonly timeoutMs = 60_000, open?: ConnectClient) {
    this.open = open ?? stdioClient(spec, serverLabel(spec))
  }

  /** Whether a server is up now; the health probe does not start one cold. */
  get running(): boolean {
    return this.client !== null
  }

  private connect(): Promise<ToolClient> {
    if (this.client) return Promise.resolve(this.client)
    if (!this.connecting) {
      this.connecting = (async () => {
        let client: ToolClient | null = null
        client = await this.open(() => { if (client && this.client === client) this.client = null })
        this.client = client
        return client
      })().finally(() => { this.connecting = null })
    }
    return this.connecting
  }

  /** Call one tool and return its text. A server that died is started again once; any other failure is the call's. */
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
        if (attempt > 0 || !connectionLost(err)) throw err
        // The transport broke: forget it (unless another call already has) and try once on a fresh one.
        if (this.client === client) this.client = null
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
