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
import type { Casting, FollowUp, Memory } from '../src/types.ts'

/** The API on a real socket, with fake tools and a fake model, in a scratch data dir. */
function serve(write: (req: WriteRequest, onDelta: (t: string) => void) => Promise<string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orrery-'))
  const store = new Store(dir, '/nonexistent/lm-chat.sqlite')
  const call = vi.fn(async (name: string, args: Record<string, unknown>) => JSON.stringify({ tool: name, args }))
  const readings = new Readings(store, (_config, req, onDelta) => write(req, onDelta))
  // The memory pool lives in the scratch dir too, never in ~/.lm-memory.
  const state: ApiState = createApiState({ store, call, readings, memoryDb: path.join(dir, 'memory.sqlite'), write: (_config, req, onDelta) => write(req, onDelta) })
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
    await (await fetch(`${ctx.base}/api/castings/${c.id}/events`)).text()
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

describe('questions under a reading', () => {
  const readAll = async (url: string) => {
    const events = await (await fetch(url)).text()
    return events.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.slice(5)) as { type: string; reading?: string })
  }
  const castAndRead = async (): Promise<Casting> => {
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'month' })).json() as Casting
    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    await readAll(`${ctx.base}/api/castings/${c.id}/events`)
    return (await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json()) as Casting
  }

  it('waits for the reading before taking a question', async () => {
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'today' })).json() as Casting
    const r = await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'Why?' })
    expect(r.status).toBe(400)
    expect(((await r.json()) as { error: string }).error).toMatch(/reading/)
    expect((await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: '   ' })).status).toBe(400)
  })

  it('answers on the server with the reading and the thread so far in the prompt, streams it and keeps it', async () => {
    const seen: WriteRequest[] = []
    writer = async (req, onDelta) => { seen.push(req); await tick(); onDelta('Because '); await tick(); onDelta('Saturn.'); return 'Because Saturn.' }
    const c = await castAndRead()
    expect(c.reading).toBe('Because Saturn.')

    const started = await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'Which day is best for the move?' })
    expect(started.status).toBe(202)
    const f1 = await started.json() as FollowUp
    expect(f1).toMatchObject({ castingId: c.id, question: 'Which day is best for the move?', state: 'writing' })
    // A second question while the first is being answered waits its turn.
    expect((await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'And the second?' })).status).toBe(400)

    const types = (await readAll(`${ctx.base}/api/followups/${f1.id}/events`)).map((e) => e.type)
    expect(types[0]).toBe('snapshot')
    expect(types.at(-1)).toBe('done')
    const kept = await (await fetch(`${ctx.base}/api/followups/${f1.id}`)).json() as FollowUp
    expect(kept).toMatchObject({ state: 'done', answer: 'Because Saturn.' })

    const askReq = seen[1]!
    expect(askReq.system).toContain('THE READING YOU WROTE:\nBecause Saturn.')
    expect(askReq.system).toContain('THE CASTING: October 2026.\nDATA:\n{"tool":"forecast_month"')
    expect(askReq.input).toBe('Sam asks: Which day is best for the move?')

    // The next question sees the first exchange.
    const f2 = await (await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'And the second?' })).json() as FollowUp
    await readAll(`${ctx.base}/api/followups/${f2.id}/events`)
    expect(seen[2]!.input).toContain('THE CONVERSATION SO FAR:')
    expect(seen[2]!.input).toContain('Sam asked: Which day is best for the move?\n\nYou answered: Because Saturn.')
    expect(seen[2]!.input).toMatch(/Sam asks: And the second\?$/)

    const list = await (await fetch(`${ctx.base}/api/castings/${c.id}/followups`)).json() as FollowUp[]
    expect(list.map((f) => f.id)).toEqual([f1.id, f2.id])

    // Removing the casting takes its questions with it.
    await fetch(`${ctx.base}/api/castings/${c.id}`, { method: 'DELETE' })
    expect((await fetch(`${ctx.base}/api/followups/${f1.id}`)).status).toBe(404)
    writer = async (_r, onDelta) => { await tick(); onDelta('ok'); return 'ok' }
  })

  it('keeps a failed answer with its reason and can ask again', async () => {
    const c = await castAndRead()
    writer = async () => { throw new Error('offline') }
    const f = await (await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'Hm?' })).json() as FollowUp
    await readAll(`${ctx.base}/api/followups/${f.id}/events`)
    let kept = await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json() as FollowUp
    expect(kept.state).toBe('failed')
    expect(kept.error).toContain('offline')

    writer = async (_r, onDelta) => { await tick(); onDelta('Better.'); return 'Better.' }
    expect((await post(`${ctx.base}/api/followups/${f.id}/answer`)).status).toBe(202)
    await readAll(`${ctx.base}/api/followups/${f.id}/events`)
    kept = await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json() as FollowUp
    expect(kept).toMatchObject({ state: 'done', answer: 'Better.' })

    await fetch(`${ctx.base}/api/followups/${f.id}`, { method: 'DELETE' })
    expect(await (await fetch(`${ctx.base}/api/castings/${c.id}/followups`)).json()).toEqual([])
  })
})

