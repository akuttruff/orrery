// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Trail, effectiveModel, fitReasoning, reasoningOptions, sseEvents, stripLeakedThinking, toolArgs, toolOutputText, writeWithModel } from './model.ts'
import type { ServerConfig } from './store.ts'
import type { Step } from '../src/types.ts'

const config: ServerConfig = { lmStudioUrl: 'http://lm', apiToken: 't', model: 'm', preferredModel: '', fastModel: '', reasoning: 'low', memoryDefault: 'off' }

/** A fetch that answers with these events as LM Studio's SSE stream, and keeps the request body. */
function lmStudio(events: object[]) {
  let body: Record<string, unknown> = {}
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(init!.body as string) as Record<string, unknown>
    const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
    return new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }) as unknown as typeof fetch
  return { fetchImpl, body: () => body }
}

describe('writeWithModel', () => {
  it('names the integrations and reports the thinking, each tool call as it starts, is named and returns, and the turn\'s numbers', async () => {
    const lm = lmStudio([
      { type: 'reasoning.start' },
      { type: 'reasoning.delta', content: 'Let me check ' },
      { type: 'reasoning.delta', content: 'the ephemeris.' },
      { type: 'reasoning.end' },
      { type: 'tool_call.start' },
      { type: 'tool_call.name', tool_name: 'verify_claim', provider_info: { plugin_id: 'mcp/astrology-v2' } },
      { type: 'tool_call.arguments', tool_name: 'verify_claim', arguments: { claim: 'x' } },
      { type: 'tool_call.success', tool_name: 'verify_claim', output: JSON.stringify([{ type: 'text', text: 'yes, exact Thursday' }]) },
      { type: 'tool_call.start', tool: 'mcp/astrology-v2' },
      { type: 'tool_call.name', tool_name: 'forecast_week' },
      { type: 'tool_call.failure', reason: 'timed out' },
      { type: 'message.start' },
      { type: 'message.delta', content: 'Exact on ' },
      { type: 'message.delta', content: 'Thursday.' },
      { type: 'chat.end', result: { stats: { input_tokens: 3100, total_output_tokens: 820, reasoning_output_tokens: 210, tokens_per_second: 21.34, time_to_first_token_seconds: 2.41 } } },
    ])
    const trails: Step[][] = []
    const thought: string[] = []
    const reply = await writeWithModel(config, { system: 's', input: 'i', tools: ['mcp/astrology-v2'] }, () => {}, { fetchImpl: lm.fetchImpl, onTrail: (t) => trails.push(t), onThinking: (p) => thought.push(p) })
    expect(reply.text).toBe('Exact on Thursday.')
    expect(lm.body().integrations).toEqual([{ type: 'plugin', id: 'mcp/astrology-v2' }])
    expect(thought).toEqual(['Let me check ', 'the ephemeris.'])
    expect(reply.trail).toEqual([
      { kind: 'reasoning', text: 'Let me check the ephemeris.', done: true, seconds: expect.any(Number) },
      { kind: 'tool', name: 'verify_claim', ok: true, plugin: 'mcp/astrology-v2', args: { claim: 'x' }, output: 'yes, exact Thursday' },
      { kind: 'tool', name: 'forecast_week', ok: false, plugin: 'mcp/astrology-v2', output: 'timed out' },
    ])
    expect(reply.stats).toEqual({ model: 'm', inputTokens: 3100, outputTokens: 820, reasoningTokens: 210, tokensPerSecond: 21.3, firstTokenSeconds: 2.4 })
    // Each report is its own copy: a later change does not rewrite what a listener already got.
    expect(trails[0]).toEqual([{ kind: 'reasoning', text: '', done: false }])
    expect(trails.at(-1)).toEqual(reply.trail)
  })

  it('sends no integrations when the request names no tools, and opens a thinking step from a bare delta', async () => {
    const lm = lmStudio([{ type: 'reasoning.delta', content: 'hm' }, { type: 'message.delta', content: 'ok' }, { type: 'chat.end', result: {} }])
    const reply = await writeWithModel(config, { system: 's', input: 'i' }, () => {}, { fetchImpl: lm.fetchImpl })
    expect(lm.body()).not.toHaveProperty('integrations')
    expect(reply.text).toBe('ok')
    expect(reply.trail).toEqual([{ kind: 'reasoning', text: 'hm', done: true, seconds: expect.any(Number) }])
    expect(reply.stats).toBeNull()
  })
})

