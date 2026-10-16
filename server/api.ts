import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { KINDS } from '../src/types.ts'
import type { Kind, Profile } from '../src/types.ts'
import { Astro, AstroToolError } from './astro.ts'
import type { ToolCaller } from './astro.ts'
import { castResult, periodFor, titleFor } from './cast.ts'
import { listModels } from './model.ts'
import { readingRequest } from './prompt.ts'
import { Readings } from './readings.ts'
import { Store } from './store.ts'
import type { ServerConfig } from './store.ts'

export interface ApiOptions {
  dir?: string
  /** The tools, for tests; the real server starts astro-mcp. */
  call?: ToolCaller
  readings?: Readings
  store?: Store
}

export interface ApiState {
  store: Store
  call: ToolCaller
  readings: Readings
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
  return { store, call, readings, casting: new Map() }
}

export function createMiddleware(state: ApiState): Handler {
  const { store, call, readings } = state

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
        json(res, 200, store.setConfig(patch))
      }).catch(fail)
      return undefined
    }
    if (url === '/api/models' && method === 'GET') {
      void listModels(store.getConfig()).then((r) => json(res, 200, r))
      return undefined
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
    const m = /^\/api\/castings\/([^/]+)(?:\/(reading|events))?$/.exec(url)
    if (m) {
      const id = decodeURIComponent(m[1]!)
      const sub = m[2]
      const casting = store.getCasting(id)
      if (!casting) return json(res, 404, { error: 'No such casting' })
      if (!sub && method === 'GET') return json(res, 200, casting)
      if (!sub && method === 'DELETE') { readings.stop(id); store.removeCasting(id); return json(res, 200, { ok: true }) }
      if (sub === 'reading' && method === 'POST') {
        const again = query.get('again') === '1'
        if (casting.readingState === 'done' && !again) return json(res, 200, casting)
        readings.start(id, readingRequest(casting, store.getProfile()))
        return json(res, 202, store.getCasting(id))
      }
      if (sub === 'reading' && method === 'DELETE') return json(res, 200, { stopped: readings.stop(id) })
      if (sub === 'events' && method === 'GET') { readings.subscribe(id, res); return undefined }
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
