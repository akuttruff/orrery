import type { Casting, CastingSummary, Config, FollowUp, Kind, Memory, Profile } from '../types.ts'

/** The server, from the page. Every call throws with the server's message on failure. */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const body = await r.json().catch(() => ({})) as T & { error?: string }
  if (!r.ok) throw new Error(body.error || `${r.status} from ${url}`)
  return body
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

export const api = {
  profile: () => request<Profile>('/api/profile'),
  saveProfile: (patch: Partial<Profile>) => request<Profile>('/api/profile', jsonInit('PUT', patch)),
  config: () => request<Config>('/api/config'),
  saveConfig: (patch: Record<string, string>) => request<Config>('/api/config', jsonInit('PUT', patch)),
  models: () => request<{ models: string[]; loaded: string[]; error: string | null }>('/api/models'),
  castings: () => request<CastingSummary[]>('/api/castings'),
  cast: (kind: Kind, fresh = false) => request<Casting>('/api/castings', jsonInit('POST', { kind, fresh })),
  casting: (id: string) => request<Casting>(`/api/castings/${encodeURIComponent(id)}`),
  setCastingMemory: (id: string, memory: boolean | null) => request<Casting>(`/api/castings/${encodeURIComponent(id)}`, jsonInit('PATCH', { memory })),
  startReading: (id: string, again = false) => request<Casting>(`/api/castings/${encodeURIComponent(id)}/reading${again ? '?again=1' : ''}`, { method: 'POST' }),
  stopReading: (id: string) => request<{ stopped: boolean }>(`/api/castings/${encodeURIComponent(id)}/reading`, { method: 'DELETE' }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/castings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  eventsUrl: (id: string) => `/api/castings/${encodeURIComponent(id)}/events`,

  // Questions asked under a reading, answered on the server the same way.
  followUps: (castingId: string) => request<FollowUp[]>(`/api/castings/${encodeURIComponent(castingId)}/followups`),
  ask: (castingId: string, question: string) => request<FollowUp>(`/api/castings/${encodeURIComponent(castingId)}/followups`, jsonInit('POST', { question })),
  followUp: (id: string) => request<FollowUp>(`/api/followups/${encodeURIComponent(id)}`),
  askAgain: (id: string) => request<FollowUp>(`/api/followups/${encodeURIComponent(id)}/answer`, { method: 'POST' }),
  stopAnswer: (id: string) => request<{ stopped: boolean }>(`/api/followups/${encodeURIComponent(id)}/answer`, { method: 'DELETE' }),
  removeFollowUp: (id: string) => request<{ ok: boolean }>(`/api/followups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  followUpEventsUrl: (id: string) => `/api/followups/${encodeURIComponent(id)}/events`,

  // The memory pool shared with lm-chat.
  memories: () => request<Memory[]>('/api/memories'),
  remember: (text: string) => request<Memory>('/api/memories', jsonInit('POST', { text })),
  updateMemory: (id: string, text: string) => request<Memory>(`/api/memories/${encodeURIComponent(id)}`, jsonInit('PATCH', { text })),
  forget: (id: string) => request<{ ok: boolean }>(`/api/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
