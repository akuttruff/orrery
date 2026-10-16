import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { KINDS } from '../src/types.ts'
import type { Casting, FollowUp, Kind, Profile, Remembered } from '../src/types.ts'
import { Astro, AstroToolError } from './astro.ts'
import type { ToolCaller } from './astro.ts'
import { castResult, periodFor, titleFor } from './cast.ts'
import { listModels, writeWithModel } from './model.ts'
import { Memories, MemoryInputError } from './memory.ts'
import { parseFacts, rememberRequest } from './remember.ts'
import { followUpRequest, readingRequest } from './prompt.ts'
import { Readings, answerOf } from './readings.ts'
import { Store } from './store.ts'
import type { ServerConfig } from './store.ts'

export interface ApiOptions {
  dir?: string
  /** The tools, for tests; the real server starts astro-mcp. */
  call?: ToolCaller
  readings?: Readings
  store?: Store
  /** The shared memory file; defaults to MEMORY_DB or ~/.lm-memory/memory.sqlite. */
  memoryDb?: string
  /** The model, for the short calls that are not streamed to a page (what a question reveals). */
  write?: typeof writeWithModel
}

export interface ApiState {
  store: Store
  call: ToolCaller
  readings: Readings
  memories: Memories
  write: typeof writeWithModel
  /** Casts in flight by kind+period, so two taps run the tools once. */
  casting: Map<string, Promise<unknown>>
}

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) return {}
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object')
  return parsed as Record<string, unknown>
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const isKind = (v: unknown): v is Kind => typeof v === 'string' && (KINDS as string[]).includes(v)

/** A profile patch, checked: the date is what the tools accept, the city is not blank. */
export function profilePatch(body: Record<string, unknown>): Partial<Profile> {
  const out: Partial<Profile> = {}
  const dateTime = str(body.dateTime)
  if (dateTime !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dateTime.trim())) throw new Error("Birth date and time must be 'YYYY-MM-DD HH:MM'")
    out.dateTime = dateTime.trim()
  }
  for (const key of ['name', 'city', 'state', 'country'] as const) {
    const v = str(body[key])
    if (v !== undefined) out[key] = v.trim()
  }
  if (out.city === '') throw new Error('A birth city is needed')
  return out
}

export function createApiState(options: ApiOptions = {}): ApiState {
  const store = options.store ?? new Store(options.dir)
  const interrupted = store.settleInterrupted()
  if (interrupted) console.log(`[orrery] ${interrupted} reading(s) were cut off by the last restart`)
  const astro = options.call ? null : new Astro()
  const call: ToolCaller = options.call ?? ((name, args) => astro!.call(name, args))
  const readings = options.readings ?? new Readings(store)
  return { store, call, readings, memories: new Memories(options.memoryDb), write: options.write ?? writeWithModel, casting: new Map() }
}

