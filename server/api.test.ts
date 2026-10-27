// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createApiState, createMiddleware, profilePatch } from './api.ts'
import { Readings } from './readings.ts'
import { Store } from './store.ts'
import { REMEMBER_TIMEOUT_MS } from './remember.ts'
import type { ApiState } from './api.ts'
import type { Reply, WriteOptions, WriteRequest, writeWithModel } from './model.ts'
import type { Casting, CastingSummary, FollowUp, Memory, Step, Written } from '../src/types.ts'
import { parseWheel } from '../src/lib/chartWheel.ts'
import { READINGS_PROMPT, aspectKey } from '../src/lib/readings.ts'
import transitChart from '../src/test/fixtures/transit-chart.json?raw'

/** The API on a real socket, with fake tools and a fake model, in a scratch data dir. */
const plain = (text: string): Reply => ({ text, trail: [], stats: null })

/** A test's writer may return the text alone; the real one returns the text with its trail and numbers. */
function serve(write: (req: WriteRequest, onDelta: (t: string) => void, opts?: WriteOptions) => Promise<Reply | string>, timeoutMs?: number) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orrery-'))
  const store = new Store(dir, '/nonexistent/lm-chat.sqlite')
  const call = vi.fn(async (name: string, args: Record<string, unknown>) => JSON.stringify({ tool: name, args }))
  // The tarot server: deals the spread asked for, the Fool first and the Tower reversed second.
  const tarot = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'list_spreads') return '[]'
    const n = args.spread === 'single' ? 1 : args.spread === 'celtic-cross' ? 10 : 3
    const names = ['The Fool', 'The Tower', 'The Star', 'Two of Cups', 'Ace of Wands', 'Justice', 'The Moon', 'Six of Swords', 'The Sun', 'The World']
    const ids = ['major-00', 'major-16', 'major-17', 'cups-02', 'wands-01', 'major-11', 'major-18', 'swords-06', 'major-19', 'major-21']
    return JSON.stringify({ spread: { id: args.spread, name: args.spread === 'single' ? 'One card' : 'Past, present, future', description: '' }, question: args.question ?? null, drawnAt: 'x', seed: 1, cards: Array.from({ length: n }, (_, i) => ({ position: { index: i + 1, name: `P${i + 1}`, meaning: '' }, card: { id: ids[i], name: names[i], arcana: 'major', suit: null, number: i }, reversed: i === 1, keywords: ['k'], meaning: 'm' })), summary: {} })
  })
  fs.mkdirSync(path.join(dir, 'deck'))
  fs.writeFileSync(path.join(dir, 'deck', 'major-00.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  // Pictures that cannot be read: one locked, one a folder that opens but fails on the first read.
  fs.writeFileSync(path.join(dir, 'deck', 'major-01.jpg'), 'x', { mode: 0o000 })
  fs.mkdirSync(path.join(dir, 'deck', 'major-02.jpg'))
  const model: typeof writeWithModel = async (_config, req, onDelta, opts) => { const r = await write(req, onDelta, opts); return typeof r === 'string' ? plain(r) : r }
  const readings = new Readings(store, model, timeoutMs)
  // The memory pool lives in the scratch dir too, never in ~/.lm-memory.
  const state: ApiState = createApiState({ store, call, tarot, readings, dir, memoryDb: path.join(dir, 'memory.sqlite'), write: model, deckDir: path.join(dir, 'deck') })
  const server = http.createServer((req, res) => createMiddleware(state)(req, res, () => { res.writeHead(404); res.end() }))
  return new Promise<{ base: string; call: typeof call; tarot: typeof tarot; close: () => void }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      resolve({ base: `http://127.0.0.1:${port}`, call, tarot, close: () => { server.close(); store.close(); fs.rmSync(dir, { recursive: true, force: true }) } })
    })
  })
}

