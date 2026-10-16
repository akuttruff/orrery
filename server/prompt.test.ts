// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readingRequest, trimmedData } from './prompt.ts'
import transit from '../src/test/fixtures/transit-chart.json?raw'
import week from '../src/test/fixtures/forecast-week.json?raw'
import type { Casting, Profile } from '../src/types.ts'

const amie: Profile = { name: 'Sam', dateTime: '1990-06-15 14:30', city: 'New York', state: 'CA', country: 'USA' }
const casting = (over: Partial<Casting>): Casting => ({
  id: 'c1', kind: 'today', period: '2026-10-13', title: 'Today · Oct 13', result: transit,
  reading: '', readingState: 'none', readingError: null, createdAt: 0, ...over,
})

describe('readingRequest', () => {
  it("names the person and the day, and asks for today's reading from the transit list", () => {
    const req = readingRequest(casting({}), amie, new Date(2026, 9, 13))
    expect(req.system).toContain('Sam, born 1990-06-15 14:30 in New York, CA, USA')
    expect(req.system).toContain('Today is Tue Oct 13 2026')
    expect(req.input).toContain("Write today's reading (2026-10-13)")
    // The data is the readable transit list, not the raw chart.
    expect(req.input).toContain('Transits:')
    expect(req.input).toContain('- key:')
    expect(req.input).toContain('Transiting Moon:')
    expect(req.input).not.toContain('"houses"')
  })

  it('hands a forecast over as its JSON, minus the notes written for a tool-picking model', () => {
    const req = readingRequest(casting({ kind: 'week', result: week, title: 'Week of Oct 12', period: '2026-10-12' }), amie)
    expect(req.input).toContain('headline_transits')
    expect(req.input).not.toContain('how_to_read')
    expect(req.input).not.toContain('headline_note')
    expect(req.input).toContain('week starting 2026-10-12')
  })

  it('leaves text that is not JSON as it is', () => {
    expect(trimmedData('not json')).toBe('not json')
    expect(trimmedData('{"a":1,"note":"x"}')).toBe('{"a":1}')
  })
})