export function createMiddleware(state: ApiState): Handler {
  const { store, call, readings, memories } = state

  /** Whether a casting is read with memories: its own switch, else Settings'. */
  const memoryOn = (casting: Casting): boolean => casting.memory ?? store.getConfig().memoryDefault === 'on'

  /** The memory lines for a casting's reading or answer, and the ids they came from; none when memory is off. */
  const memoryFor = (casting: Casting): { lines: string[]; ids: string[] } => {
    if (!memoryOn(casting)) return { lines: [], ids: [] }
    const { lines, used } = memories.context()
    return { lines, ids: used.map((m) => m.id) }
  }

  /**
   * What a question reveals, saved to the pool and noted on the follow-up.
   * Runs beside the answer, not after it: the facts are in the question.
   * Nothing a failure here can do to the answer; it is logged and the note
   * stays empty.
   */
  const rememberFrom = async (followUp: FollowUp): Promise<void> => {
    try {
      const known = memories.list()
      const text = await state.write(store.getConfig(), rememberRequest(followUp.question, known, store.getProfile()), () => {})
      const kept: Remembered[] = []
      for (const fact of parseFacts(text)) {
        try {
          const { memory, duplicate } = memories.remember(fact)
          if (!duplicate) kept.push({ id: memory.id, text: memory.text })
        } catch (err) { console.log(`[orrery] not remembered: ${(err as Error).message}`) }
      }
      if (store.getFollowUp(followUp.id)) store.setRemembered(followUp.id, kept)
    } catch (err) {
      console.log(`[orrery] could not work out what to remember: ${(err as Error).message}`)
      if (store.getFollowUp(followUp.id)) store.setRemembered(followUp.id, [])
    }
  }

  const cast = async (kind: Kind, fresh: boolean): Promise<unknown> => {
    const profile = store.getProfile()
    const period = periodFor(kind, new Date())
    if (!fresh) {
      const kept = store.findCasting(kind, period)
      if (kept) return kept
    }
    const key = `${kind}:${period}`
    let pending = state.casting.get(key)
    if (!pending) {
      pending = (async () => {
        const result = await castResult(kind, period, profile, call)
        // A fresh cast replaces the period's old one; its reading was about the old data.
        if (fresh) for (const old of store.listCastings(200)) if (old.kind === kind && old.period === period) store.removeCasting(old.id)
        return store.addCasting({ kind, period, title: titleFor(kind, period, profile), result })
      })().finally(() => state.casting.delete(key))
      state.casting.set(key, pending)
    }
    return pending
  }

  return (req, res, next) => {
    const url = (req.url ?? '').split('?')[0]!
    const query = new URL(req.url ?? '/', 'http://x').searchParams
    const method = req.method ?? 'GET'
    if (!url.startsWith('/api/')) return next()

    const fail = (err: unknown): void => {
      const status = err instanceof AstroToolError ? 422 : 400
      if (!(err instanceof AstroToolError) && !(err instanceof MemoryInputError) && !(err instanceof SyntaxError) && !/^(Unknown kind|Ask something|Keep the question|Wait for the reading|One answer|Birth date|A birth city|Expected a JSON)/.test((err as Error).message)) console.log(`[orrery] ${(err as Error).message}`)
      json(res, status, { error: (err as Error).message || String(err) })
    }

    if (url === '/api/health' && method === 'GET') {
      void call('planetary_hours', { city: store.getProfile().city, state: store.getProfile().state || undefined, country: store.getProfile().country || undefined })
        .then(() => json(res, 200, { ok: true, astro: true }))
        .catch((err: Error) => json(res, 200, { ok: false, astro: false, error: err.message }))
      return undefined
    }
    if (url === '/api/busy' && method === 'GET') return json(res, 200, { readings: readings.busy, casts: state.casting.size })

    // --- settings -------------------------------------------------------
    if (url === '/api/profile' && method === 'GET') return json(res, 200, store.getProfile())
    if (url === '/api/profile' && method === 'PUT') {
      void readBody(req).then((body) => json(res, 200, store.setProfile(profilePatch(body)))).catch(fail)
      return undefined
    }
    if (url === '/api/config' && method === 'GET') return json(res, 200, store.getPublicConfig())
    if (url === '/api/config' && method === 'PUT') {
      void readBody(req).then((body) => {
        const patch: Partial<ServerConfig> = {}
        for (const key of ['lmStudioUrl', 'apiToken', 'model', 'reasoning'] as const) {
          const v = str(body[key])
          if (v !== undefined) patch[key] = v.trim()
        }
        if (body.memoryDefault !== undefined) patch.memoryDefault = body.memoryDefault === 'on' ? 'on' : 'off'
        json(res, 200, store.setConfig(patch))
      }).catch(fail)
      return undefined
    }
    if (url === '/api/models' && method === 'GET') {
      void listModels(store.getConfig()).then((r) => json(res, 200, r))
      return undefined
    }

    // --- memories -------------------------------------------------------
    if (url === '/api/memories' && method === 'GET') return json(res, 200, memories.list())
    if (url === '/api/memories' && method === 'POST') {
      void readBody(req).then((body) => {
        const { memory, duplicate } = memories.remember(body.text)
        json(res, duplicate ? 200 : 201, memory)
      }).catch(fail)
      return undefined
    }
    const mem = /^\/api\/memories\/([^/]+)$/.exec(url)
    if (mem) {
      const id = decodeURIComponent(mem[1]!)
      if (method === 'DELETE') return memories.forget(id) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'No such memory' })
      if (method === 'PATCH') {
        void readBody(req).then((body) => {
          const updated = memories.update(id, body.text)
          return updated ? json(res, 200, updated) : json(res, 404, { error: 'No such memory' })
        }).catch(fail)
        return undefined
      }
    }

    // --- castings -------------------------------------------------------
    if (url === '/api/castings' && method === 'GET') return json(res, 200, store.listCastings())
    if (url === '/api/castings' && method === 'POST') {
      void readBody(req).then(async (body) => {
        if (!isKind(body.kind)) throw new Error(`Unknown kind: ${String(body.kind)}`)
        json(res, 200, await cast(body.kind, body.fresh === true))
      }).catch(fail)
      return undefined
    }
    const m = /^\/api\/castings\/([^/]+)(?:\/(reading|events|followups))?$/.exec(url)
    if (m) {
      const id = decodeURIComponent(m[1]!)
      const sub = m[2]
      const casting = store.getCasting(id)
      if (!casting) return json(res, 404, { error: 'No such casting' })
      if (!sub && method === 'GET') return json(res, 200, casting)
      if (!sub && method === 'PATCH') {
        void readBody(req).then((body) => {
          if (!('memory' in body)) throw new Error('Nothing to change')
          const memory = body.memory
          if (memory !== null && typeof memory !== 'boolean') throw new Error('memory must be true, false or null')
          json(res, 200, store.setCastingMemory(id, memory))
        }).catch(fail)
        return undefined
      }
      if (!sub && method === 'DELETE') {
        readings.stop(id)
        for (const f of store.listFollowUps(id)) readings.stop(f.id)
        store.removeCasting(id)
        return json(res, 200, { ok: true })
      }
      if (sub === 'reading' && method === 'POST') {
        const again = query.get('again') === '1'
        if (casting.readingState === 'done' && !again) return json(res, 200, casting)
        if (!readings.writing(id)) {
          const memory = memoryFor(casting)
          store.setMemoriesUsed(id, memory.ids)
          readings.start(id, readingRequest(casting, store.getProfile(), new Date(), memory.lines))
        }
        return json(res, 202, store.getCasting(id))
      }
      if (sub === 'reading' && method === 'DELETE') return json(res, 200, { stopped: readings.stop(id) })
      if (sub === 'events' && method === 'GET') { readings.subscribe(id, res); return undefined }
      if (sub === 'followups' && method === 'GET') return json(res, 200, store.listFollowUps(id))
      if (sub === 'followups' && method === 'POST') {
        void readBody(req).then((body) => {
          const question = (str(body.question) ?? '').trim()
          if (!question) throw new Error('Ask something first')
          if (question.length > 2000) throw new Error('Keep the question under 2000 characters')
          const current = store.getCasting(id)!
          if (current.readingState === 'writing' || !current.reading) throw new Error('Wait for the reading to be written, then ask')
          const earlier = store.listFollowUps(id)
          if (earlier.some((f) => f.state === 'writing')) throw new Error('One answer at a time')
          const followUp = store.addFollowUp(id, question)
          const memory = memoryFor(current)
          readings.start(followUp.id, followUpRequest(current, earlier, question, store.getProfile(), new Date(), memory.lines), answerOf(store, followUp.id))
          if (memoryOn(current)) void rememberFrom(followUp)
          else store.setRemembered(followUp.id, [])
          json(res, 202, store.getFollowUp(followUp.id))
        }).catch(fail)
        return undefined
      }
    }

    // --- follow-up questions ---------------------------------------------
    const f = /^\/api\/followups\/([^/]+)(?:\/(answer|events))?$/.exec(url)
    if (f) {
      const id = decodeURIComponent(f[1]!)
      const sub = f[2]
      const followUp = store.getFollowUp(id)
      if (!followUp) return json(res, 404, { error: 'No such question' })
      if (!sub && method === 'GET') return json(res, 200, followUp)
      if (!sub && method === 'DELETE') { readings.stop(id); store.removeFollowUp(id); return json(res, 200, { ok: true }) }
      if (sub === 'answer' && method === 'POST') {
        // Ask again: a failed answer, or one cut off, is written afresh with the thread as it was before this question.
        if (followUp.state === 'writing') return json(res, 202, followUp)
        const casting = store.getCasting(followUp.castingId)
        if (!casting) return json(res, 404, { error: 'No such casting' })
        const earlier = store.listFollowUps(casting.id).filter((x) => x.createdAt < followUp.createdAt || (x.createdAt === followUp.createdAt && x.id !== followUp.id && x.id < followUp.id))
        readings.start(id, followUpRequest(casting, earlier, followUp.question, store.getProfile(), new Date(), memoryFor(casting).lines), answerOf(store, id))
        return json(res, 202, store.getFollowUp(id))
      }
      if (sub === 'answer' && method === 'DELETE') return json(res, 200, { stopped: readings.stop(id) })
      if (sub === 'events' && method === 'GET') { readings.subscribe(id, res, answerOf(store, id)); return undefined }
    }
    return json(res, 404, { error: 'Not found' })
  }
}

// One state per data dir across Vite's config reloads, so a dev restart
// doesn't start a second astro-mcp or forget a reading in progress.
const shared = globalThis as { __orreryApi?: Map<string, ApiState> }

export default function api(options: ApiOptions = {}): Plugin {
  const states = (shared.__orreryApi ??= new Map())
  const key = path.resolve(options.dir ?? '.data')
  let state = states.get(key)
  if (!state) {
    state = createApiState(options)
    states.set(key, state)
  }
  const middleware = createMiddleware(state)
  return {
    name: 'orrery-api',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}
