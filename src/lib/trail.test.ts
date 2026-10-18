import { describe, expect, it } from 'vitest'
import { appendThinking, pendingTools, thinking } from './trail.ts'
import type { Step } from '../types.ts'

describe('trail', () => {
  it('puts a piece of thinking on the open step, or opens one, without touching the old array', () => {
    const start: Step[] = [{ kind: 'tool', name: 'a', ok: true }]
    const one = appendThinking(start, 'Hm')
    expect(one).toEqual([{ kind: 'tool', name: 'a', ok: true }, { kind: 'reasoning', text: 'Hm', done: false }])
    expect(start).toHaveLength(1)
    const two = appendThinking(one, ', yes.')
    expect(two[1]).toEqual({ kind: 'reasoning', text: 'Hm, yes.', done: false })
    expect(one[1]).toEqual({ kind: 'reasoning', text: 'Hm', done: false })
    expect(thinking(two)).toBe(true)
    const closed: Step[] = [{ kind: 'reasoning', text: 'Done.', done: true, seconds: 1 }]
    expect(thinking(closed)).toBe(false)
    expect(appendThinking(closed, 'More')).toHaveLength(2)
  })

  it('lists the tool calls still out', () => {
    const trail: Step[] = [{ kind: 'reasoning', text: '', done: true }, { kind: 'tool', name: 'a', ok: true }, { kind: 'tool', name: 'b', ok: null }]
    expect(pendingTools(trail).map((t) => t.name)).toEqual(['b'])
  })
})
