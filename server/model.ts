import type { ReplyStats, Step, ToolStep } from '../src/types.ts'
import { appendThinking } from '../src/lib/trail.ts'
import type { ServerConfig } from './store.ts'

/**
 * One streamed reply from LM Studio's /api/v1/chat: the text as it is
 * written, the thinking as it is thought, and the tool calls as they run.
 * The same endpoint the chat app uses, so the same models, token and
 * reasoning levels apply. A request can name LM Studio's MCP integrations;
 * LM Studio then runs the tool calls itself, and the stream reports each
 * one. The stream's last event carries LM Studio's own numbers for the turn.
 */

export interface ChatEvent {
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
  /** model_load.progress and prompt_processing.progress: how far along, 0 to 1. */
  progress?: number
  /** chat.end: the turn's stats. */
  result?: {
    stats?: {
      input_tokens?: number
      total_output_tokens?: number
      reasoning_output_tokens?: number
      tokens_per_second?: number
      time_to_first_token_seconds?: number
    }
  }
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

/** LM Studio's turn stats in this app's shape, or null when it sent none. */
export function replyStats(raw: NonNullable<ChatEvent['result']>['stats'], model: string): ReplyStats | null {
  if (!raw || typeof raw.tokens_per_second !== 'number') return null
  return {
    model,
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.total_output_tokens ?? 0,
    reasoningTokens: raw.reasoning_output_tokens ?? 0,
    tokensPerSecond: Math.round(raw.tokens_per_second * 10) / 10,
    firstTokenSeconds: Math.round((raw.time_to_first_token_seconds ?? 0) * 10) / 10,
  }
}

export interface WriteRequest {
  system: string
  input: string
  /** A ceiling on the reply, in tokens. */
  maxTokens?: number
  /** LM Studio's reasoning level for this call alone ('off' for a short answer); unset leaves it to Settings. */
  reasoning?: string
  /** LM Studio integrations the model may call, by plugin id ('mcp/<server>' from its mcp.json). */
  tools?: string[]
  /** A short, tool-free job (a table's notes, a list of facts): goes to the quick jobs model when one is set. */
  quick?: boolean
}

/** What one reply came to: the text, the trail behind it, and LM Studio's numbers. */
export interface Reply {
  text: string
  trail: Step[]
  stats: ReplyStats | null
}

export interface WriteOptions {
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  /** The trail each time its shape changes (thinking opens or closes, a tool call starts, is named or returns): the whole trail, a copy. */
  onTrail?: (trail: Step[]) => void
  /** Each piece of thinking, for the open thinking step. */
  onThinking?: (piece: string) => void
  /** What LM Studio is doing now, as lm-chat shows it: loading the model, reading the prompt (with how far), thinking, writing. */
  onStatus?: (status: string) => void
}

/**
 * The status line an event moves to, or null for one that does not change
 * it (text and thinking pieces, tool results). The same steps lm-chat shows
 * in its header while a reply is under way.
 */
export function statusOf(evt: ChatEvent): string | null {
  const pct = (): string => `${Math.round((evt.progress ?? 0) * 100)}%`
  switch (evt.type) {
    case 'model_load.start': return 'Loading the model'
    case 'model_load.progress': return `Loading the model ${pct()}`
    case 'prompt_processing.start': return 'Reading the prompt'
    case 'prompt_processing.progress': return `Reading the prompt ${pct()}`
    case 'reasoning.start': return 'Thinking'
    case 'message.start': return 'Writing'
    case 'tool_call.start': return 'Calling a tool'
    case 'tool_call.name':
    case 'tool_call.arguments': {
      const name = evt.tool_name || evt.tool
      return name ? `Using ${name}` : null
    }
    default: return null
  }
}

/** What an event did to the trail: nothing, changed its shape, or added a piece of thinking. */
export type TrailChange = 'none' | 'steps' | 'thinking'

/**
 * Follows LM Studio's events into a trail: thinking opens, grows and
 * closes; a tool call starts, gets its name and arguments, then succeeds
 * or fails. The steps stay in the order they happened.
 */
export class Trail {
  steps: Step[] = []
  private thinkingSince = 0