describe('stripLeakedThinking', () => {
  it('drops thinking the model wrote as text, closed with a bare tag or wrapped in both', () => {
    expect(stripLeakedThinking('The Moon is void from 9:13.\n</think>\n\nThe Moon is void from 9:13 to 6:40.')).toBe('\n\nThe Moon is void from 9:13 to 6:40.')
    expect(stripLeakedThinking('<think>hmm</think>Thursday.')).toBe('Thursday.')
    expect(stripLeakedThinking('Plain answer.')).toBe('Plain answer.')
  })
})

describe('tool results', () => {
  it('reads MCP content parts, plain text and other JSON', () => {
    expect(toolOutputText('[{"type":"text","text":"a"},{"type":"text","text":"b"}]')).toBe('a\nb')
    expect(toolOutputText('plain')).toBe('plain')
    expect(toolOutputText({ k: 1 })).toBe('{"k":1}')
    expect(toolOutputText(null)).toBe('')
  })

  it('keeps parameters as given, cut down only when huge', () => {
    expect(toolArgs({ city: 'New York' })).toEqual({ city: 'New York' })
    expect(toolArgs('nope')).toBeUndefined()
    const huge = toolArgs({ a: 'x'.repeat(9000), b: 'short' })!
    expect(String(huge.a)).toMatch(/… \(9000 characters\)$/)
    expect(huge.b).toBe('short')
  })
})

describe('Trail', () => {
  it('matches a nameless result to the oldest call still waiting', () => {
    const t = new Trail()
    t.take({ type: 'tool_call.start' })
    t.take({ type: 'tool_call.name', tool_name: 'a' })
    t.take({ type: 'tool_call.start' })
    t.take({ type: 'tool_call.name', tool_name: 'b' })
    expect(t.take({ type: 'tool_call.success' })).toBe('steps')
    expect(t.steps).toEqual([{ kind: 'tool', name: 'a', ok: true, output: '' }, { kind: 'tool', name: 'b', ok: null }])
    expect(t.take({ type: 'tool_call.success' })).toBe('steps')
    expect(t.take({ type: 'tool_call.success' })).toBe('none')
    expect(t.take({ type: 'message.delta' })).toBe('none')
  })

  it('times the thinking and closes it when a tool call or the message starts', () => {
    const t = new Trail()
    expect(t.take({ type: 'reasoning.start' }, 1000)).toBe('steps')
    expect(t.take({ type: 'reasoning.delta', content: 'a' }, 1100)).toBe('thinking')
    expect(t.take({ type: 'tool_call.start' }, 3500)).toBe('steps')
    expect(t.steps[0]).toEqual({ kind: 'reasoning', text: 'a', done: true, seconds: 2.5 })
    expect(t.take({ type: 'reasoning.delta', content: 'b' }, 4000)).toBe('steps')
    expect(t.take({ type: 'message.start' }, 4200)).toBe('steps')
    expect(t.steps[2]).toEqual({ kind: 'reasoning', text: 'b', done: true, seconds: 0.2 })
    expect(t.take({ type: 'message.start' })).toBe('none')
  })
})

describe('sseEvents', () => {
  const stream = (chunks: string[], cancel?: () => void) => new ReadableStream<Uint8Array>({
    start(c) { for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk)) },
    pull(c) { if (!cancel) c.close() },
    cancel,
  })
  const all = async (body: ReadableStream<Uint8Array>) => { const out: unknown[] = []; for await (const e of sseEvents(body)) out.push(e); return out }

  it('reads an event split across chunks, and a last one with no newline after it', async () => {
    expect(await all(stream(['data: {"type":"a"', '}\n\n', 'data: {"type":"b"}']))).toEqual([{ type: 'a' }, { type: 'b' }])
  })

  it('lets the reader go when the loop stops early', async () => {
    let cancelled = false
    const body = stream(['data: {"type":"error"}\n\n'], () => { cancelled = true })
    for await (const evt of sseEvents(body)) { expect(evt.type).toBe('error'); break }
    expect(cancelled).toBe(true)
  })
})

