import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Casting, CastingSummary, Config, FollowUp, Kind, Profile, ReadingState } from '../src/types.ts'

export interface ServerConfig extends Omit<Config, 'hasToken'> {
  apiToken: string
}

// Reasoning off: a reasoning model given a year of data thinks for minutes
// before its first word, and the page shows nothing meanwhile. Settings can
// turn it back on.
const DEFAULT_CONFIG: ServerConfig = { lmStudioUrl: 'http://127.0.0.1:1234', apiToken: '', model: '', reasoning: 'off' }

/** The first chart the app opens with, until Settings says otherwise. */
const DEFAULT_PROFILE: Profile = { name: 'Sam', dateTime: '1990-06-15 14:30', city: 'New York', state: 'CA', country: 'USA' }

/** The chat app's database, whose LM Studio settings seed ours on first run so there is nothing to type twice. */
const LM_CHAT_DB = path.join(os.homedir(), 'Code', 'mobile-ai-chat', 'lm-chat', '.data', 'lm-chat.sqlite')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lm_studio_url TEXT NOT NULL,
  api_token TEXT NOT NULL,
  model TEXT NOT NULL,
  reasoning TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  date_time TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS castings (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  period TEXT NOT NULL,
  title TEXT NOT NULL,
  result TEXT NOT NULL,
  reading TEXT NOT NULL DEFAULT '',
  reading_state TEXT NOT NULL DEFAULT 'none',
  reading_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS castings_period ON castings (kind, period);
CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  casting_id TEXT NOT NULL REFERENCES castings (id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'none',
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS follow_ups_casting ON follow_ups (casting_id, created_at);
`

interface CastingRow {
  id: string; kind: string; period: string; title: string; result: string; reading: string
  reading_state: string; reading_error: string | null; created_at: number
}

const fromRow = (r: CastingRow): Casting => ({
  id: r.id, kind: r.kind as Kind, period: r.period, title: r.title, result: r.result, reading: r.reading,
  readingState: r.reading_state as ReadingState, readingError: r.reading_error, createdAt: r.created_at,
})

interface FollowUpRow {
  id: string; casting_id: string; question: string; answer: string; state: string; error: string | null; created_at: number
}

const followUpFromRow = (r: FollowUpRow): FollowUp => ({
  id: r.id, castingId: r.casting_id, question: r.question, answer: r.answer,
  state: r.state as ReadingState, error: r.error, createdAt: r.created_at,
})

export const newId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export class Store {
  private db: DatabaseSync

  constructor(dataDir = path.resolve('.data'), seedFrom = LM_CHAT_DB) {
    fs.mkdirSync(dataDir, { recursive: true })
    this.db = new DatabaseSync(path.join(dataDir, 'orrery.sqlite'))
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec(SCHEMA)
    this.seed(seedFrom)
  }

  private seed(seedFrom: string): void {
    if (!this.db.prepare('SELECT 1 FROM profile WHERE id = 1').get()) {
      const p = DEFAULT_PROFILE
      this.db.prepare('INSERT INTO profile (id, name, date_time, city, state, country) VALUES (1, ?, ?, ?, ?, ?)')
        .run(p.name, p.dateTime, p.city, p.state, p.country)
    }
    if (this.db.prepare('SELECT 1 FROM config WHERE id = 1').get()) return
    const c = { ...DEFAULT_CONFIG, ...seedConfig(seedFrom) }
    this.db.prepare('INSERT INTO config (id, lm_studio_url, api_token, model, reasoning) VALUES (1, ?, ?, ?, ?)')
      .run(c.lmStudioUrl, c.apiToken, c.model, c.reasoning)
  }

  getConfig(): ServerConfig {
    const r = this.db.prepare('SELECT * FROM config WHERE id = 1').get() as Record<string, string>
    return { lmStudioUrl: r.lm_studio_url!, apiToken: r.api_token!, model: r.model!, reasoning: r.reasoning! }
  }

  getPublicConfig(): Config {
    const { apiToken, ...rest } = this.getConfig()
    return { ...rest, hasToken: apiToken.length > 0 }
  }

  setConfig(patch: Partial<ServerConfig>): Config {
    const next = { ...this.getConfig(), ...patch }
    this.db.prepare('UPDATE config SET lm_studio_url = ?, api_token = ?, model = ?, reasoning = ? WHERE id = 1')
      .run(next.lmStudioUrl, next.apiToken, next.model, next.reasoning)
    return this.getPublicConfig()
  }

  getProfile(): Profile {
    const r = this.db.prepare('SELECT * FROM profile WHERE id = 1').get() as Record<string, string>
    return { name: r.name!, dateTime: r.date_time!, city: r.city!, state: r.state!, country: r.country! }
  }

  setProfile(patch: Partial<Profile>): Profile {
    const next = { ...this.getProfile(), ...patch }
    this.db.prepare('UPDATE profile SET name = ?, date_time = ?, city = ?, state = ?, country = ? WHERE id = 1')
      .run(next.name, next.dateTime, next.city, next.state, next.country)
    return next
  }

  listCastings(limit = 40): CastingSummary[] {
    const rows = this.db.prepare(
      'SELECT id, kind, period, title, reading_state, reading_error, created_at FROM castings ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as Omit<CastingRow, 'result' | 'reading'>[]
    return rows.map((r) => ({
      id: r.id, kind: r.kind as Kind, period: r.period, title: r.title,
      readingState: r.reading_state as ReadingState, readingError: r.reading_error, createdAt: r.created_at,
    }))
  }

  getCasting(id: string): Casting | undefined {
    const r = this.db.prepare('SELECT * FROM castings WHERE id = ?').get(id) as CastingRow | undefined
    return r ? fromRow(r) : undefined
  }

  /** The newest casting of a kind for a period, if one was kept. */
  findCasting(kind: Kind, period: string): Casting | undefined {
    const r = this.db.prepare('SELECT * FROM castings WHERE kind = ? AND period = ? ORDER BY created_at DESC LIMIT 1')
      .get(kind, period) as CastingRow | undefined
    return r ? fromRow(r) : undefined
  }

  addCasting(input: Pick<Casting, 'kind' | 'period' | 'title' | 'result'>): Casting {
    const casting: Casting = {
      id: newId(), ...input, reading: '', readingState: 'none', readingError: null, createdAt: Date.now(),
    }
    this.db.prepare('INSERT INTO castings (id, kind, period, title, result, reading, reading_state, reading_error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(casting.id, casting.kind, casting.period, casting.title, casting.result, '', 'none', null, casting.createdAt)
    return casting
  }

  setReading(id: string, reading: string, state: ReadingState, error: string | null = null): void {
    this.db.prepare('UPDATE castings SET reading = ?, reading_state = ?, reading_error = ? WHERE id = ?').run(reading, state, error, id)
  }

  removeCasting(id: string): boolean {
    return this.db.prepare('DELETE FROM castings WHERE id = ?').run(id).changes > 0
  }

  // --- follow-up questions under a reading ------------------------------

  listFollowUps(castingId: string): FollowUp[] {
    const rows = this.db.prepare('SELECT * FROM follow_ups WHERE casting_id = ? ORDER BY created_at, rowid').all(castingId) as unknown as FollowUpRow[]
    return rows.map(followUpFromRow)
  }

  getFollowUp(id: string): FollowUp | undefined {
    const r = this.db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(id) as FollowUpRow | undefined
    return r ? followUpFromRow(r) : undefined
  }

  addFollowUp(castingId: string, question: string): FollowUp {
    const f: FollowUp = { id: newId(), castingId, question, answer: '', state: 'none', error: null, createdAt: Date.now() }
    this.db.prepare('INSERT INTO follow_ups (id, casting_id, question, answer, state, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(f.id, f.castingId, f.question, '', 'none', null, f.createdAt)
    return f
  }

  setAnswer(id: string, answer: string, state: ReadingState, error: string | null = null): void {
    this.db.prepare('UPDATE follow_ups SET answer = ?, state = ?, error = ? WHERE id = ?').run(answer, state, error, id)
  }

  removeFollowUp(id: string): boolean {
    return this.db.prepare('DELETE FROM follow_ups WHERE id = ?').run(id).changes > 0
  }

  /** A reading or answer left 'writing' by a server that stopped mid-sentence is failed, not forever pending. */
  settleInterrupted(): number {
    const why = 'The server restarted while this was being written.'
    const readings = this.db.prepare("UPDATE castings SET reading_state = 'failed', reading_error = ? WHERE reading_state = 'writing'").run(why).changes
    const answers = this.db.prepare("UPDATE follow_ups SET state = 'failed', error = ? WHERE state = 'writing'").run(why).changes
    return Number(readings) + Number(answers)
  }

  close(): void { this.db.close() }
}

/** The chat app's LM Studio address, token and model, when its database is here to read. */
export function seedConfig(file: string): Partial<ServerConfig> {
  if (!fs.existsSync(file)) return {}
  try {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const r = db.prepare('SELECT lm_studio_url, api_token, model FROM config WHERE id = 1').get() as Record<string, string> | undefined
      if (!r) return {}
      const out: Partial<ServerConfig> = {}
      if (r.lm_studio_url) out.lmStudioUrl = r.lm_studio_url
      if (r.api_token) out.apiToken = r.api_token
      if (r.model) out.model = r.model
      return out
    } finally { db.close() }
  } catch { return {} }
}