  take(evt: ChatEvent, now = Date.now()): TrailChange {
    switch (evt.type) {
      case 'reasoning.start':
        this.closeThinking(now)
        this.steps.push({ kind: 'reasoning', text: '', done: false })
        this.thinkingSince = now
        return 'steps'
      case 'reasoning.delta': {
        const piece = evt.content || ''
        if (!piece) return 'none'
        const opened = !this.open()
        this.steps = appendThinking(this.steps, piece)
        if (opened) this.thinkingSince = now
        return opened ? 'steps' : 'thinking'
      }
      case 'reasoning.end':
      case 'message.start':
        return this.closeThinking(now) ? 'steps' : 'none'
      case 'tool_call.start':
        this.closeThinking(now)
        this.steps.push({ kind: 'tool', name: evt.tool_name || '', ok: null, ...(evt.tool ? { plugin: evt.tool } : {}) })
        return 'steps'
      case 'tool_call.name':
      case 'tool_call.arguments': {
        const name = evt.tool_name
        if (!name) return 'none'
        let use = this.tools().find((u) => u.ok === null && !u.name) ?? this.tools().find((u) => u.ok === null && u.name === name)
        if (!use) { use = { kind: 'tool', name, ok: null }; this.steps.push(use) }
        use.name = name
        const plugin = evt.provider_info?.plugin_id
        if (plugin) use.plugin = plugin
        const args = toolArgs(evt.arguments)
        if (args) use.args = args
        return 'steps'
      }
      case 'tool_call.success':
      case 'tool_call.failure': {
        const name = evt.tool_name
        const use = (name && this.tools().find((u) => u.ok === null && u.name === name)) || this.tools().find((u) => u.ok === null)
        if (!use) return 'none'
        use.ok = evt.type === 'tool_call.success'
        if (name && !use.name) use.name = name
        const args = toolArgs(evt.arguments)
        if (args) use.args = args
        use.output = use.ok ? toolOutputText(evt.output).slice(0, MAX_TOOL_OUTPUT) : (evt.reason || 'Tool call failed')
        return 'steps'
      }
      default:
        return 'none'
    }
  }

  /** The trail as it stands, each step a copy, for a listener to keep. */
  copy(): Step[] {
    return this.steps.map((s) => ({ ...s }))
  }

  /** The open thinking step, if the model is thinking. */
  private open(): Step | undefined {
    const last = this.steps.at(-1)
    return last?.kind === 'reasoning' && !last.done ? last : undefined
  }

  /** Closes the open thinking step with how long it took; false when none was open. */
  private closeThinking(now: number): boolean {
    const last = this.steps.at(-1)
    if (!last || last.kind !== 'reasoning' || last.done) return false
    last.done = true
    last.seconds = Math.round(Math.max(0, now - this.thinkingSince) / 100) / 10
    return true
  }

