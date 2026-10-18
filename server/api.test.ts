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
import type { Reply, WriteOptions, WriteRequest, writeWithModel } from './model.ts'
import type { Casting, CastingSummary, FollowUp, Memory, Step, Written } from '../src/types.ts'

/** The API on a real socket, with fake tools and a fake model, in a scratch data dir. */
const plain = (text: string): Reply => ({ text, trail: [], stats: null })

/** A test's writer may return the text alone; the real one returns the text with its trail and numbers. */
function serve(write: (req: WriteRequest, onDelta: (t: string) => void, opts?: WriteOptions) => Promise<Reply | string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orrery-'))
  const store = new Store(dir, '/nonexistent/lm-chat.sqlite')
  const call = vi.fn(async (name: string, args: Record<string, unknown>) => JSON.stringify({ tool: name, args }))
  const model: typeof writeWithModel = async (_config, req, onDelta, opts) => { const r = await write(req, onDelta, opts); return typeof r === 'string' ? plain(r) : r }
  const readings = new Readings(store, model)
  // The memory pool lives in the scratch dir too, never in ~/.lm-memory.
  const state: ApiState = createApiState({ store, call, readings, memoryDb: path.join(dir, 'memory.sqlite'), write: model })
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
let writer = async (_req: WriteRequest, onDelta: (t: string) => void, _opts?: WriteOptions): Promise<Reply | string> => { await tick(); onDelta('Hello'); await tick(); onDelta(' there'); return plain('Hello there') }

beforeEach(async () => {
  // The shared setup stubs fetch for page tests; these talk to a real socket.
  vi.unstubAllGlobals()
  ctx = await serve((req, onDelta, opts) => writer(req, onDelta, opts))
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
  it('casts anew on every tap and keeps the earlier castings', async () => {
    const first = await post(`${ctx.base}/api/castings`, { kind: 'today' })
    expect(first.status).toBe(201)
    const a = await first.json() as Casting
    const b = await (await post(`${ctx.base}/api/castings`, { kind: 'today' })).json() as Casting
    expect(b.id).not.toBe(a.id)
    expect(a.updatedAt).toBe(a.createdAt)
    expect(ctx.call).toHaveBeenCalledTimes(2)
    expect(ctx.call.mock.calls[0]![0]).toBe('create_transit_chart')
    expect((await fetch(`${ctx.base}/api/castings/${a.id}`)).status).toBe(200)
    const list = await (await fetch(`${ctx.base}/api/castings`)).json() as CastingSummary[]
    expect(list.map((c) => c.id)).toEqual([b.id, a.id])
    expect(list[0]!.questions).toBe(0)
  })

  it('lists the casting that changed last first: a reading or a question moves it up', async () => {
    const a = await (await post(`${ctx.base}/api/castings`, { kind: 'natal' })).json() as Casting
    const b = await (await post(`${ctx.base}/api/castings`, { kind: 'moon' })).json() as Casting
    let list = await (await fetch(`${ctx.base}/api/castings`)).json() as CastingSummary[]
    expect(list.map((c) => c.id)).toEqual([b.id, a.id])
    // The older one is read: it is the latest change now.
    await post(`${ctx.base}/api/castings/${a.id}/reading`)
    await (await fetch(`${ctx.base}/api/castings/${a.id}/events`)).text()
    const read = await (await fetch(`${ctx.base}/api/castings/${a.id}`)).json() as Casting
    expect(read.updatedAt).toBeGreaterThanOrEqual(read.written.finishedAt!)
    list = await (await fetch(`${ctx.base}/api/castings`)).json() as CastingSummary[]
    expect(list.map((c) => c.id)).toEqual([a.id, b.id])
    // A question under it counts, and keeps it there.
    await post(`${ctx.base}/api/castings/${a.id}/followups`, { question: 'And Venus?' })
    list = await (await fetch(`${ctx.base}/api/castings`)).json() as CastingSummary[]
    expect(list[0]).toMatchObject({ id: a.id, questions: 1 })
  })

  it('casts with the memory choice made before the tap', async () => {
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'today', memory: false, memoryExcluded: ['m1', 'm1', 'm2'] })).json() as Casting
    expect(c).toMatchObject({ memory: false, memoryExcluded: ['m1', 'm2'] })
    expect(await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json()).toMatchObject({ memory: false, memoryExcluded: ['m1', 'm2'] })
    expect((await post(`${ctx.base}/api/castings`, { kind: 'today', memory: 'yes' })).status).toBe(400)
    expect((await post(`${ctx.base}/api/castings`, { kind: 'today', memoryExcluded: 'm1' })).status).toBe(400)
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
    writer = async (_r, onDelta) => { await tick(); onDelta('ok'); return plain('ok') }
  })
})

