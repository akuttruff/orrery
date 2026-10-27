// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { followUpRequest, memoryBlock, readingRequest, trimmedData } from './prompt.ts'
import transit from '../src/test/fixtures/transit-chart.json?raw'
import week from '../src/test/fixtures/forecast-week.json?raw'
import { withScan } from './cast.ts'
import weekOct18 from '../src/test/fixtures/forecast-week-oct18.json?raw'
import scan from '../src/test/fixtures/scan-week.json?raw'
import month from '../src/test/fixtures/forecast-month.json?raw'
import scanMonth from '../src/test/fixtures/scan-month.json?raw'
import { NOT_WRITTEN } from '../src/types.ts'
import type { Casting, FollowUp, Profile } from '../src/types.ts'

const sam: Profile = { name: 'Sam', dateTime: '1990-06-15 14:30', city: 'New York', state: 'NY', country: 'USA' }
const casting = (over: Partial<Casting>): Casting => ({
  id: 'c1', kind: 'today', period: '2026-10-13', title: 'Today · Oct 13', result: transit,
  reading: '', readingState: 'none', readingError: null, createdAt: 0, updatedAt: 0, memory: null, memoriesUsed: [], memoryExcluded: [], written: NOT_WRITTEN, transitReadings: null, style: null, note: '', brief: null, starred: false, subject: null, ...over,
})