  private tools(): ToolStep[] {
    return this.steps.filter((s): s is ToolStep => s.kind === 'tool')
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

/** One model as /api/v1/models lists it, with what this file reads of it. */
interface ListedModel {
  key?: string
  loaded_instances?: { id?: string }[]
  capabilities?: { reasoning?: { allowed_options?: string[] } }
}

/** LM Studio's model list, or null when it can't be asked. */
async function listedModels(config: ServerConfig, fetchImpl: typeof fetch): Promise<ListedModel[] | null> {
  const base = config.lmStudioUrl.replace(/\/+$/, '')
  try {
    const res = await fetchImpl(`${base}/api/v1/models`, {
      headers: config.apiToken ? { Authorization: `Bearer ${config.apiToken.trim()}` } : {},
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return ((await res.json()) as { models?: ListedModel[] }).models ?? []
  } catch {
    return null
  }
}

/** The listing for a model, by its key or a loaded instance's id. */
const findModel = (models: ListedModel[], model: string): ListedModel | undefined =>
  models.find((m) => m.key === model || (m.loaded_instances ?? []).some((i) => i.id === model))

/**
 * The model a call goes to: the preferred one while LM Studio has it
 * loaded, the chosen one otherwise (not loaded, not listed, LM Studio not
 * answering). Only asks; never loads anything. The answer is kept a few
 * seconds, as a promise, so a burst of calls (a reading and its popups)
 * asks LM Studio once, and a model loaded or ejected is noticed soon after.
 */
const PREFERRED_TTL_MS = 10_000
const loadedCache = new Map<string, { at: number; loaded: Promise<boolean> }>()

export async function effectiveModel(config: ServerConfig, fetchImpl: typeof fetch = fetch): Promise<string> {
  const preferred = config.preferredModel?.trim()
  if (!preferred || preferred === config.model) return config.model
  const key = `${config.lmStudioUrl.replace(/\/+$/, '')} ${preferred}`
  let hit = loadedCache.get(key)
  if (!hit || Date.now() - hit.at >= PREFERRED_TTL_MS) {
    const loaded = listedModels(config, fetchImpl).then((models) => Boolean(models && findModel(models, preferred)?.loaded_instances?.length))
    hit = { at: Date.now(), loaded }
    loadedCache.set(key, hit)
  }
  return (await hit.loaded) ? preferred : config.model
}

/**
 * The reasoning settings LM Studio says a model takes, from /api/v1/models:
 * a list, [] when it lists the model with none (a build with no manifest,
 * like qwen3.5-122b-a10b, which answers any `reasoning` with a 400), or null
 * when it can't be asked or doesn't know the model. Kept a few minutes.
 * `model` is the one the call goes to, the chosen one unless said otherwise.
 */
const REASONING_TTL_MS = 5 * 60_000
const reasoningCache = new Map<string, { at: number; allowed: string[] | null }>()

export async function reasoningOptions(config: ServerConfig, fetchImpl: typeof fetch = fetch, model = config.model): Promise<string[] | null> {
  const key = `${config.lmStudioUrl.replace(/\/+$/, '')} ${model}`
  const hit = reasoningCache.get(key)
  if (hit && Date.now() - hit.at < REASONING_TTL_MS) return hit.allowed
  const models = await listedModels(config, fetchImpl)
  if (!models) return null
  const entry = findModel(models, model)
  const allowed = entry ? (entry.capabilities?.reasoning?.allowed_options ?? []) : null
  reasoningCache.set(key, { at: Date.now(), allowed })
  return allowed
}

/** The level to send: as asked when the model takes it, 'on' for any thinking on an on/off model, nothing when it takes none. */
export function fitReasoning(requested: string | undefined, allowed: string[] | null): string | undefined {
  if (!requested || !allowed) return requested
  if (allowed.includes(requested)) return requested
  if (requested !== 'off' && allowed.includes('on')) return 'on'
  return undefined
}

export async function writeWithModel(
  config: ServerConfig,
  req: WriteRequest,
  onDelta: (text: string) => void,
  { signal, fetchImpl = fetch, onTrail, onThinking, onStatus }: WriteOptions = {},
): Promise<Reply> {
  const fast = req.quick ? config.fastModel?.trim() : ''
  const model = fast || await effectiveModel(config, fetchImpl)
  if (!model) throw new ModelError('No model chosen. Pick one in Settings.')
  const base = config.lmStudioUrl.replace(/\/+$/, '')
  const body: Record<string, unknown> = { model, input: req.input, system_prompt: req.system, stream: true }
  const asked = req.reasoning ?? config.reasoning
  const reasoning = asked ? fitReasoning(asked, await reasoningOptions(config, fetchImpl, model)) : undefined
  if (reasoning) body.reasoning = reasoning
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
  let stats: ReplyStats | null = null
  const trail = new Trail()
  let status = ''
  for await (const evt of sseEvents(res.body)) {
    const next = statusOf(evt)
    if (next && next !== status) {
      status = next
      onStatus?.(status)
    }
    if (evt.type === 'message.delta') {
      const piece = evt.content || ''
      if (!piece) continue
      text += piece
      onDelta(piece)
    } else if (evt.type === 'error') {
      throw new ModelError(evt.error?.message || 'LM Studio reported an error')
    } else if (evt.type === 'chat.end') {
      stats = replyStats(evt.result?.stats, model)
      if (trail.take({ type: 'message.start' }) === 'steps') onTrail?.(trail.copy())
    } else {
      const change = trail.take(evt)
      if (change === 'steps') onTrail?.(trail.copy())
      else if (change === 'thinking') onThinking?.(evt.content || '')
    }
  }
  return { text, trail: trail.copy(), stats }
}

async function describeHttpError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '')
  let detail = raw.slice(0, 300)
  try { detail = (JSON.parse(raw) as { error?: { message?: string } }).error?.message || detail } catch { /* not JSON */ }
  if (res.status === 401) return 'LM Studio refused the API token. Check it in Settings.'
  if (res.status === 404) return detail || 'Endpoint not found. /api/v1/chat needs LM Studio 0.4.0 or newer.'
  return `LM Studio answered ${res.status}${detail ? `: ${detail}` : ''}`
}

/** The event on one line of the stream, if it carries one. */
function eventOf(rawLine: string): ChatEvent | null {
  const line = rawLine.replace(/\r$/, '')
  if (!line.startsWith('data:')) return null
  const payload = line.slice(5).trim()
  if (!payload) return null
  try { return JSON.parse(payload) as ChatEvent } catch { return null /* not an event */ }
}

/**
 * The stream's events, a line at a time. A last line without its newline
 * still counts. The reader is let go however the loop ends, so a reply given
 * up on part-way (an error event, a stop) does not hold the connection open.
 */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      buf += done ? decoder.decode() : decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = done ? '' : lines.pop() ?? ''
      for (const line of lines) {
        const evt = eventOf(line)
        if (evt) yield evt
      }
      if (done) return
    }
  } finally {
    await reader.cancel().catch(() => { /* already closed */ })
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