describe('questions under a reading', () => {
  const readAll = async (url: string) => {
    const events = await (await fetch(url)).text()
    return events.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.slice(5)) as { type: string; reading?: string; trail?: Step[]; written?: Written })
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
    const thought: Step = { kind: 'reasoning', text: 'Check Saturn.', done: true, seconds: 0.3 }
    writer = async (req, onDelta, opts) => {
      seen.push(req)
      await tick()
      opts?.onTrail?.([{ kind: 'reasoning', text: '', done: false }])
      opts?.onThinking?.('Check Saturn.')
      opts?.onTrail?.([thought, { kind: 'tool', name: 'verify_claim', ok: null }])
      await tick()
      const trail: Step[] = [thought, { kind: 'tool', name: 'verify_claim', ok: true }]
      opts?.onTrail?.(trail)
      onDelta('Because '); await tick(); onDelta('Saturn.')
      return { text: 'Because Saturn.', trail, stats: { model: 'm', inputTokens: 10, outputTokens: 5, reasoningTokens: 2, tokensPerSecond: 20, firstTokenSeconds: 0.5 } }
    }
    const c = await castAndRead()
    expect(c.reading).toBe('Because Saturn.')
    // When the reading was written, how long it took and what it cost are kept with it.
    expect(c.written.startedAt).toBeGreaterThan(0)
    expect(c.written.finishedAt).toBeGreaterThanOrEqual(c.written.startedAt!)
    expect(c.written.stats).toMatchObject({ model: 'm', tokensPerSecond: 20 })

    const started = await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'Which day is best for the move?' })
    expect(started.status).toBe(202)
    const f1 = await started.json() as FollowUp
    expect(f1).toMatchObject({ castingId: c.id, question: 'Which day is best for the move?', state: 'writing' })
    // A second question while the first is being answered waits its turn.
    expect((await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'And the second?' })).status).toBe(400)

    const events = await readAll(`${ctx.base}/api/followups/${f1.id}/events`)
    const types = events.map((e) => e.type)
    expect(types[0]).toBe('snapshot')
    expect(types.at(-1)).toBe('done')
    // The model's trail (its thinking, the tool calls LM Studio ran) is streamed and kept with the answer, with the turn's numbers.
    expect(events.at(-1)).toMatchObject({ type: 'done', written: { trail: [thought, { kind: 'tool', name: 'verify_claim', ok: true }], stats: { tokensPerSecond: 20 } } })
    const kept = await (await fetch(`${ctx.base}/api/followups/${f1.id}`)).json() as FollowUp
    expect(kept).toMatchObject({ state: 'done', answer: 'Because Saturn.', written: { trail: [thought, { kind: 'tool', name: 'verify_claim', ok: true }], stats: { model: 'm', inputTokens: 10 } } })
    expect(kept.written.finishedAt).toBeGreaterThanOrEqual(kept.written.startedAt!)

    // The answer may call astro-mcp through LM Studio; the reading itself does not.
    expect(seen[0]!.tools).toBeUndefined()
    const askReq = seen[1]!
    expect(askReq.tools).toEqual(['mcp/astrology-v2'])
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
    writer = async (_r, onDelta) => { await tick(); onDelta('ok'); return plain('ok') }
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
    writer = async (_r, onDelta) => { await tick(); onDelta('ok'); return plain('ok') }
  })

  it('leaves the memories a casting unticks out of its reading and answers, and notes which went in', async () => {
    const seen: WriteRequest[] = []
    writer = async (req, onDelta) => {
      seen.push(req)
      if (req.system.startsWith('You keep notes')) return '[]'
      onDelta('Known.'); return 'Known.'
    }
    const nights = await (await post(`${ctx.base}/api/memories`, { text: 'The user works nights.' })).json() as Memory
    const cat = await (await post(`${ctx.base}/api/memories`, { text: 'The user has a cat.' })).json() as Memory
    await send('PUT', `${ctx.base}/api/config`, { memoryDefault: 'on' })
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'month' })).json() as Casting
    expect(c.memoryExcluded).toEqual([])
    expect((await send('PATCH', `${ctx.base}/api/castings/${c.id}`, { memoryExcluded: 'cat' })).status).toBe(400)
    const chosen = await (await send('PATCH', `${ctx.base}/api/castings/${c.id}`, { memoryExcluded: [cat.id, cat.id] })).json() as Casting
    expect(chosen.memoryExcluded).toEqual([cat.id])

    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    await readAll(`${ctx.base}/api/castings/${c.id}/events`)
    expect(seen[0]!.system).toContain('- The user works nights.')
    expect(seen[0]!.system).not.toContain('cat')
    expect(((await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json()) as Casting).memoriesUsed).toEqual([nights.id])

    const f = await (await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'Any good days?' })).json() as FollowUp
    expect(f.memoriesUsed).toEqual([nights.id])
    await readAll(`${ctx.base}/api/followups/${f.id}/events`)
    const answer = seen.find((r) => r.system.includes('same astrologer'))!
    expect(answer.system).not.toContain('cat')
    let kept = await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json() as FollowUp
    for (let i = 0; i < 20 && kept.remembered === null; i++) { await tick(); kept = await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json() as FollowUp }
    expect(kept.remembered).toEqual([])

    // Ticked back in, the next answer has it.
    await send('PATCH', `${ctx.base}/api/castings/${c.id}`, { memoryExcluded: [] })
    await post(`${ctx.base}/api/followups/${f.id}/answer`)
    await readAll(`${ctx.base}/api/followups/${f.id}/events`)
    expect(seen.at(-1)!.system).toContain('- The user has a cat.')
    expect(((await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json()) as FollowUp).memoriesUsed.sort()).toEqual([cat.id, nights.id].sort())
    writer = async (_r, onDelta) => { await tick(); onDelta('ok'); return plain('ok') }
  })
})