describe('memories', () => {
  const send = (method: 'PUT' | 'PATCH', url: string, body: unknown) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const readAll = async (url: string) => (await (await fetch(url)).text()).split('\n\n').filter(Boolean)

  it('keeps, corrects and forgets memories, refusing a duplicate quietly', async () => {
    expect(await (await fetch(`${ctx.base}/api/memories`)).json()).toEqual([])
    const a = await post(`${ctx.base}/api/memories`, { text: 'The user is moving house on 2026-10-20.' })
    expect(a.status).toBe(201)
    const saved = await a.json() as Memory
    expect((await post(`${ctx.base}/api/memories`, { text: 'the user is moving house on 2026-10-20' })).status).toBe(200)
    expect((await post(`${ctx.base}/api/memories`, { text: '  ' })).status).toBe(400)
    const edited = await (await send('PATCH', `${ctx.base}/api/memories/${saved.id}`, { text: 'The user moved house on 2026-10-20.' })).json() as Memory
    expect(edited.text).toBe('The user moved house on 2026-10-20.')
    expect((await fetch(`${ctx.base}/api/memories/${saved.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await fetch(`${ctx.base}/api/memories/${saved.id}`, { method: 'DELETE' })).status).toBe(404)
  })

  it('is off by default: a reading is written from the chart alone and a question teaches nothing', async () => {
    const seen: WriteRequest[] = []
    writer = async (req, onDelta) => { seen.push(req); onDelta('Plain.'); return 'Plain.' }
    await post(`${ctx.base}/api/memories`, { text: 'The user works nights.' })
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'today' })).json() as Casting
    expect(c.memory).toBeNull()
    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    await readAll(`${ctx.base}/api/castings/${c.id}/events`)
    expect(seen[0]!.system).not.toContain('WHAT YOU KNOW')
    const kept = await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json() as Casting
    expect(kept.memoriesUsed).toEqual([])
    const f = await (await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'My sister visits Tuesday, good day?' })).json() as FollowUp
    await readAll(`${ctx.base}/api/followups/${f.id}/events`)
    expect(seen).toHaveLength(2)
    expect(((await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json()) as FollowUp).remembered).toEqual([])
    expect(await (await fetch(`${ctx.base}/api/memories`)).json()).toHaveLength(1)
  })

  it('with memory on, the reading and answers know the person, and a question adds what it reveals', async () => {
    const seen: WriteRequest[] = []
    writer = async (req, onDelta) => {
      seen.push(req)
      if (req.system.startsWith('You keep notes')) return '["The user\'s sister visits on Tuesday.", "The user works nights."]'
      onDelta('Known.'); return 'Known.'
    }
    const known = await (await post(`${ctx.base}/api/memories`, { text: 'The user works nights.' })).json() as Memory
    await send('PUT', `${ctx.base}/api/config`, { memoryDefault: 'on' })
    expect(((await (await fetch(`${ctx.base}/api/config`)).json()) as { memoryDefault: string }).memoryDefault).toBe('on')

    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'week' })).json() as Casting
    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    await readAll(`${ctx.base}/api/castings/${c.id}/events`)
    expect(seen[0]!.system).toContain('WHAT YOU KNOW ABOUT SAM')
    expect(seen[0]!.system).toContain('- The user works nights.')
    expect(((await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json()) as Casting).memoriesUsed).toEqual([known.id])

    const f = await (await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'My sister visits Tuesday, good day?' })).json() as FollowUp
    await readAll(`${ctx.base}/api/followups/${f.id}/events`)
    // The answer and the note-taking ran side by side; the note-taking already knew about nights.
    const answer = seen.find((r) => r.system.includes('same astrologer'))!
    const notes = seen.find((r) => r.system.startsWith('You keep notes'))!
    expect(answer.system).toContain('- The user works nights.')
    expect(notes.system).toContain('Already known (do not repeat):\n- The user works nights.')
    expect(notes.input).toContain('My sister visits Tuesday')
    let kept = await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json() as FollowUp
    for (let i = 0; i < 20 && kept.remembered === null; i++) { await tick(); kept = await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json() as FollowUp }
    expect(kept.remembered?.map((m) => m.text)).toEqual(["The user's sister visits on Tuesday."])
    const all = await (await fetch(`${ctx.base}/api/memories`)).json() as Memory[]
    expect(all.map((m) => m.text)).toEqual(["The user's sister visits on Tuesday.", 'The user works nights.'])

    // The casting's own switch overrides Settings: off here, and the next reading is written plain.
    const off = await (await send('PATCH', `${ctx.base}/api/castings/${c.id}`, { memory: false })).json() as Casting
    expect(off.memory).toBe(false)
    expect((await send('PATCH', `${ctx.base}/api/castings/${c.id}`, { memory: 'yes' })).status).toBe(400)
    await post(`${ctx.base}/api/castings/${c.id}/reading?again=1`)
    await readAll(`${ctx.base}/api/castings/${c.id}/events`)
    expect(seen.at(-1)!.system).not.toContain('WHAT YOU KNOW')
    expect(((await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json()) as Casting).memoriesUsed).toEqual([])
    writer = async (_r, onDelta) => { await tick(); onDelta('ok'); return 'ok' }
  })
})