describe('reasoning a model takes', () => {
  const config = (model: string) => ({ lmStudioUrl: 'http://lm.test', apiToken: 't', model, preferredModel: '', fastModel: '', reasoning: 'low', memoryDefault: 'off' }) as ServerConfig
  const models = {
    models: [
      { key: 'qwen3.5-122b-a10b', capabilities: { vision: true } },
      { key: 'qwen/qwen3.5-9b', capabilities: { reasoning: { allowed_options: ['off', 'on'] } } },
    ],
  }
  const fetchModels = (async () => new Response(JSON.stringify(models))) as unknown as typeof fetch

  it('knows a model with no reasoning setting from one LM Studio does not list', async () => {
    expect(await reasoningOptions(config('qwen3.5-122b-a10b'), fetchModels)).toEqual([])
    expect(await reasoningOptions(config('qwen/qwen3.5-9b'), fetchModels)).toEqual(['off', 'on'])
    expect(await reasoningOptions(config('not-downloaded'), fetchModels)).toBeNull()
  })

  it('sends nothing to a model that takes none, and on for thinking on an on/off model', () => {
    expect(fitReasoning('low', [])).toBeUndefined()
    expect(fitReasoning('low', ['off', 'on'])).toBe('on')
    expect(fitReasoning('off', ['off', 'on'])).toBe('off')
    expect(fitReasoning('low', null)).toBe('low')
  })
})

describe('the preferred model', () => {
  // Each test its own LM Studio address, so the resolver's short cache does not carry over.
  const config = (lmStudioUrl: string, preferredModel = 'big') => ({ lmStudioUrl, apiToken: 't', model: 'small', preferredModel, fastModel: '', reasoning: 'low', memoryDefault: 'off' }) as ServerConfig
  /** A fetch that lists these models and counts how often it was asked. */
  const listing = (models: object[]) => {
    let asked = 0
    const fetchImpl = (async () => { asked++; return new Response(JSON.stringify({ models })) }) as unknown as typeof fetch
    return { fetchImpl, asked: () => asked }
  }

  it('is used while LM Studio has it loaded, by key or instance id, and a burst asks once', async () => {
    const lm = listing([{ key: 'small', loaded_instances: [{ id: 'small' }] }, { key: 'big', loaded_instances: [{ id: 'big' }] }])
    const answers = await Promise.all([1, 2, 3].map(() => effectiveModel(config('http://loaded'), lm.fetchImpl)))
    expect(answers).toEqual(['big', 'big', 'big'])
    expect(lm.asked()).toBe(1)
    const byInstance = listing([{ key: 'org/big-gguf', loaded_instances: [{ id: 'big' }] }])
    expect(await effectiveModel(config('http://instance'), byInstance.fetchImpl)).toBe('big')
  })

  it('falls back to the chosen model when it is not loaded, LM Studio is down, or none is preferred', async () => {
    const notLoaded = listing([{ key: 'big', loaded_instances: [] }, { key: 'small' }])
    expect(await effectiveModel(config('http://not-loaded'), notLoaded.fetchImpl)).toBe('small')
    const down = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    expect(await effectiveModel(config('http://down'), down)).toBe('small')
    const refused = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    expect(await effectiveModel(config('http://refused'), refused)).toBe('small')
    const none = listing([{ key: 'big', loaded_instances: [{ id: 'big' }] }])
    expect(await effectiveModel(config('http://none', ''), none.fetchImpl)).toBe('small')
    expect(none.asked()).toBe(0)
  })

  it('is what writeWithModel sends, fits the reasoning to, and records in the stats', async () => {
    let sent: Record<string, unknown> = {}
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/api/v1/models')) {
        return new Response(JSON.stringify({ models: [
          { key: 'small', loaded_instances: [{ id: 'small' }], capabilities: { reasoning: { allowed_options: ['off', 'low', 'medium', 'high'] } } },
          { key: 'big', loaded_instances: [{ id: 'big' }], capabilities: { vision: true } },
        ] }))
      }
      sent = JSON.parse(init!.body as string) as Record<string, unknown>
      const events = [{ type: 'message.delta', content: 'ok' }, { type: 'chat.end', result: { stats: { tokens_per_second: 30 } } }]
      return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { status: 200 })
    }) as unknown as typeof fetch
    const reply = await writeWithModel(config('http://write'), { system: 's', input: 'i' }, () => {}, { fetchImpl })
    expect(sent.model).toBe('big')
    // The chosen model takes 'low'; the preferred one lists no reasoning, so none is sent.
    expect(sent).not.toHaveProperty('reasoning')
    expect(reply.stats?.model).toBe('big')
  })
})