const post = (url: string, body?: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

let ctx: Awaited<ReturnType<typeof serve>>
// Writes a word at a time with a pause between, so a stream opened right after the start sees the deltas.
const tick = () => new Promise((r) => setTimeout(r, 25))
const defaultWriter = async (_req: WriteRequest, onDelta: (t: string) => void, _opts?: WriteOptions): Promise<Reply | string> => { await tick(); onDelta('Hello'); await tick(); onDelta(' there'); return plain('Hello there') }
let writer = defaultWriter

beforeEach(async () => {
  writer = defaultWriter
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

  it('keeps the model to use when loaded, empty until one is chosen and clearable again', async () => {
    const put = (body: object) => fetch(`${ctx.base}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<Record<string, unknown>>)
    expect(((await (await fetch(`${ctx.base}/api/config`)).json()) as { preferredModel: string }).preferredModel).toBe('')
    expect(await put({ model: 'qwen', preferredModel: ' qwen-big ' })).toMatchObject({ model: 'qwen', preferredModel: 'qwen-big' })
    expect(((await (await fetch(`${ctx.base}/api/config`)).json()) as { preferredModel: string }).preferredModel).toBe('qwen-big')
    expect(await put({ reasoning: 'off' })).toMatchObject({ preferredModel: 'qwen-big' })
    expect(await put({ preferredModel: '' })).toMatchObject({ model: 'qwen', preferredModel: '' })
  })

  it('keeps the quick jobs model, empty until one is chosen and clearable again', async () => {
    const put = (body: object) => fetch(`${ctx.base}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<Record<string, unknown>>)
    expect(((await (await fetch(`${ctx.base}/api/config`)).json()) as { fastModel: string }).fastModel).toBe('')
    expect(await put({ model: 'qwen', fastModel: ' qwen-9b ' })).toMatchObject({ model: 'qwen', fastModel: 'qwen-9b' })
    expect(((await (await fetch(`${ctx.base}/api/config`)).json()) as { fastModel: string }).fastModel).toBe('qwen-9b')
    expect(await put({ preferredModel: 'qwen-big' })).toMatchObject({ preferredModel: 'qwen-big', fastModel: 'qwen-9b' })
    expect(await put({ fastModel: '' })).toMatchObject({ model: 'qwen', preferredModel: 'qwen-big', fastModel: '' })
  })

  it('forgets the token when the LM Studio URL changes without a new one, so it is never sent to another server', async () => {
    const put = (body: object) => fetch(`${ctx.base}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<Record<string, unknown>>)
    await put({ apiToken: 'secret' })
    const url = (await put({})).lmStudioUrl as string
    expect(await put({ lmStudioUrl: url, model: 'qwen' })).toMatchObject({ hasToken: true })
    expect(await put({ lmStudioUrl: 'http://elsewhere:1234' })).toMatchObject({ hasToken: false })
    expect(await put({ lmStudioUrl: 'http://other:1234', apiToken: 'new' })).toMatchObject({ lmStudioUrl: 'http://other:1234', hasToken: true })
  })

  it('refuses a body over the limit with 413, and one that is not an object with 400', async () => {
    const big = await fetch(`${ctx.base}/api/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(1_100_000) }) })
    expect(big.status).toBe(413)
    expect(((await big.json()) as { error: string }).error).toMatch(/under/)
    expect((await fetch(`${ctx.base}/api/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '[1]' })).status).toBe(400)
    expect((await fetch(`${ctx.base}/api/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{nope' })).status).toBe(400)
    expect(((await (await fetch(`${ctx.base}/api/profile`)).json()) as { name: string }).name).not.toMatch(/^x+$/)
  })

  it('refuses a birth time the tools would reject', async () => {
    const r = await fetch(`${ctx.base}/api/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dateTime: 'June 15 1990' }) })
    expect(r.status).toBe(400)
    expect(profilePatch({ name: ' Sam ', state: 'NY' })).toEqual({ name: 'Sam', state: 'NY' })
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

  it('shares one cast between two taps alike, but not between two questions asked of the cards at once', async () => {
    const deal = ctx.tarot.getMockImplementation()!
    ctx.tarot.mockImplementation(async (name, args) => { await tick(); return deal(name, args) })
    const [a, b] = await Promise.all([post(`${ctx.base}/api/castings`, { kind: 'spread', note: 'Work?' }), post(`${ctx.base}/api/castings`, { kind: 'spread', note: 'Work?' })])
    expect(((await a.json()) as Casting).id).toBe(((await b.json()) as Casting).id)
    const [c, d] = await Promise.all([post(`${ctx.base}/api/castings`, { kind: 'spread', note: 'Work?' }), post(`${ctx.base}/api/castings`, { kind: 'spread', note: 'Love?' })])
    const [cc, dd] = [(await c.json()) as Casting, (await d.json()) as Casting]
    expect(cc.id).not.toBe(dd.id)
    expect([cc.note, dd.note]).toEqual(['Work?', 'Love?'])
    expect(ctx.tarot.mock.calls.filter(([, args]) => args.question === 'Love?')).toHaveLength(1)
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

  it('writes a sentence for each transit on a today wheel beside the reading, and keeps it on the casting', async () => {
    const asked: WriteRequest[] = []
    writer = async (req) => {
      asked.push(req)
      if (req.system !== READINGS_PROMPT) return 'The reading.'
      const keys = [...req.input.matchAll(/^- key: (.+)$/gm)].map((m) => m[1]!)
      return JSON.stringify(Object.fromEntries(keys.map((k) => [k, `About ${k.split('|')[0]} today.`])))
    }
    ctx.call.mockImplementation(async (name: string) => (name === 'create_transit_chart' ? transitChart : '{}'))
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'today' })).json() as Casting
    expect(c.transitReadings).toBeNull()
    // A casting with no transit wheel has nothing to write, and says so at once rather than being looked at on every open.
    const moon = await (await post(`${ctx.base}/api/castings`, { kind: 'moon' })).json() as Casting
    expect((await (await fetch(`${ctx.base}/api/castings/${moon.id}`)).json() as Casting).transitReadings).toEqual({})
    let kept = c
    for (let i = 0; i < 40 && kept.transitReadings === null; i++) {
      await tick()
      kept = await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json() as Casting
    }
    const wheel = parseWheel(transitChart)!
    expect(Object.keys(kept.transitReadings!)).toHaveLength(wheel.aspects.length)
    expect(kept.transitReadings![aspectKey(wheel.aspects[0]!)]).toMatch(/^About \w+ today\.$/)
    // One short call, without thinking, and only once.
    expect(asked.filter((r) => r.system === READINGS_PROMPT)).toHaveLength(1)
    expect(asked.find((r) => r.system === READINGS_PROMPT)).toMatchObject({ reasoning: 'off', quick: true })
    // The reading itself is not a quick job.
    expect(asked.find((r) => r.system !== READINGS_PROMPT)?.quick).toBeFalsy()
    await fetch(`${ctx.base}/api/castings/${c.id}`)
    expect(asked.filter((r) => r.system === READINGS_PROMPT)).toHaveLength(1)
    expect(await (await fetch(`${ctx.base}/api/busy`)).json()).toMatchObject({ transits: 0 })
  })

  it('casts with the kind of reading and the note, keeps the brief once the reading starts, and refuses a style it does not know', async () => {
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'today', style: 'coach', note: ' anxious today ' })).json() as Casting
    expect(c).toMatchObject({ style: 'coach', note: 'anxious today', brief: null })
    expect((await post(`${ctx.base}/api/castings`, { kind: 'today', style: 'wizard' })).status).toBe(400)
    expect((await post(`${ctx.base}/api/castings`, { kind: 'today', note: 'x'.repeat(601) })).status).toBe(400)
    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    await (await fetch(`${ctx.base}/api/castings/${c.id}/events`)).text()
    const kept = await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json() as Casting
    expect(kept.brief!.system).toContain('Be their coach.')
    expect(kept.brief!.system).toContain('WHAT SAM ASKED FOR, in their words: "anxious today"')
    expect(kept.brief!.task).toMatch(/^Write today's reading/)
    expect(kept.brief!.task).not.toContain('"chart_type"')
    // Changed before a Write again; starred from the list.
    const changed = await (await fetch(`${ctx.base}/api/castings/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style: 'plain', note: '', starred: true }) })).json() as Casting
    expect(changed).toMatchObject({ style: 'plain', note: '', starred: true })
    expect((await fetch(`${ctx.base}/api/castings/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ starred: 'yes' }) })).status).toBe(400)
    const list = await (await fetch(`${ctx.base}/api/castings`)).json() as CastingSummary[]
    expect(list.find((x) => x.id === c.id)).toMatchObject({ style: 'plain', starred: true })
  })

  it('keeps a casting starred from the start', async () => {
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'today', starred: true })).json() as Casting
    expect(c.starred).toBe(true)
    expect((await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json() as Casting).starred).toBe(true)
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

  /** A writer that writes one word, then waits for its signal, failing as the real client does when aborted. */
  const hanging = async (_r: WriteRequest, onDelta: (t: string) => void, opts?: WriteOptions): Promise<Reply> => {
    await tick()
    onDelta('Half')
    await new Promise<void>((_, reject) => opts?.signal?.addEventListener('abort', () => reject(new Error(`Couldn't reach LM Studio. (${String(opts.signal?.reason)})`))))
    return plain('never')
  }

  it('says a stopped reading was stopped, and keeps what was written', async () => {
    writer = hanging
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'moon' })).json() as Casting
    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    await tick(); await tick()
    expect(await (await fetch(`${ctx.base}/api/castings/${c.id}/reading`, { method: 'DELETE' })).json()).toEqual({ stopped: true })
    await fetch(`${ctx.base}/api/castings/${c.id}/events`)
    const kept = await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json() as Casting
    expect(kept.readingState).toBe('failed')
    expect(kept.readingError).toBe('Stopped before it was finished.')
    expect(kept.reading).toBe('Half')
  })

  it('gives up on a model that goes quiet, keeping what it wrote', async () => {
    ctx.close()
    ctx = await serve((req, onDelta, opts) => hanging(req, onDelta, opts), 120)
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'moon' })).json() as Casting
    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    // The stream ends when the run does, given up on once the model has said nothing for the stall time.
    await (await fetch(`${ctx.base}/api/castings/${c.id}/events`)).text()
    const kept = await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json() as Casting
    expect(kept.readingState).toBe('failed')
    expect(kept.readingError).toMatch(/^Given up after 0 minutes without a word from the model/)
    expect(kept.reading).toBe('Half')
    expect(await (await fetch(`${ctx.base}/api/busy`)).json()).toMatchObject({ readings: 0 })
  })

  it('waits on a slow model as long as it keeps writing or thinking', async () => {
    ctx.close()
    // Each gap is under the stall time; the whole run is many times over it.
    ctx = await serve(async (_r, onDelta, opts) => {
      const pause = () => new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 70)
        opts?.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')) })
      })
      for (const word of ['One', ' two', ' three', ' four']) { await pause(); onDelta(word) }
      await pause(); opts?.onThinking?.('still here')
      await pause(); onDelta(' five')
      return plain('One two three four five')
    }, 120)
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'moon' })).json() as Casting
    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    await (await fetch(`${ctx.base}/api/castings/${c.id}/events`)).text()
    const kept = await (await fetch(`${ctx.base}/api/castings/${c.id}`)).json() as Casting
    expect(kept.readingState).toBe('done')
    expect(kept.reading).toBe('One two three four five')
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
    expect(askReq.tools).toEqual(['mcp/astrology-v2', 'mcp/tarot'])
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

  it("casts for a friend in their own chart, without your memories, and remembers nothing from questions about them", async () => {
    const seen: WriteRequest[] = []
    writer = async (req, onDelta) => { seen.push(req); onDelta('Read.'); return 'Read.' }
    await post(`${ctx.base}/api/memories`, { text: 'The user works nights.' })
    await send('PUT', `${ctx.base}/api/config`, { memoryDefault: 'on' })

    expect((await post(`${ctx.base}/api/people`, { name: 'Jo', dateTime: 'June 8 1960', city: 'Pleasanton' })).status).toBe(400)
    expect((await post(`${ctx.base}/api/people`, { name: '', dateTime: '1960-06-08 09:45', city: 'Pleasanton' })).status).toBe(400)
    const jo = await (await post(`${ctx.base}/api/people`, { name: ' Jo ', dateTime: '1960-06-08 09:45', city: 'Pleasanton', state: 'CA', country: 'USA' })).json() as { id: string; name: string }
    expect(jo.name).toBe('Jo')
    expect(((await (await fetch(`${ctx.base}/api/people`)).json()) as { name: string }[]).map((p) => p.name)).toEqual(['Jo'])

    const today = await (await post(`${ctx.base}/api/castings`, { kind: 'today', personId: jo.id })).json() as Casting
    const args = JSON.parse(today.result).args as Record<string, unknown>
    expect(args).toMatchObject({ date_time: '1960-06-08 09:45', city: 'Pleasanton', state: 'CA' })
    expect(today.title).toMatch(/^Jo · Today/)
    expect(today.subject?.name).toBe('Jo')
    expect(today.memory).toBe(false)
    const natal = await (await post(`${ctx.base}/api/castings`, { kind: 'natal', personId: jo.id })).json() as Casting
    expect(natal.title).toBe("Jo's birth chart")
    // The list carries whose reading each is.
    const listed = await (await fetch(`${ctx.base}/api/castings`)).json() as { id: string; subject: { name: string } | null }[]
    expect(listed.find((c) => c.id === today.id)?.subject?.name).toBe('Jo')

    await post(`${ctx.base}/api/castings/${today.id}/reading`)
    await readAll(`${ctx.base}/api/castings/${today.id}/events`)
    expect(seen[0]!.system).toContain("This chart is Jo's, cast at the request of Sam")
    expect(seen[0]!.system).toContain('born 1960-06-08 09:45 in Pleasanton')
    expect(seen[0]!.system).not.toContain('WHAT YOU KNOW')
    const f = await (await post(`${ctx.base}/api/castings/${today.id}/followups`, { question: 'Is Tuesday good for her?' })).json() as FollowUp
    await readAll(`${ctx.base}/api/followups/${f.id}/events`)
    const answer = seen.find((r) => r.system.includes('same astrologer'))!
    expect(answer.system).toContain('The questions below come from Sam, not Jo')
    expect(answer.input).toContain('Sam asks: Is Tuesday good for her?')
    expect(seen.some((r) => r.system.startsWith('You keep notes'))).toBe(false)
    expect(await (await fetch(`${ctx.base}/api/memories`)).json()).toHaveLength(1)

    // Removing Jo leaves the readings cast for her as they were; casting for her again is refused plainly.
    expect((await fetch(`${ctx.base}/api/people/${jo.id}`, { method: 'DELETE' })).status).toBe(200)
    expect(((await (await fetch(`${ctx.base}/api/castings/${today.id}`)).json()) as Casting).subject?.name).toBe('Jo')
    const gone = await post(`${ctx.base}/api/castings`, { kind: 'today', personId: jo.id })
    expect(gone.status).toBe(400)
    expect(((await gone.json()) as { error: string }).error).toMatch(/no longer saved/)
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

  it('gives up on note-taking that never ends, and the follow-up says nothing was remembered', async () => {
    const timeout = new AbortController()
    const spy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => ms === REMEMBER_TIMEOUT_MS ? timeout.signal : new AbortController().signal)
    writer = async (req, onDelta, opts) => {
      if (!req.system.startsWith('You keep notes')) { onDelta('Known.'); return 'Known.' }
      // Stuck until the signal gives up on it, as a wedged model would be.
      return new Promise((_resolve, reject) => opts!.signal!.addEventListener('abort', () => reject(new Error('The operation timed out'))))
    }
    await send('PUT', `${ctx.base}/api/config`, { memoryDefault: 'on' })
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'week' })).json() as Casting
    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    await readAll(`${ctx.base}/api/castings/${c.id}/events`)
    const f = await (await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'My sister visits Tuesday?' })).json() as FollowUp
    await readAll(`${ctx.base}/api/followups/${f.id}/events`)
    await tick()
    expect(((await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json()) as FollowUp).remembered).toBeNull()
    timeout.abort()
    let kept = await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json() as FollowUp
    for (let i = 0; i < 20 && kept.remembered === null; i++) { await tick(); kept = await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json() as FollowUp }
    expect(kept.remembered).toEqual([])
    spy.mockRestore()
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