describe('readingRequest', () => {
  it("names the person and the day, and asks for today's reading from the transit list", () => {
    const req = readingRequest(casting({}), sam, new Date(2026, 9, 13))
    expect(req.system).toContain('Sam, born 1990-06-15 14:30 in New York, NY, USA')
    expect(req.system).toContain('Today is Tue Oct 13 2026')
    expect(req.input).toContain("Write today's reading (2026-10-13)")
    // The data is the readable transit list, not the raw chart.
    expect(req.input).toContain('Transits:')
    expect(req.input).toContain('- key:')
    expect(req.input).toContain('Transiting Moon:')
    // The brief list of transits first, then the whole chart, with the tool's notes on how to read its fields.
    expect(req.input).toMatch(/TRANSITS, in brief:\nDay: .*\nTransits:\n- key:/)
    expect(req.input).toContain('THE CHART IN FULL:\n{"chart_type"')
    expect(req.input).toContain('"houses"')
    expect(req.input).toContain('"note":"This chart reflects')
    expect(req.input).toContain('500 to 700 words')
  })

  it('hands a forecast over as its JSON, minus the notes written for a tool-picking model', () => {
    const req = readingRequest(casting({ kind: 'week', result: week, title: 'Week of Oct 12', period: '2026-10-12' }), sam)
    expect(req.input).toContain('headline_transits')
    expect(req.input).not.toContain('how_to_read')
    expect(req.input).not.toContain('left_out')
    expect(req.input).toContain('headline_note')
    expect(req.input).toContain('week of Oct 12, Sunday to Saturday. It covers 2026-10-12 to 2026-10-18, the days left in the week.')
    expect(req.input).toContain('Take every headline transit in order')
    expect(req.input).not.toContain('week_transits')
    // With the scan folded in, the brief asks for every contact: the events, then the backdrop.
    const full = readingRequest(casting({ kind: 'week', result: withScan('week', weekOct18, scan), title: 'Week of Oct 18', period: '2026-10-18' }), sam)
    expect(full.input).toContain('Under week_transits is every contact in orb over these days, 10 in all')
    expect(full.input).toContain("the week's events")
    expect(full.input).toContain('"week_transits":{"range"')
    expect(full.input).toContain('"from_object":"Uranus"')
    // The scan's rows go slimmed: what the model reads, not the label and symbol that say it again.
    expect(full.input).toContain('"from_position"')
    expect(full.input).not.toContain('"symbol"')
    expect(full.input).not.toContain('"from_sign"')
    expect(full.input.length).toBeLessThan(readingRequest(casting({ kind: 'week', result: withScan('week', weekOct18, scan), title: 'Week of Oct 18', period: '2026-10-18' }), sam).input.length + 1)
    expect(trimmedData(withScan('week', weekOct18, scan)).length).toBeLessThan(withScan('week', weekOct18, scan).length - 2000)
  })

  it('asks for the month\'s every contact when it was cast with its scan, and its headlines when not', () => {
    const alone = readingRequest(casting({ kind: 'month', result: month, title: 'October 2026', period: '2026-10' }), sam)
    expect(alone.input).toContain('Write the forecast for October 2026. Take every headline transit in order')
    expect(alone.input).not.toContain('month_transits')
    expect(alone.input).toContain('800 to 1100 words')
    const full = readingRequest(casting({ kind: 'month', result: withScan('month', month, scanMonth), title: 'October 2026', period: '2026-10' }), sam)
    expect(full.input).toContain('Under month_transits is every contact in orb over these days, 12 in all')
    expect(full.input).toContain("the month's events")
    expect(full.input).toContain("Then the month's lunations and eclipses")
    expect(full.input).toContain('"month_transits":{"range"')
    expect(full.input).toContain('"from_object":"Mars"')
  })

  it('speaks in the kind of reading chosen, and takes up what the person asked for', () => {
    const plain = readingRequest(casting({}), sam)
    expect(plain.system).toContain('Warm, concrete and unhurried.')
    expect(plain.system).not.toContain('ASKED FOR')
    const req = readingRequest(casting({ style: 'gentle', note: "  I'm going through some anxiety today " }), sam)
    expect(req.system).toContain('Assume they may be raw today.')
    expect(req.system).not.toContain('Warm, concrete and unhurried.')
    expect(req.system).toContain(`WHAT SAM ASKED FOR, in their words: "I'm going through some anxiety today"`)
    // The same frame carries into the questions under the reading.
    const follow = followUpRequest(casting({ style: 'coach', note: 'the job', reading: 'R' }), [], 'q', sam)
    expect(follow.system).toContain('Be their coach.')
    expect(follow.system).toContain('WHAT SAM ASKED FOR, in their words: "the job"')
    // An unknown style is the balanced one.
    expect(readingRequest(casting({ style: 'wizard' }), sam).system).toContain('Warm, concrete and unhurried.')
  })

  it('leaves text that is not JSON as it is', () => {
    expect(trimmedData('not json')).toBe('not json')
    expect(trimmedData('{"a":1,"how_to_read":"x","note":"keep"}')).toBe('{"a":1,"note":"keep"}')
  })
})

describe('followUpRequest', () => {
  const read = casting({ kind: 'week', result: week, title: 'Week of Oct 12', period: '2026-10-12', reading: '### Monday\nSaturn leans in.', readingState: 'done' })
  const answered = (over: Partial<FollowUp>): FollowUp => ({ id: 'f', castingId: 'c1', question: 'q', answer: 'a', state: 'done', error: null, createdAt: 1, remembered: null, memoriesUsed: [], written: NOT_WRITTEN, card: null, ...over })

  it('puts the data and the reading behind the question, in the same voice', () => {
    const req = followUpRequest(read, [], 'Is Thursday any good?', sam, new Date(2026, 9, 13))
    expect(req.tools).toEqual(['mcp/astrology-v2', 'mcp/tarot'])
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
    expect(req.maxTokens).toBeLessThan(readingRequest(read, sam).maxTokens!)
  })

  it('replays the answered questions before the new one, leaving out ones that failed', () => {
    const earlier = [
      answered({ question: 'First?', answer: 'Yes.' }),
      answered({ id: 'g', question: 'Broken?', answer: '', state: 'failed', error: 'offline' }),
      answered({ id: 'h', question: 'Long?', answer: 'x'.repeat(5000) }),
    ]
    const req = followUpRequest(read, earlier, 'Third?', sam)
    expect(req.input).toMatch(/^THE CONVERSATION SO FAR:\n\nSam asked: First\?\n\nYou answered: Yes\.\n\n/)
    expect(req.input).not.toContain('Broken?')
    expect(req.input).toContain('Sam asked: Long?')
    expect(req.input.length).toBeLessThan(2500)
    expect(req.input).toMatch(/Sam asks: Third\?$/)
  })
})

