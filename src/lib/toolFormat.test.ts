import { describe, expect, it } from 'vitest'
import { trailSummary } from './toolFormat.ts'
import type { Step } from '../types.ts'

describe('trailSummary', () => {
  it('names what was looked at, each once, in order, without the verb', () => {
    const trail: Step[] = [
      { kind: 'reasoning', text: 'hm', done: true },
      { kind: 'tool', name: 'create_natal_chart', ok: true },
      { kind: 'tool', name: 'create_transit_chart', ok: true },
      { kind: 'tool', name: 'create_natal_chart', ok: true },
      { kind: 'tool', name: 'draw_cards', ok: true },
    ]
    expect(trailSummary(trail)).toBe('Looked at natal chart, transit chart, draw cards')
  })

  it('says when a call failed', () => {
    expect(trailSummary([{ kind: 'tool', name: 'forecast_week', ok: false }])).toBe('Looked at forecast week (one failed)')
  })
})