describe('health', () => {
  it('reports the process, its data file, what is busy, and whether astro-mcp and the model answer', async () => {
    const h = await (await fetch(`${ctx.base}/api/health`)).json() as Record<string, unknown>
    expect(h).toMatchObject({ ok: true, app: 'orrery', busy: { readings: 0, casts: 0, transits: 0 }, deps: { astro: 'ok' } })
    expect(['ok', 'down']).toContain((h.deps as Record<string, string>).model)
    expect(h.data).toMatchObject({ file: 'orrery.sqlite' })
    expect(typeof h.version).toBe('string')
  })
})

describe('tarot', () => {
  it('deals a daily card and a spread, titles them by the spread, and serves the card pictures', async () => {
    const card = await (await post(`${ctx.base}/api/castings`, { kind: 'card', note: 'what today asks' })).json() as Casting
    expect(card).toMatchObject({ kind: 'card', title: expect.stringMatching(/^Card · /) })
    expect(ctx.tarot).toHaveBeenCalledWith('draw_cards', { spread: 'single', reversals: true, question: 'what today asks' })
    expect(JSON.parse(card.result).cards).toHaveLength(1)
    const spread = await (await post(`${ctx.base}/api/castings`, { kind: 'spread', spread: 'celtic-cross' })).json() as Casting
    expect(spread.title).toMatch(/^Celtic Cross · /)
    expect(JSON.parse(spread.result).cards).toHaveLength(10)
    expect(ctx.tarot).toHaveBeenLastCalledWith('draw_cards', { spread: 'celtic-cross', reversals: true })
    const bad = await post(`${ctx.base}/api/castings`, { kind: 'spread', spread: 'hexagram' })
    expect(bad.status).toBe(400)
    const pic = await fetch(`${ctx.base}/api/tarot/major-00.jpg`)
    expect(pic.status).toBe(200)
    expect(pic.headers.get('content-type')).toBe('image/jpeg')
    expect((await fetch(`${ctx.base}/api/tarot/major-99.jpg`)).status).toBe(404)
    expect((await fetch(`${ctx.base}/api/tarot/..%2F..%2Fetc.jpg`)).status).toBe(404)
    // A picture that cannot be read is answered, or cut short, and the server goes on.
    expect((await fetch(`${ctx.base}/api/tarot/major-01.jpg`)).status).toBe(500)
    await fetch(`${ctx.base}/api/tarot/major-02.jpg`).then((r) => r.arrayBuffer()).catch(() => null)
    expect((await fetch(`${ctx.base}/api/tarot/major-00.jpg`)).status).toBe(200)
  })

  it('pulls a card beside a chart reading, keeps it on a follow-up, and has the model read it against the reading', async () => {
    const seen: WriteRequest[] = []
    writer = async (req, onDelta) => { seen.push(req); onDelta('The Tower, reversed, says the fall is behind you.'); return plain('The Tower, reversed, says the fall is behind you.') }
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'today' })).json() as Casting
    expect((await post(`${ctx.base}/api/castings/${c.id}/card`)).status).toBe(400)
    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    await new Promise((r) => setTimeout(r, 120))
    const r = await post(`${ctx.base}/api/castings/${c.id}/card`)
    expect(r.status).toBe(202)
    const f = await r.json() as FollowUp
    expect(f.question).toBe('Pulled a card: The Fool')
    expect(f.card).toMatchObject({ card: { id: 'major-00', name: 'The Fool' }, reversed: false })
    await new Promise((r) => setTimeout(r, 120))
    const kept = await (await fetch(`${ctx.base}/api/followups/${f.id}`)).json() as FollowUp
    expect(kept.state).toBe('done')
    expect(kept.card?.card.id).toBe('major-00')
    const req = seen.at(-1)!
    expect(req.input).toMatch(/pulled a tarot card beside this reading: The Fool, upright/)
    expect(req.tools).toEqual(['mcp/astrology-v2', 'mcp/tarot'])
    // The thread replays the pull as such.
    const q = await (await post(`${ctx.base}/api/castings/${c.id}/followups`, { question: 'and the week?' })).json() as FollowUp
    await new Promise((r) => setTimeout(r, 120))
    expect(seen.at(-1)!.input).toMatch(/pulled a card: The Fool, upright/)
    expect(q.card).toBeNull()
  })

  it('pulls one card for a double tap, though the deal takes a while', async () => {
    const c = await (await post(`${ctx.base}/api/castings`, { kind: 'today' })).json() as Casting
    await post(`${ctx.base}/api/castings/${c.id}/reading`)
    await new Promise((r) => setTimeout(r, 120))
    const deal = ctx.tarot.getMockImplementation()!
    ctx.tarot.mockImplementationOnce(async (name, args) => { await new Promise((r) => setTimeout(r, 60)); return deal(name, args) })
    const [a, b] = await Promise.all([post(`${ctx.base}/api/castings/${c.id}/card`), post(`${ctx.base}/api/castings/${c.id}/card`)])
    expect([a.status, b.status].sort()).toEqual([202, 400])
    expect(await (await fetch(`${ctx.base}/api/castings/${c.id}/followups`)).json()).toHaveLength(1)
    expect(ctx.tarot.mock.calls.filter(([name]) => name === 'draw_cards')).toHaveLength(1)
  })
})
