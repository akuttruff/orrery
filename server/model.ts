import type { ServerConfig } from './store.ts'

/**
 * One streamed reply from LM Studio's /api/v1/chat: the reading text as it
 * is written, reasoning left out. The same endpoint the chat app uses, so
 * the same models, token and reasoning levels apply.
 */

interface ChatEvent {
  type: string
  content?: string
  error?: { message?: string }
}

export interface WriteRequest {
  system: string
  input: string
  /** A ceiling on the reply, in tokens. */
  maxTokens?: number
}

export class ModelError extends Error {}

export async function writeWithModel(
  config: ServerConfig,
  req: WriteRequest,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!config.model) throw new ModelError('No model chosen. Pick one in Settings.')
  const base = config.lmStudioUrl.replace(/\/+$/, '')
  const body: Record<string, unknown> = { model: config.model, input: req.input, system_prompt: req.system, stream: true }
  if (config.reasoning) body.reasoning = config.reasoning
  if (req.maxTokens) body.max_output_tokens = req.maxTokens

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
  for await (const evt of sseEvents(res.body)) {
    if (evt.type === 'message.delta') {
      const piece = evt.content || ''
      if (!piece) continue
      text += piece
      onDelta(piece)
    } else if (evt.type === 'error') {
      throw new ModelError(evt.error?.message || 'LM Studio reported an error')
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
