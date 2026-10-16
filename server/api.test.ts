// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createApiState, createMiddleware, profilePatch } from './api.ts'
import { Readings } from './readings.ts'
import { Store } from './store.ts'
import type { ApiState } from './api.ts'
import type { WriteRequest } from './model.ts'
import type { Casting } from '../src/types.ts'

/** The API on a real socket, with fake tools and a fake model, in a scratch data dir. */
function serve(write: (req: WriteRequest, onDelta: (t: string) => void) => Promise<string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orrery-'))
  const store = new Store(dir, '/nonexistent/lm-chat.sqlite')
  const call = vi.fn(async (name: string, args: Record<string, unknown>) => JSON.stringify({ tool: name, args }))
  const readings = new Readings(store, (_config, req, onDelta) => write(req, onDelta))
  const state: ApiState = createApiState({ store, call, readings })
  const server = http.createServer((req, res) => createMiddleware(state)(req, res, () => { res.writeHead(404); res.end() }))
  return new Promise<{ base: string; call: typeof call; close: () => void }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      resolve({ base: `http://127.0.0.1:${port}`, call, close: () => { server.close(); store.close(); fs.rmSync(dir, { recursive: true, force: true }) } })
    })
  })
}

const post = (url: string, body?: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

let ctx: Awaited<ReturnType<typeof serve>>
// Writes a word at a time with a pause between, so a stream opened right after the start sees the deltas.
const tick = () => new Promise((r) => setTimeout(r, 25))
let writer = async (_req: WriteRequest, onDelta: (t: string) => void): Promise<string> => { await tick(); onDelta('Hello'); await tick(); onDelta(' there'); return 'Hello there' }

beforeEach(async () => {
  // The shared setup stubs fetch for page tests; these talk to a real socket.
  vi.unstubAllGlobals()
  ctx = await serve((req, onDelta) => writer(req, onDelta))
})
afterEach(() => ctx.close())

describe('settings', () => {
  it('starts from the default profile and reports whether a token is set, never the token', async () => {
    const profile = await (await fetch(`${ctx.base}/api/profile`)).json() as { city: string }
    expect(profile.city).toBe('New York')
    const r = await fetch(`${ctx.base}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiToken: 'secret', model: 'qwen' }) })
    const config = await r.json() as Record<string, unknown>
    expect(config).toMatchObject({ model: 'qwen', hasToken: true })
    expect(JSON.stringify(config)).not.toContain('secret')
  })

  it('refuses a birth time the tools would reject', async () => {
    const r = await fetch(`${ctx.base}/api/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateTime: 'June 15 1990' }) })
    expect(r.status).toBe(400)
    expect(profilePatch({ name: ' Sam ', state: 'CA' })).toEqual({ name: 'Sam', state: 'CA' })
    expect(() => profilePatch({ city: '  ' })).toThrow(/city/)
  })
})

describe('castings', () => {
  it('casts once per period and hands the same casting back on the next tap', async () => {
    const a = await (await post(`${ctx.base}/api/castings`, { kind: 'today' })).json() as Casting
    const b = await (await post(`${ctx.base}/api/castings`, { kind: 'today' })).json() as Casting
    expect(b.id).toBe(a.id)
    expect(ctx.call).toHaveBeenCalledTimes(1)
    expect(ctx.call.mock.calls[0]![0]).toBe('create_transit_chart')
    const list = await (await fetch(`${ctx.base}/api/castings`)).json() as { id: string }[]
    expect(list.map((c) => c.id)).toEqual([a.id])
  })

  it('a fresh cast replaces the period\'s old one', async () => {
    const a = await (await post(`${ctx.base}/api/castings`, { kind: 'natal' })).json() as Casting
    const b = await (await post(`${ctx.base}/api/castings`, { kind: 'natal', fresh: true })).json() as Casting
    expect(b.id).not.toBe(a.id)
    expect((await fetch(`${ctx.base}/api/castings/${a.id}`)).status).toBe(404)
  })

  it('rejects a kind it does not know', async () => {
    expect((await post(`${ctx.base}/api/castings`, { kind: 'tarot' })).status).toBe(400)
  })

  it('writes the reading on the server and streams it, then keeps it', async () => {
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'week' })).json() as Casting
    const started = await post(`${ctx.base}/api/castings/${c.id}/reading`)
    expect(started.status).toBe(202)
    const events = await (await fetch(`${ctx.base}/api/castings/${c.id}/events`)).text()
    const types = events.split('\n\n').filter(Boolean).map((f) => (JSON.parse(f.slice(5)) as { type: string }).type)
    expect(types[0]).toBe('snapshot')
    expect(types.at(-1)).toBe('done')
    const kept = await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json() as Casting
    expect(kept.readingState).toBe('done')
    expect(kept.reading).toBe('Hello there')
    // Done: asking again is a no-op unless asked for again.
    expect((await post(`${ctx.base}/api/castings/${c.id}/reading`)).status).toBe(200)
    expect((await post(`${ctx.base}/api/castings/${c.id}/reading?again=1`)).status).toBe(202)
  })

  it('keeps the failure reason when the model cannot write', async () => {
    writer = async () => { throw new Error('boom') }
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'moon' })).json() as Casting
    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    await fetch(`${ctx.base}/api/castings/${c.id}/events`)
    const kept = await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json() as Casting
    expect(kept.readingState).toBe('failed')
    expect(kept.readingError).toContain('boom')
    writer = async (_r, onDelta) => { await tick(); onDelta('ok'); return 'ok' }
  })
})
