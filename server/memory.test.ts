// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { MAX_MEMORIES, Memories, MemoryInputError } from './memory.ts'

let dir: string
let file: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orrery-mem-')); file = path.join(dir, 'memory.sqlite') })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('the shared pool', () => {
  it('reads as empty until something is saved, then makes the file with the MCP server\'s schema and a private mode', () => {
    const m = new Memories(file)
    expect(m.list()).toEqual([])
    expect(fs.existsSync(file)).toBe(false)
    const { memory, duplicate } = m.remember('  The user is moving   house on 2026-10-20. ')
    expect(duplicate).toBe(false)
    expect(memory.text).toBe('The user is moving house on 2026-10-20.')
    expect(memory.id).toMatch(/^[0-9a-f]{8}$/)
    expect(fs.statSync(file).mode & 0o077).toBe(0)
    const db = new DatabaseSync(file, { readOnly: true })
    const cols = (db.prepare('PRAGMA table_info(memories)').all() as { name: string }[]).map((c) => c.name)
    db.close()
    expect(cols).toEqual(['id', 'text', 'created_at', 'updated_at'])
  })

  it('hands back the one already there instead of saving the same fact in other case or spacing', () => {
    const m = new Memories(file)
    const first = m.remember('Favorite color is green.')
    const again = m.remember('favorite  color is green')
    expect(again.duplicate).toBe(true)
    expect(again.memory.id).toBe(first.memory.id)
    expect(m.list()).toHaveLength(1)
  })

  it('refuses empty and oversized text, and a pool that is full', () => {
    const m = new Memories(file)
    expect(() => m.remember('   ')).toThrow(MemoryInputError)
    expect(() => m.remember('x'.repeat(1001))).toThrow(/at most/)
    for (let i = 0; i < MAX_MEMORIES; i++) m.remember(`fact number ${i}`)
    expect(() => m.remember('one too many')).toThrow(/full/)
  })

  it('updates and forgets by id, stamping an update strictly after everything saved', () => {
    const m = new Memories(file)
    const a = m.remember('first').memory
    const b = m.remember('second').memory
    expect(b.updatedAt).toBeGreaterThan(a.updatedAt)
    const updated = m.update(a.id, 'first, corrected')!
    expect(updated.text).toBe('first, corrected')
    expect(updated.updatedAt).toBeGreaterThan(b.updatedAt)
    expect(m.list().map((x) => x.id)).toEqual([a.id, b.id])
    expect(m.update('nope', 'x')).toBeNull()
    expect(m.forget(b.id)).toBe(true)
    expect(m.forget(b.id)).toBe(false)
    expect(m.get(a.id)?.text).toBe('first, corrected')
  })

  it('gives the newest memories that fit the budget, as lines for the prompt', () => {
    const m = new Memories(file)
    m.remember('The user works nights.')
    m.remember('x'.repeat(60))
    m.remember('The user has a sister in Lisbon.')
    const { lines, used } = m.context(70)
    expect(lines).toEqual(['- The user has a sister in Lisbon.', '- The user works nights.'])
    expect(used.map((u) => u.text)).toEqual(['The user has a sister in Lisbon.', 'The user works nights.'])
    expect(m.context().lines).toHaveLength(3)
  })
})
