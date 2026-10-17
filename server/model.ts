import type { ToolUse } from '../src/types.ts'
import type { ServerConfig } from './store.ts'

/**
 * One streamed reply from LM Studio's /api/v1/chat: the reading text as it
 * is written, reasoning left out. The same endpoint the chat app uses, so
 * the same models, token and reasoning levels apply. A request can name
 * LM Studio's MCP integrations; LM Studio then runs the tool calls itself,
 * and the stream reports each one.
 */

interface ChatEvent {
  type: string
  content?: string
  error?: { message?: string }
  /** The tool events: `tool` is the plugin, the tool's own name comes with tool_call.name or .arguments; success and failure may name it or not. */
  tool?: string
  tool_name?: string
  provider_info?: { plugin_id?: string }
  arguments?: unknown
  output?: unknown
  reason?: string
}

/** A result is kept whole (a year of transits is ~20 KB); this stops only a runaway tool. */
const MAX_TOOL_OUTPUT = 50_000
/** Parameters longer than this, as JSON, are cut down: they are for reading, not replaying. */
const MAX_TOOL_ARGS = 8_000

/** A tool's result as text: MCP content parts' text joined, or the raw string, or compact JSON. */
export function toolOutputText(raw: unknown): string {
  if (raw == null) return ''
  let v: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) return raw
    try { v = JSON.parse(trimmed) } catch { return raw }
  }
  const parts: unknown[] = Array.isArray(v) ? v : [v]
  const texts = parts
    .map((p) => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : null))
    .filter((t): t is string => t !== null)
  if (texts.length) return texts.join('\n')
  return typeof raw === 'string' ? raw : JSON.stringify(v)
}

/** A call's parameters from an event: an object within MAX_TOOL_ARGS, each value cut down in turn past that, or nothing. */
export function toolArgs(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  if (JSON.stringify(obj).length <= MAX_TOOL_ARGS) return obj
  const share = Math.max(80, Math.floor(MAX_TOOL_ARGS / Math.max(1, Object.keys(obj).length)))
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => {
    const text = typeof v === 'string' ? v : JSON.stringify(v)
    return [k, text.length > share ? `${text.slice(0, share)}… (${text.length} characters)` : v]
  }))
}

export interface WriteRequest {
  system: string
  input: string
  /** A ceiling on the reply, in tokens. */
  maxTokens?: number
  /** LM Studio integrations the model may call, by plugin id ('mcp/<server>' from its mcp.json). */
  tools?: string[]
}

/** Follows LM Studio's tool events: a call starts, gets its name, then succeeds or fails. */
export class ToolTrail {
  readonly uses: ToolUse[] = []

  /** True when the event changed the trail. */
  take(evt: ChatEvent): boolean {
    switch (evt.type) {
      case 'tool_call.start':
        this.uses.push({ name: evt.tool_name || '', ok: null, ...(evt.tool ? { plugin: evt.tool } : {}) })
        return true
      case 'tool_call.name':
      case 'tool_call.arguments': {
        const name = evt.tool_name
        if (!name) return false
        let use = this.uses.find((u) => u.ok === null && !u.name) ?? this.uses.find((u) => u.ok === null && u.name === name)
        if (!use) { use = { name, ok: null }; this.uses.push(use) }
        use.name = name
        const plugin = evt.provider_info?.plugin_id
        if (plugin) use.plugin = plugin
        const args = toolArgs(evt.arguments)
        if (args) use.args = args
        return true
      }
      case 'tool_call.success':
      case 'tool_call.failure': {
        const name = evt.tool_name
        const use = (name && this.uses.find((u) => u.ok === null && u.name === name)) || this.uses.find((u) => u.ok === null)
        if (!use) return false
        use.ok = evt.type === 'tool_call.success'
        if (name && !use.name) use.name = name
        const args = toolArgs(evt.arguments)
        if (args) use.args = args
        use.output = use.ok ? toolOutputText(evt.output).slice(0, MAX_TOOL_OUTPUT) : (evt.reason || 'Tool call failed')
        return true
      }
      default:
        return false
    }
  }
}

