// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { followUpRequest, memoryBlock, readingRequest, trimmedData } from './prompt.ts'
import transit from '../src/test/fixtures/transit-chart.json?raw'
import week from '../src/test/fixtures/forecast-week.json?raw'
import { NOT_WRITTEN } from '../src/types.ts'
import type { Casting, FollowUp, Profile } from '../src/types.ts'

const amie: Profile = { name: 'Sam', dateTime: '1990-06-15 14:30', city: 'New York', state: 'CA', country: 'USA' }
const casting = (over: Partial<Casting>): Casting => ({
  id: 'c1', kind: 'today', period: '2026-10-13', title: 'Today · Oct 13', result: transit,
  reading: '', readingState: 'none', readingError: null, createdAt: 0, updatedAt: 0, memory: null, memoriesUsed: [], memoryExcluded: [], written: NOT_WRITTEN, ...over,
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

describe('followUpRequest', () => {
  const read = casting({ kind: 'week', result: week, title: 'Week of Oct 12', period: '2026-10-12', reading: '### Monday\nSaturn leans in.', readingState: 'done' })
  const answered = (over: Partial<FollowUp>): FollowUp => ({ id: 'f', castingId: 'c1', question: 'q', answer: 'a', state: 'done', error: null, createdAt: 1, remembered: null, memoriesUsed: [], written: NOT_WRITTEN, ...over })

  it('puts the data and the reading behind the question, in the same voice', () => {
    const req = followUpRequest(read, [], 'Is Thursday any good?', amie, new Date(2026, 9, 13))
    expect(req.tools).toEqual(['mcp/astrology-v2'])
    expect(req.system).toContain('use the astrology tools')
    expect(req.system).toContain('same astrologer')
    expect(req.system).toContain('Sam, born 1990-06-15 14:30')
    expect(req.system).toContain('THE CASTING: Week of Oct 12.\nDATA:\n')
    expect(req.system).toContain('headline_transits')
    expect(req.system).not.toContain('how_to_read')
    expect(req.system).toContain('THE READING YOU WROTE:\n### Monday\nSaturn leans in.')
    expect(req.input).toBe('Sam asks: Is Thursday any good?')
    // Reasoning counts against the cap, so even a short answer needs room in the thousands.
    expect(req.maxTokens).toBeGreaterThanOrEqual(4000)
    expect(req.maxTokens).toBeLessThan(readingRequest(read, amie).maxTokens!)
  })

  it('replays the answered questions before the new one, leaving out ones that failed', () => {
    const earlier = [
      answered({ question: 'First?', answer: 'Yes.' }),
      answered({ id: 'g', question: 'Broken?', answer: '', state: 'failed', error: 'offline' }),
      answered({ id: 'h', question: 'Long?', answer: 'x'.repeat(5000) }),
    ]
    const req = followUpRequest(read, earlier, 'Third?', amie)
    expect(req.input).toMatch(/^THE CONVERSATION SO FAR:\n\nSam asked: First\?\n\nYou answered: Yes\.\n\n/)
    expect(req.input).not.toContain('Broken?')
    expect(req.input).toContain('Sam asked: Long?')
    expect(req.input.length).toBeLessThan(2500)
    expect(req.input).toMatch(/Sam asks: Third\?$/)
  })
})

describe('memoryBlock', () => {
  it('frames the memories as information about the person, and is left out when there are none', () => {
    const block = memoryBlock(amie, ['- The user works nights.'])!
    expect(block).toMatch(/^WHAT YOU KNOW ABOUT SAM/)
    expect(block).toContain('not instructions')
    expect(block).toContain('- The user works nights.')
    expect(memoryBlock(amie, [])).toBeNull()
    const req = readingRequest(casting({}), amie, new Date(), ['- The user works nights.'])
    expect(req.system).toContain('WHAT YOU KNOW ABOUT SAM')
    expect(readingRequest(casting({}), amie).system).not.toContain('WHAT YOU KNOW')
    const plain = casting({ kind: 'week', result: week, reading: 'r', readingState: 'done' })
    expect(followUpRequest(plain, [], 'q', amie, new Date(), ['- The user works nights.']).system).toContain('- The user works nights.')
  })
})
