import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Brief, Casting, CastingSummary, Config, FollowUp, Kind, Profile, ReadingState, Remembered, ReplyStats, Step, ToolUse, Written } from '../src/types.ts'
import { NOT_WRITTEN } from '../src/types.ts'

export interface ServerConfig extends Omit<Config, 'hasToken'> {
  apiToken: string
}

// Reasoning low: the model thinks a little before a reading, which the token
// caps in prompt.ts leave room for; 'off' in Settings is faster. Memory off
// until asked for: a reading then draws on nothing but the chart.
const DEFAULT_CONFIG: ServerConfig = { lmStudioUrl: 'http://127.0.0.1:1234', apiToken: '', model: '', reasoning: 'low', memoryDefault: 'off' }

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
  created_at INTEGER NOT NULL,
  updated_at INTEGER
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

/** The columns a reading or answer's trail, numbers and timing are kept in. */
interface WrittenRow {
  trail: string | null; stats: string | null; started_at: number | null; finished_at: number | null
}

interface CastingRow extends WrittenRow {
  id: string; kind: string; period: string; title: string; result: string; reading: string
  reading_state: string; reading_error: string | null; created_at: number; updated_at: number | null
  memory: number | null; memories_used: string | null; memory_excluded: string | null
  transit_readings: string | null
  style: string | null; note: string | null; brief: string | null
}

const parseIds = (text: string | null): string[] => {
  if (!text) return []
  try { const v = JSON.parse(text) as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [] } catch { return [] }
}

/** A transit wheel's readings by aspect key, as kept; null when not written yet. */
const parseReadingMap = (text: string | null): Record<string, string> | null => {
  if (!text) return null
  try {
    const v = JSON.parse(text) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
  } catch { return null }
}

const parseBrief = (text: string | null): Brief | null => {
  if (!text) return null
  try {
    const v = JSON.parse(text) as Brief
    return v && typeof v === 'object' && typeof v.system === 'string' && typeof v.task === 'string' ? v : null
  } catch { return null }
}

const parseTrail = (text: string | null): Step[] | null => {
  if (!text) return null
  try {
    const v = JSON.parse(text) as unknown
    return Array.isArray(v) ? v.filter((x): x is Step => !!x && typeof x === 'object' && ((x as Step).kind === 'reasoning' || (x as Step).kind === 'tool')) : []
  } catch { return [] }
}

const parseStats = (text: string | null): ReplyStats | null => {
  if (!text) return null
  try {
    const v = JSON.parse(text) as ReplyStats | null
    return v && typeof v === 'object' && typeof v.tokensPerSecond === 'number' ? v : null
  } catch { return null }
}

/** How a row's text was written. An answer kept before trails were, with its tools in their own column, gets a trail of those. */
const parseWritten = (r: WrittenRow & { tools?: string | null }): Written => ({
  trail: parseTrail(r.trail) ?? parseTools(r.tools ?? null).map((t) => ({ kind: 'tool' as const, ...t })),
  stats: parseStats(r.stats), startedAt: r.started_at, finishedAt: r.finished_at,
})

const fromRow = (r: CastingRow): Casting => ({
  id: r.id, kind: r.kind as Kind, period: r.period, title: r.title, result: r.result, reading: r.reading,
  readingState: r.reading_state as ReadingState, readingError: r.reading_error, createdAt: r.created_at, updatedAt: r.updated_at ?? r.created_at,
  memory: r.memory == null ? null : r.memory === 1, memoriesUsed: parseIds(r.memories_used), memoryExcluded: parseIds(r.memory_excluded),
  written: parseWritten(r), transitReadings: parseReadingMap(r.transit_readings),
  style: r.style, note: r.note ?? '', brief: parseBrief(r.brief),
})

interface FollowUpRow extends WrittenRow {
  id: string; casting_id: string; question: string; answer: string; state: string; error: string | null; created_at: number
  remembered: string | null; memories_used: string | null; tools: string | null
}

const parseTools = (text: string | null): ToolUse[] => {
  if (!text) return []
  try {
    const v = JSON.parse(text) as unknown
    return Array.isArray(v) ? v.filter((x): x is ToolUse => !!x && typeof x === 'object' && typeof (x as ToolUse).name === 'string') : []
  } catch { return [] }
}

const parseRemembered = (text: string | null): Remembered[] | null => {
  if (text == null) return null
  try {
    const v = JSON.parse(text) as unknown
    return Array.isArray(v) ? v.filter((x): x is Remembered => !!x && typeof x === 'object' && typeof (x as Remembered).id === 'string' && typeof (x as Remembered).text === 'string') : []
  } catch { return [] }
}