describe('the quick jobs model', () => {
  // Each test its own LM Studio address, so the caches do not carry over.
  const config = (lmStudioUrl: string, fastModel: string) => ({ lmStudioUrl, apiToken: 't', model: 'small', preferredModel: 'big', fastModel, reasoning: 'low', memoryDefault: 'off' }) as ServerConfig
  /** LM Studio with big loaded (no reasoning setting), small (full levels) and the unloaded quick model (on/off); keeps what the chat call sent. */
  const lm = () => {
    let sent: Record<string, unknown> = {}
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/api/v1/models')) {
        return new Response(JSON.stringify({ models: [
          { key: 'small', loaded_instances: [{ id: 'small' }], capabilities: { reasoning: { allowed_options: ['off', 'low', 'medium', 'high'] } } },
          { key: 'big', loaded_instances: [{ id: 'big' }], capabilities: { vision: true } },
          { key: 'quick', loaded_instances: [], capabilities: { reasoning: { allowed_options: ['off', 'on'] } } },
        ] }))
      }
      sent = JSON.parse(init!.body as string) as Record<string, unknown>
      const events = [{ type: 'message.delta', content: 'ok' }, { type: 'chat.end', result: { stats: { tokens_per_second: 80 } } }]
      return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { status: 200 })
    }) as unknown as typeof fetch
    return { fetchImpl, sent: () => sent }
  }

  it('takes a quick job, loaded or not, with the reasoning fitted to it, and is recorded in the stats', async () => {
    const lms = lm()
    const reply = await writeWithModel(config('http://quick-set', ' quick '), { system: 's', input: 'i', quick: true }, () => {}, { fetchImpl: lms.fetchImpl })
    expect(lms.sent().model).toBe('quick')
    // Settings ask for 'low'; the quick model is on/off, so it gets 'on'.
    expect(lms.sent().reasoning).toBe('on')
    expect(reply.stats?.model).toBe('quick')
    await writeWithModel(config('http://quick-off', 'quick'), { system: 's', input: 'i', quick: true, reasoning: 'off' }, () => {}, { fetchImpl: lms.fetchImpl })
    expect(lms.sent()).toMatchObject({ model: 'quick', reasoning: 'off' })
  })

  it('leaves a quick job to the usual model when none is set', async () => {
    const lms = lm()
    const reply = await writeWithModel(config('http://quick-unset', ''), { system: 's', input: 'i', quick: true }, () => {}, { fetchImpl: lms.fetchImpl })
    expect(lms.sent().model).toBe('big')
    expect(lms.sent()).not.toHaveProperty('reasoning')
    expect(reply.stats?.model).toBe('big')
  })

  it('is not used for a job that is not quick', async () => {
    const lms = lm()
    await writeWithModel(config('http://not-quick', 'quick'), { system: 's', input: 'i' }, () => {}, { fetchImpl: lms.fetchImpl })
    expect(lms.sent().model).toBe('big')
  })
})
