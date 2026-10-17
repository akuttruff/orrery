// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ToolTrail, stripLeakedThinking, writeWithModel } from './model.ts'
import type { ServerConfig } from './store.ts'
import type { ToolUse } from '../src/types.ts'

const config: ServerConfig = { lmStudioUrl: 'http://lm', apiToken: 't', model: 'm', reasoning: 'low', memoryDefault: 'off' }

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
  it('names the integrations and reports each tool call as it starts, is named and returns', async () => {
    const lm = lmStudio([
      { type: 'tool_call.start' },
      { type: 'tool_call.name', tool_name: 'verify_claim', provider_info: { plugin_id: 'mcp/astrology-v2' } },
      { type: 'tool_call.arguments', tool_name: 'verify_claim', arguments: { claim: 'x' } },
      { type: 'tool_call.success', tool_name: 'verify_claim', output: 'yes' },
      { type: 'tool_call.start', tool: 'mcp/astrology-v2' },
      { type: 'tool_call.name', tool_name: 'forecast_week' },
      { type: 'tool_call.failure', reason: 'timed out' },
      { type: 'message.delta', content: 'Exact on ' },
      { type: 'message.delta', content: 'Thursday.' },
      { type: 'chat.end', result: {} },
    ])
    const seen: ToolUse[][] = []
    const text = await writeWithModel(config, { system: 's', input: 'i', tools: ['mcp/astrology-v2'] }, () => {}, undefined, lm.fetchImpl, (uses) => seen.push(uses))
    expect(text).toBe('Exact on Thursday.')
    expect(lm.body().integrations).toEqual([{ type: 'plugin', id: 'mcp/astrology-v2' }])
    expect(seen.at(-1)).toEqual([{ name: 'verify_claim', ok: true }, { name: 'forecast_week', ok: false }])
    // Each report is its own copy: a later change does not rewrite what a listener already got.
    expect(seen[1]).toEqual([{ name: 'verify_claim', ok: null }])
  })

  it('sends no integrations when the request names no tools', async () => {
    const lm = lmStudio([{ type: 'message.delta', content: 'ok' }])
    await writeWithModel(config, { system: 's', input: 'i' }, () => {}, undefined, lm.fetchImpl)
    expect(lm.body()).not.toHaveProperty('integrations')
  })
})

describe('stripLeakedThinking', () => {
  it('drops thinking the model wrote as text, closed with a bare tag or wrapped in both', () => {
    expect(stripLeakedThinking('The Moon is void from 9:13.\n</think>\n\nThe Moon is void from 9:13 to 6:40.')).toBe('\n\nThe Moon is void from 9:13 to 6:40.')
    expect(stripLeakedThinking('<think>hmm</think>Thursday.')).toBe('Thursday.')
    expect(stripLeakedThinking('Plain answer.')).toBe('Plain answer.')
  })
})

describe('ToolTrail', () => {
  it('matches a nameless result to the oldest call still waiting', () => {
    const t = new ToolTrail()
    t.take({ type: 'tool_call.start' })
    t.take({ type: 'tool_call.name', tool_name: 'a' })
    t.take({ type: 'tool_call.start' })
    t.take({ type: 'tool_call.name', tool_name: 'b' })
    expect(t.take({ type: 'tool_call.success' })).toBe(true)
    expect(t.uses).toEqual([{ name: 'a', ok: true }, { name: 'b', ok: null }])
    expect(t.take({ type: 'tool_call.success' })).toBe(true)
    expect(t.take({ type: 'tool_call.success' })).toBe(false)
    expect(t.take({ type: 'message.delta' })).toBe(false)
  })
})