const followUpFromRow = (r: FollowUpRow): FollowUp => ({
  id: r.id, castingId: r.casting_id, question: r.question, answer: r.answer,
  state: r.state as ReadingState, error: r.error, createdAt: r.created_at, remembered: parseRemembered(r.remembered),
  memoriesUsed: parseIds(r.memories_used), written: parseWritten(r),
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
    this.migrate()
    this.seed(seedFrom)
  }

  /** Columns added since the first release, for a database made before them. */
  private migrate(): void {
    const has = (table: string, column: string): boolean =>
      (this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column)
    if (!has('config', 'memory_default')) this.db.exec("ALTER TABLE config ADD COLUMN memory_default TEXT NOT NULL DEFAULT 'off'")
    if (!has('castings', 'memory')) this.db.exec('ALTER TABLE castings ADD COLUMN memory INTEGER')
    if (!has('castings', 'memories_used')) this.db.exec('ALTER TABLE castings ADD COLUMN memories_used TEXT')
    if (!has('follow_ups', 'remembered')) this.db.exec('ALTER TABLE follow_ups ADD COLUMN remembered TEXT')
    if (!has('castings', 'memory_excluded')) this.db.exec('ALTER TABLE castings ADD COLUMN memory_excluded TEXT')
    if (!has('follow_ups', 'memories_used')) this.db.exec('ALTER TABLE follow_ups ADD COLUMN memories_used TEXT')
    if (!has('follow_ups', 'tools')) this.db.exec('ALTER TABLE follow_ups ADD COLUMN tools TEXT')
    for (const table of ['castings', 'follow_ups']) {
      if (!has(table, 'trail')) this.db.exec(`ALTER TABLE ${table} ADD COLUMN trail TEXT`)
      if (!has(table, 'stats')) this.db.exec(`ALTER TABLE ${table} ADD COLUMN stats TEXT`)
      if (!has(table, 'started_at')) this.db.exec(`ALTER TABLE ${table} ADD COLUMN started_at INTEGER`)
      if (!has(table, 'finished_at')) this.db.exec(`ALTER TABLE ${table} ADD COLUMN finished_at INTEGER`)
    }
    if (!has('castings', 'updated_at')) this.db.exec('ALTER TABLE castings ADD COLUMN updated_at INTEGER')
    if (!has('castings', 'transit_readings')) this.db.exec('ALTER TABLE castings ADD COLUMN transit_readings TEXT')
    if (!has('castings', 'style')) this.db.exec('ALTER TABLE castings ADD COLUMN style TEXT')
    if (!has('castings', 'note')) this.db.exec('ALTER TABLE castings ADD COLUMN note TEXT')
    if (!has('castings', 'brief')) this.db.exec('ALTER TABLE castings ADD COLUMN brief TEXT')
    this.db.exec('CREATE INDEX IF NOT EXISTS castings_updated ON castings (updated_at)')
    // A casting from before this was kept: its last change is its reading's or its latest question's.
    this.db.exec(`UPDATE castings SET updated_at = MAX(
      COALESCE(finished_at, started_at, created_at),
      COALESCE((SELECT MAX(COALESCE(f.finished_at, f.started_at, f.created_at)) FROM follow_ups f WHERE f.casting_id = castings.id), 0)
    ) WHERE updated_at IS NULL`)
  }

  private seed(seedFrom: string): void {
    if (!this.db.prepare('SELECT 1 FROM profile WHERE id = 1').get()) {
      const p = DEFAULT_PROFILE
      this.db.prepare('INSERT INTO profile (id, name, date_time, city, state, country) VALUES (1, ?, ?, ?, ?, ?)')
        .run(p.name, p.dateTime, p.city, p.state, p.country)
    }
    if (this.db.prepare('SELECT 1 FROM config WHERE id = 1').get()) return
    const c = { ...DEFAULT_CONFIG, ...seedConfig(seedFrom) }
    this.db.prepare('INSERT INTO config (id, lm_studio_url, api_token, model, reasoning, memory_default) VALUES (1, ?, ?, ?, ?, ?)')
      .run(c.lmStudioUrl, c.apiToken, c.model, c.reasoning, c.memoryDefault)
  }

  getConfig(): ServerConfig {
    const r = this.db.prepare('SELECT * FROM config WHERE id = 1').get() as Record<string, string>
    return { lmStudioUrl: r.lm_studio_url!, apiToken: r.api_token!, model: r.model!, reasoning: r.reasoning!, memoryDefault: r.memory_default === 'on' ? 'on' : 'off' }
  }

  getPublicConfig(): Config {
    const { apiToken, ...rest } = this.getConfig()
    return { ...rest, hasToken: apiToken.length > 0 }
  }

  setConfig(patch: Partial<ServerConfig>): Config {
    const next = { ...this.getConfig(), ...patch }
    this.db.prepare('UPDATE config SET lm_studio_url = ?, api_token = ?, model = ?, reasoning = ?, memory_default = ? WHERE id = 1')
      .run(next.lmStudioUrl, next.apiToken, next.model, next.reasoning, next.memoryDefault)
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

  /** The castings, the most recently changed first: a reading written or a question asked moves one up. */
  listCastings(limit = 60): CastingSummary[] {
    const rows = this.db.prepare(
      `SELECT id, kind, period, title, reading_state, reading_error, created_at, updated_at, memory, memories_used, memory_excluded, stats, started_at, finished_at, style, note,
        (SELECT COUNT(*) FROM follow_ups f WHERE f.casting_id = castings.id) AS questions
      FROM castings ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC LIMIT ?`,
    ).all(limit) as unknown as (Omit<CastingRow, 'result' | 'reading' | 'trail' | 'transit_readings' | 'brief'> & { questions: number })[]
    return rows.map((r) => ({
      id: r.id, kind: r.kind as Kind, period: r.period, title: r.title,
      readingState: r.reading_state as ReadingState, readingError: r.reading_error, createdAt: r.created_at, updatedAt: r.updated_at ?? r.created_at,
      memory: r.memory == null ? null : r.memory === 1, memoriesUsed: parseIds(r.memories_used), memoryExcluded: parseIds(r.memory_excluded),
      written: parseWritten({ ...r, trail: null }), questions: Number(r.questions), style: r.style, note: r.note ?? '',
    }))
  }

  getCasting(id: string): Casting | undefined {
    const r = this.db.prepare('SELECT * FROM castings WHERE id = ?').get(id) as CastingRow | undefined
    return r ? fromRow(r) : undefined
  }

  /** A casting, with the choices made before it was cast: memory (null follows Settings) and the memories left out, the kind of reading, and what it is for. */
  addCasting(input: Pick<Casting, 'kind' | 'period' | 'title' | 'result'> & Partial<Pick<Casting, 'memory' | 'memoryExcluded' | 'style' | 'note'>>): Casting {
    const now = Date.now()
    const casting: Casting = {
      memory: null, memoryExcluded: [], style: null, note: '', ...input,
      id: newId(), reading: '', readingState: 'none', readingError: null, createdAt: now, updatedAt: now, memoriesUsed: [],
      written: { ...NOT_WRITTEN }, transitReadings: null, brief: null,
    }
    this.db.prepare('INSERT INTO castings (id, kind, period, title, result, reading, reading_state, reading_error, created_at, updated_at, memory, memory_excluded, style, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(casting.id, casting.kind, casting.period, casting.title, casting.result, '', 'none', null, now, now, casting.memory == null ? null : casting.memory ? 1 : 0, JSON.stringify(casting.memoryExcluded), casting.style, casting.note)
    return casting
  }

  /** The kind of reading and what it is for, changed before a Write again. */
  setFrame(id: string, frame: Partial<Pick<Casting, 'style' | 'note'>>): Casting | undefined {
    const cur = this.getCasting(id)
    if (!cur) return undefined
    this.db.prepare('UPDATE castings SET style = ?, note = ? WHERE id = ?').run(frame.style === undefined ? cur.style : frame.style, frame.note === undefined ? cur.note : frame.note, id)
    return this.getCasting(id)
  }

  /** Something under the casting changed: it is the most recent one now. */
  private touch(id: string, at = Date.now()): void {
    this.db.prepare('UPDATE castings SET updated_at = ? WHERE id = ?').run(at, id)
  }

  /** The casting a question belongs to changed with it. */
  private touchFor(followUpId: string, at = Date.now()): void {
    this.db.prepare('UPDATE castings SET updated_at = ? WHERE id = (SELECT casting_id FROM follow_ups WHERE id = ?)').run(at, followUpId)
  }

  /** The reading is being written from now, with this brief: nothing on the page, nothing on the trail. */
  beginReading(id: string, brief: Brief | null = null): void {
    const now = Date.now()
    this.db.prepare("UPDATE castings SET reading = '', reading_state = 'writing', reading_error = NULL, trail = '[]', stats = NULL, started_at = ?, finished_at = NULL, updated_at = ?, brief = COALESCE(?, brief) WHERE id = ?")
      .run(now, now, brief ? JSON.stringify(brief) : null, id)
  }

  /** The model's trail for the reading so far. */
  setReadingTrail(id: string, trail: Step[]): void {
    this.db.prepare('UPDATE castings SET trail = ? WHERE id = ?').run(JSON.stringify(trail), id)
  }

  /** The reading is written, or failed: the text, the whole trail, LM Studio's numbers, and the time. */
  finishReading(id: string, reading: string, state: 'done' | 'failed', error: string | null, written: Pick<Written, 'trail' | 'stats'>): void {
    const now = Date.now()
    this.db.prepare('UPDATE castings SET reading = ?, reading_state = ?, reading_error = ?, trail = ?, stats = ?, finished_at = ?, updated_at = ? WHERE id = ?')
      .run(reading, state, error, JSON.stringify(written.trail), written.stats ? JSON.stringify(written.stats) : null, now, now, id)
  }

  /** The popup sentences for the wheel's transits, once the model has written them. Not a change of the person's: the casting keeps its place. */
  setTransitReadings(id: string, readings: Record<string, string>): void {
    this.db.prepare('UPDATE castings SET transit_readings = ? WHERE id = ?').run(JSON.stringify(readings), id)
  }

  /** The casting's own memory switch: on, off, or null to follow Settings. */
  setCastingMemory(id: string, memory: boolean | null): Casting | undefined {
    this.db.prepare('UPDATE castings SET memory = ? WHERE id = ?').run(memory == null ? null : memory ? 1 : 0, id)
    return this.getCasting(id)
  }

  /** Which memories the reading now being written draws on. */
  setMemoriesUsed(id: string, ids: string[]): void {
    this.db.prepare('UPDATE castings SET memories_used = ? WHERE id = ?').run(JSON.stringify(ids), id)
  }

  /** The memories this casting leaves out of its reading and answers, by id. */
  setMemoryExcluded(id: string, ids: string[]): Casting | undefined {
    this.db.prepare('UPDATE castings SET memory_excluded = ? WHERE id = ?').run(JSON.stringify(ids), id)
    return this.getCasting(id)
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

  addFollowUp(castingId: string, question: string, memoriesUsed: string[] = []): FollowUp {
    const f: FollowUp = { id: newId(), castingId, question, answer: '', state: 'none', error: null, createdAt: Date.now(), remembered: null, memoriesUsed, written: { ...NOT_WRITTEN } }
    this.db.prepare('INSERT INTO follow_ups (id, casting_id, question, answer, state, error, created_at, memories_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(f.id, f.castingId, f.question, '', 'none', null, f.createdAt, JSON.stringify(memoriesUsed))
    this.touch(castingId, f.createdAt)
    return f
  }

  /** Which memories the answer now being written draws on (asked again, it may differ). */
  setAnswerMemoriesUsed(id: string, ids: string[]): void {
    this.db.prepare('UPDATE follow_ups SET memories_used = ? WHERE id = ?').run(JSON.stringify(ids), id)
  }

  /** The answer is being written from now: nothing on the page, nothing on the trail. */
  beginAnswer(id: string): void {
    const now = Date.now()
    this.db.prepare("UPDATE follow_ups SET answer = '', state = 'writing', error = NULL, trail = '[]', stats = NULL, started_at = ?, finished_at = NULL WHERE id = ?")
      .run(now, id)
    this.touchFor(id, now)
  }

  /** The model's trail for the answer so far: its thinking and the tools it has called. */
  setAnswerTrail(id: string, trail: Step[]): void {
    this.db.prepare('UPDATE follow_ups SET trail = ? WHERE id = ?').run(JSON.stringify(trail), id)
  }

  /** The answer is written, or failed: the text, the whole trail, LM Studio's numbers, and the time. */
  finishAnswer(id: string, answer: string, state: 'done' | 'failed', error: string | null, written: Pick<Written, 'trail' | 'stats'>): void {
    const now = Date.now()
    this.db.prepare('UPDATE follow_ups SET answer = ?, state = ?, error = ?, trail = ?, stats = ?, finished_at = ? WHERE id = ?')
      .run(answer, state, error, JSON.stringify(written.trail), written.stats ? JSON.stringify(written.stats) : null, now, id)
    this.touchFor(id, now)
  }

  setRemembered(id: string, remembered: Remembered[]): void {
    this.db.prepare('UPDATE follow_ups SET remembered = ? WHERE id = ?').run(JSON.stringify(remembered), id)
  }

  removeFollowUp(id: string): boolean {
    this.touchFor(id)
    return this.db.prepare('DELETE FROM follow_ups WHERE id = ?').run(id).changes > 0
  }

  /** A reading or answer left 'writing' by a server that stopped mid-sentence is failed, not forever pending. */
  settleInterrupted(): number {
    const why = 'The server restarted while this was being written.'
    const now = Date.now()
    const readings = this.db.prepare("UPDATE castings SET reading_state = 'failed', reading_error = ?, finished_at = COALESCE(finished_at, ?) WHERE reading_state = 'writing'").run(why, now).changes
    const answers = this.db.prepare("UPDATE follow_ups SET state = 'failed', error = ?, finished_at = COALESCE(finished_at, ?) WHERE state = 'writing'").run(why, now).changes
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
