import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { Memory } from '../src/types.ts'

/**
 * The memory pool shared with lm-chat and LM Studio's memory tools
 * (~/Code/lm-memory-mcp owns the schema; this is the same table). lm-chat's
 * model saves facts through tools; Orrery's model has none, so the server
 * saves what a question reveals (server/remember.ts) and reads the pool into
 * the reading when a casting has memory on. One file, so what is learned in
 * a chat shapes a reading and the other way round.
 */

export const MAX_TEXT = 1000
export const MAX_MEMORIES = 500

export class MemoryInputError extends Error {}

export const memoryPath = (): string => process.env.MEMORY_DB || path.join(os.homedir(), '.lm-memory', 'memory.sqlite')

/** For spotting the same memory worded with different case, spacing or a trailing period. */
const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '')

interface Row { id: string; text: string; created_at: number; updated_at: number }
const fromRow = (r: Row): Memory => ({ id: r.id, text: r.text, createdAt: r.created_at, updatedAt: r.updated_at })

function clean(text: unknown): string {
  const t = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  if (!t) throw new MemoryInputError('A memory needs some text.')
  if (t.length > MAX_TEXT) throw new MemoryInputError(`A memory can be at most ${MAX_TEXT} characters.`)
  return t
}

export class Memories {
  constructor(private readonly file: string = memoryPath()) {}

  /**
   * Opened per call, not held: the MCP server and lm-chat write the same
   * file from their own processes, and a short-lived connection never sits
   * on a lock. Reading never creates the file; saving does, with the
   * server's own schema and a private mode.
   */
  private use<T>(fallback: T, fn: (db: DatabaseSync) => T, create = false): T {
    if (!fs.existsSync(this.file)) {
      if (!create) return fallback
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 })
    }
    const db = new DatabaseSync(this.file)
    try {
      db.exec('PRAGMA busy_timeout = 2000')
      if (create) {
        db.exec('CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)')
        try { fs.chmodSync(this.file, 0o600) } catch { /* not ours to change */ }
      }
      return fn(db)
    } catch (err) {
      if (/no such table/.test((err as Error).message)) return fallback
      throw err
    } finally {
      db.close()
    }
  }

  /** Newest first, matching what the model sees. */
  list(): Memory[] {
    return this.use([], (db) => (db.prepare('SELECT * FROM memories ORDER BY updated_at DESC, rowid DESC').all() as unknown as Row[]).map(fromRow))
  }

  get(id: string): Memory | undefined {
    return this.use(undefined, (db) => {
      const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as unknown as Row | undefined
      return row ? fromRow(row) : undefined
    })
  }

  /** Strictly after anything saved so far, like the MCP server's own writes. */
  private static stamp(db: DatabaseSync): number {
    const latest = (db.prepare('SELECT MAX(updated_at) AS t FROM memories').get() as { t: number | null }).t ?? 0
    return Math.max(Date.now(), latest + 1)
  }

  /** Save a fact, or hand back the one already there in other case and spacing. */
  remember(text: unknown): { memory: Memory; duplicate: boolean } {
    const t = clean(text)
    return this.use(null as never, (db) => {
      const all = (db.prepare('SELECT * FROM memories ORDER BY updated_at DESC, rowid DESC').all() as unknown as Row[]).map(fromRow)
      const same = all.find((m) => normalize(m.text) === normalize(t))
      if (same) return { memory: same, duplicate: true }
      if (all.length >= MAX_MEMORIES) throw new MemoryInputError(`Memory is full (${MAX_MEMORIES}). Forget something outdated first.`)
      let id: string
      do id = randomBytes(4).toString('hex'); while (all.some((m) => m.id === id))
      const now = Memories.stamp(db)
      db.prepare('INSERT INTO memories (id, text, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, t, now, now)
      return { memory: { id, text: t, createdAt: now, updatedAt: now }, duplicate: false }
    }, true)
  }

  /** null when there's no such memory. */
  update(id: string, text: unknown): Memory | null {
    const t = clean(text)
    return this.use(null, (db) => {
      const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as unknown as Row | undefined
      if (!row) return null
      const now = Memories.stamp(db)
      db.prepare('UPDATE memories SET text = ?, updated_at = ? WHERE id = ?').run(t, now, id)
      return { ...fromRow(row), text: t, updatedAt: now }
    })
  }

  forget(id: string): boolean {
    return this.use(false, (db) => db.prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0)
  }

  /**
   * The memories that fit `budget` characters, newest first, with the lines
   * the model is given. Framed as information about the person, not
   * instructions: a memory can echo something a model read on the web.
   */
  context(budget = 4000): { lines: string[]; used: Memory[] } {
    const lines: string[] = []
    const used: Memory[] = []
    let chars = 0
    for (const m of this.list()) {
      const line = `- ${m.text}`
      if (chars + line.length > budget) continue
      lines.push(line)
      used.push(m)
      chars += line.length + 1
    }
    return { lines, used }
  }
}