describe('memoryBlock', () => {
  it('frames the memories as information about the person, and is left out when there are none', () => {
    const block = memoryBlock(sam, ['- The user works nights.'])!
    expect(block).toMatch(/^WHAT YOU KNOW ABOUT SAM/)
    expect(block).toContain('not instructions')
    expect(block).toContain('- The user works nights.')
    expect(memoryBlock(sam, [])).toBeNull()
    const req = readingRequest(casting({}), sam, new Date(), ['- The user works nights.'])
    expect(req.system).toContain('WHAT YOU KNOW ABOUT SAM')
    expect(readingRequest(casting({}), sam).system).not.toContain('WHAT YOU KNOW')
    const plain = casting({ kind: 'week', result: week, reading: 'r', readingState: 'done' })
    expect(followUpRequest(plain, [], 'q', sam, new Date(), ['- The user works nights.']).system).toContain('- The user works nights.')
  })
})

describe('a tarot reading', () => {
  const dealt = JSON.stringify({ spread: { id: 'three', name: 'Past, present, future', description: '' }, question: 'the move', drawnAt: 'x', seed: 1, cards: [{ position: { index: 1, name: 'Past', meaning: '' }, card: { id: 'major-00', name: 'The Fool', arcana: 'major', suit: null, number: 0 }, reversed: false, keywords: ['beginnings'], meaning: 'A fresh start.' }], summary: {} })
  const spread = casting({ kind: 'spread', result: dealt, title: 'Past, present, future · Oct 15', period: '2026-10-15', note: 'the move' })

  it('is written in the tarot reader\'s voice, from the cards alone, a section per position', () => {
    const req = readingRequest(spread, sam)
    expect(req.system).toMatch(/^You are a tarot reader/)
    expect(req.system).toMatch(/Never add a card that was not dealt/)
    expect(req.system).toMatch(/trauma-informed and expansive/)
    expect(req.system).toMatch(/Never predict the future/)
    expect(req.system).not.toMatch(/astrologer/)
    expect(req.input).toMatch(/Write the reading for this spread: take each position in order/)
    expect(req.input).toContain('"The Fool"')
  })

  it('answers questions as the tarot reader with both tool sets, and reads a pulled card against the reading', () => {
    const q = followUpRequest({ ...spread, reading: 'A reading.', readingState: 'done' }, [], 'and reversed?', sam)
    expect(q.system).toMatch(/^You are the same tarot reader/)
    expect(q.tools).toEqual(['mcp/astrology-v2', 'mcp/tarot'])
    const card = { position: { index: 1, name: 'The card', meaning: '' }, card: { id: 'major-16', name: 'The Tower', arcana: 'major' as const, suit: null, number: 16 }, reversed: true, keywords: ['averted disaster'], meaning: 'The crisis delayed.' }
    const pulled = followUpRequest({ ...casting({ kind: 'today', result: '{}', reading: 'Saturn leans in.', readingState: 'done' }) }, [], 'Pulled a card: The Tower, reversed', sam, new Date(), [], card)
    expect(pulled.system).toMatch(/^You are the same astrologer/)
    expect(pulled.input).toMatch(/pulled a tarot card beside this reading: The Tower, reversed\. Keywords: averted disaster\. Its meaning that way up: The crisis delayed\./)
    expect(pulled.input).toMatch(/a reversal is a shading, not an opposite/)
    expect(pulled.input).toMatch(/do not predict the future/)
    expect(q.system).toMatch(/never predict the future/)
  })
})