export class ModelError extends Error {}

/**
 * A model that has just read a tool result sometimes writes its thinking
 * as text and closes it with a bare </think> before the answer proper, or
 * wraps it in <think> tags. Either way the thinking goes and the answer
 * stays; the streamed text showed it, the kept copy does not.
 */
export function stripLeakedThinking(text: string): string {
  const unwrapped = text.replace(/<think>[\s\S]*?<\/think>/g, '')
  const close = unwrapped.lastIndexOf('</think>')
  return close < 0 ? unwrapped : unwrapped.slice(close + '</think>'.length)
}

export async function writeWithModel(
  config: ServerConfig,
  req: WriteRequest,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  /** Each change to the tools called so far, the whole list each time. */
  onTools?: (uses: ToolUse[]) => void,
): Promise<string> {
  if (!config.model) throw new ModelError('No model chosen. Pick one in Settings.')
  const base = config.lmStudioUrl.replace(/\/+$/, '')
  const body: Record<string, unknown> = { model: config.model, input: req.input, system_prompt: req.system, stream: true }
  if (config.reasoning) body.reasoning = config.reasoning
  if (req.maxTokens) body.max_output_tokens = req.maxTokens
  if (req.tools?.length) body.integrations = req.tools.map((id) => ({ type: 'plugin', id }))

  let res: Response
  try {
    res = await fetchImpl(`${base}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiToken ? { Authorization: `Bearer ${config.apiToken.trim()}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    throw new ModelError(`Couldn't reach LM Studio at ${base}. (${(err as Error).message})`)
  }
  if (!res.ok) throw new ModelError(await describeHttpError(res))
  if (!res.body) throw new ModelError('LM Studio returned no stream')

  let text = ''
  const trail = new ToolTrail()
  for await (const evt of sseEvents(res.body)) {
    if (evt.type === 'message.delta') {
      const piece = evt.content || ''
      if (!piece) continue
      text += piece
      onDelta(piece)
    } else if (evt.type === 'error') {
      throw new ModelError(evt.error?.message || 'LM Studio reported an error')
    } else if (evt.type.startsWith('tool_call.')) {
      if (trail.take(evt)) onTools?.(trail.uses.map((u) => ({ ...u })))
    }
  }
  return text
}

async function describeHttpError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '')
  let detail = raw.slice(0, 300)
  try { detail = (JSON.parse(raw) as { error?: { message?: string } }).error?.message || detail } catch { /* not JSON */ }
  if (res.status === 401) return 'LM Studio refused the API token. Check it in Settings.'
  if (res.status === 404) return detail || 'Endpoint not found. /api/v1/chat needs LM Studio 0.4.0 or newer.'
  return `LM Studio answered ${res.status}${detail ? `: ${detail}` : ''}`
}

async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '')
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      try { yield JSON.parse(payload) as ChatEvent } catch { /* not an event */ }
    }
  }
}

/** The LLMs LM Studio has, loaded ones first. */
export async function listModels(config: ServerConfig, fetchImpl: typeof fetch = fetch): Promise<{ models: string[]; loaded: string[]; error: string | null }> {
  const base = config.lmStudioUrl.replace(/\/+$/, '')
  try {
    const r = await fetchImpl(`${base}/api/v1/models`, {
      headers: config.apiToken ? { Authorization: `Bearer ${config.apiToken.trim()}` } : {},
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return { models: [], loaded: [], error: await describeHttpError(r) }
    const data = await r.json() as { models?: { type?: string; key?: string; loaded_instances?: unknown[] }[] }
    const llms = (data.models || [])
      .filter((m) => m.type === 'llm' && m.key)
      .map((m) => ({ key: m.key!, loaded: Boolean(m.loaded_instances?.length) }))
      .sort((a, b) => Number(b.loaded) - Number(a.loaded) || a.key.localeCompare(b.key))
    return { models: llms.map((m) => m.key), loaded: llms.filter((m) => m.loaded).map((m) => m.key), error: null }
  } catch (err) {
    return { models: [], loaded: [], error: `Couldn't reach LM Studio at ${base}. (${(err as Error).message})` }
  }
}
