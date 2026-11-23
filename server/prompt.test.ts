// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { OPEN_RULES, followUpRequest, openHistory, sentAt, memoryBlock, readingRequest, trimmedData } from './prompt.ts'
import transit from '../src/test/fixtures/transit-chart.json?raw'
import week from '../src/test/fixtures/forecast-week.json?raw'
import { withScan } from './cast.ts'
import weekOct18 from '../src/test/fixtures/forecast-week-oct18.json?raw'
import scan from '../src/test/fixtures/scan-week.json?raw'
import month from '../src/test/fixtures/forecast-month.json?raw'
import scanMonth from '../src/test/fixtures/scan-month.json?raw'
import { NOT_WRITTEN } from '../src/types.ts'
import { DEFAULT_SHAPE, type ReadingShape } from '../src/lib/shape.ts'
import natalChart from '../src/test/fixtures/natal-chart.json?raw'
import three from '../src/test/fixtures/tarot-three.json?raw'
import type { Casting, FollowUp, Profile } from '../src/types.ts'

const sam: Profile = { name: 'Sam', dateTime: '1990-06-15 14:30', city: 'New York', state: 'NY', country: 'USA' }
const casting = (over: Partial<Casting>): Casting => ({
  id: 'c1', kind: 'today', period: '2026-10-13', title: 'Today · Oct 13', result: transit,
  reading: '', readingState: 'none', readingError: null, createdAt: 0, updatedAt: 0, memory: null, memoriesUsed: [], memoryExcluded: [], written: NOT_WRITTEN, transitReadings: null, style: null, note: '', shape: null, brief: null, starred: false, subject: null, ...over,
})

describe('readingRequest', () => {
  it('segments every chart reading and reads the houses in depth; a birth chart gets its own voice and a full outline', () => {
    const today = readingRequest(casting({}), sam, new Date(2026, 9, 13))
    expect(today.system).toContain('a ## heading for each major section, a ### heading for each placement or contact')
    expect(today.system).toContain('**Where it lands**')
    expect(today.system).toContain("Houses are whole sign: the Ascendant's sign is the 1st house")
    expect(today.system).toContain('which planet rules it and where that ruler sits')
    expect(today.input).toContain('**At a Glance**')
    const natal = readingRequest(casting({ kind: 'natal', period: 'natal' }), sam, new Date(2026, 9, 13))
    expect(natal.system).toContain("reading of one person's birth chart")
    expect(natal.system).toContain('**The house**, the part of life it works in, read in depth')
    expect(natal.system).not.toContain('**Where it lands**')
    expect(natal.input).toContain('**The Houses**, a short ### section for each of the twelve houses in order')
    expect(natal.input).toContain('**Growth Direction**')
    expect(natal.input).toContain('Aim for about 2,500 words')
    expect(natal.input).toContain('adding to what The Planets already said rather than repeating it')
  })

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
    expect(req.input).toContain('Aim for about 1,000 words: enough to cover everything above properly, without repeating yourself.')
    expect(req.system).not.toContain('no length limit')
  })

  it('hands a forecast over as its JSON, minus the notes written for a tool-picking model', () => {
    const req = readingRequest(casting({ kind: 'week', result: week, title: 'Week of Oct 12', period: '2026-10-12' }), sam)
    expect(req.input).toContain('headline_transits')
    expect(req.input).not.toContain('how_to_read')
    expect(req.input).not.toContain('left_out')
    expect(req.input).toContain('headline_note')
    expect(req.input).toContain('week of Oct 12, Monday to Sunday. It covers 2026-10-12 to 2026-10-18, the days left in the week.')
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
    expect(alone.input).toContain('Aim for about 1,600 words')
    const full = readingRequest(casting({ kind: 'month', result: withScan('month', month, scanMonth), title: 'October 2026', period: '2026-10' }), sam)
    expect(full.input).toContain('Under month_transits is every contact in orb over these days, 12 in all')
    expect(full.input).toContain("the month's events")
    expect(full.input).toContain('**Lunations and Eclipses**, a ### section for each with the natal house it falls in')
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

describe('structure', () => {
  const card = casting({ kind: 'card', result: '{}', title: 'Card · Oct 15', period: '2026-10-15' })
  const spread = casting({ kind: 'spread', result: '{}', title: 'Past, present, future · Oct 15', period: '2026-10-15' })

  it('asks every reading for short blocks, labelled parts as #### headings and lists, never paragraph after paragraph', () => {
    for (const c of [casting({}), casting({ kind: 'natal' }), card, spread]) {
      const { system } = readingRequest(c, sam)
      expect(system).toContain('no paragraph runs past three sentences')
      expect(system).toContain('#### heading with its label')
      expect(system).toContain('make it a bulleted list')
    }
    expect(readingRequest(casting({}), sam).system).toContain('**What to do**, two or three concrete actions as a bulleted list')
    expect(readingRequest(casting({}), sam).system).toContain('never drop one to save words')
  })

  it('gives tarot readings sections of their own', () => {
    expect(readingRequest(card, sam).input).toContain('**The Card**')
    expect(readingRequest(card, sam).input).toContain('**For Your Day**')
    const s = readingRequest(spread, sam).input
    expect(s).toContain('**At a Glance**, a table of each position')
    expect(s).toContain('**The Cards**, a ### section per position')
    expect(s).toContain('**Together**')
  })

  it('has a week take each contact as its own section, not a paragraph', () => {
    const full = readingRequest(casting({ kind: 'week', result: withScan('week', weekOct18, scan), title: 'Week of Oct 18', period: '2026-10-18' }), sam)
    expect(full.input).toContain('Take every event in date order, each its own ### section')
    expect(full.input).not.toContain('full paragraph')
  })

  it('has answers lead with the answer, then break into sections when they run long', () => {
    for (const c of [casting({ reading: 'r', readingState: 'done' }), { ...spread, reading: 'r', readingState: 'done' as const }]) {
      const { system } = followUpRequest(c, [], 'q', sam)
      expect(system).toContain('open with the direct answer in a sentence or two')
      expect(system).toContain('a ### heading for each part of the answer')
    }
  })
})

describe('the shape of a reading', () => {
  const day = new Date(2026, 9, 13)
  const shaped = (shape: Partial<ReadingShape>, over: Partial<Casting> = {}) => readingRequest(casting({ ...over, shape: { ...DEFAULT_SHAPE, ...shape } }), sam, day)

  it('asks for exactly the usual reading and answer when the shape is the default or none', () => {
    for (const kind of ['today', 'week', 'natal', 'spread'] as const) {
      const result = kind === 'natal' ? natalChart : kind === 'spread' ? three : kind === 'week' ? week : transit
      expect(readingRequest(casting({ kind, result, shape: DEFAULT_SHAPE }), sam, day)).toEqual(readingRequest(casting({ kind, result }), sam, day))
      const c = casting({ kind, result, reading: 'R', readingState: 'done' })
      expect(followUpRequest({ ...c, shape: DEFAULT_SHAPE }, [], 'why?', sam, day)).toEqual(followUpRequest(c, [], 'why?', sam, day))
    }
    expect(readingRequest(casting({}), sam, day)).not.toHaveProperty('reasoning')
  })

  it('scales the length, and a glance keeps only the summary, the table and the line to carry', () => {
    expect(shaped({ length: 'short' }).input).toContain('Aim for about 500 words')
    expect(shaped({ length: 'deep' }).input).toContain('Aim for about 1,600 words')
    expect(shaped({ length: 'deep' }).system).toContain('Go deep:')
    const glance = shaped({ length: 'glance', parts: ['carry', 'tables'] })
    expect(glance.input).toContain('**In Short**')
    expect(glance.input).toContain('**At a Glance**')
    expect(glance.input).toContain('**To Carry**')
    expect(glance.input).not.toContain('**Exact Today**')
    expect(glance.system).toContain('no section per contact')
    expect(glance.system).not.toContain('Give the houses real depth')
    const short = shaped({ length: 'short' })
    expect(short.system).toContain('in two or three bullets')
    expect(short.system).not.toContain('**Where it lands**')
  })

  it('groups the contacts by house, planet or time in place of a section each', () => {
    const house = shaped({ organise: 'house' })
    expect(house.input).toContain('**By House**')
    expect(house.input).not.toContain('**Exact Today**')
    expect(house.input).toContain("**The Moon's Day**")
    expect(house.system).toContain('a #### heading for each contact or placement in a group')
    expect(house.system).toContain('as a bold label opening its line')
    expect(shaped({ organise: 'planet' }).input).toContain('**By Planet**')
    // A day cannot be read by time: it is read by contact, as usual.
    expect(shaped({ organise: 'time' })).toEqual(readingRequest(casting({}), sam, day))
    const weekByTime = shaped({ organise: 'time' }, { kind: 'week', result: week })
    expect(weekByTime.input).toContain('**Day by Day**')
    expect(weekByTime.input).not.toContain("**The Week's Transits**")
    const natal = shaped({ organise: 'house' }, { kind: 'natal', result: natalChart })
    expect(natal.input).toContain('**The Houses**, a ### section for each of the twelve houses in order, named with the house')
    expect(natal.input).not.toContain('**The Planets**')
    expect(natal.system).not.toContain('**The house**')
  })

  it('adds and drops parts', () => {
    const more = shaped({ parts: ['summary', 'theme', 'timing', 'reflect', 'mantra', 'glance', 'carry', 'moon', 'actions', 'tables'] })
    const order = ['**In Short**', '**The Thread**', '**At a Glance**', '**Best Times**', '**To Reflect On**', '**A Line to Keep**', '**To Carry**'].map((h) => more.input.indexOf(h))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    const fewer = shaped({ parts: [] })
    for (const h of ['**At a Glance**', '**To Carry**', "**The Moon's Day**", '**What to do**']) expect(`${fewer.system}${fewer.input}`).not.toContain(h)
    expect(fewer.system).toContain('Give no advice and no actions')
    expect(fewer.system).toContain('Use no tables')
    const spread = shaped({ parts: ['glance', 'carry', 'tables'] }, { kind: 'spread', result: three })
    expect(spread.input).not.toContain('**What You Might Do**')
  })

  it('writes in bullets, prose and lists mixed, or prose, for the reading and its answers', () => {
    expect(shaped({ writing: 'mixed' }).system).toContain('Mix prose and lists')
    expect(shaped({ writing: 'prose' }).system).toContain('Write in short flowing paragraphs')
    expect(shaped({ writing: 'prose' }).system).not.toContain('make it a bulleted list, a line each, not a paragraph')
    const c = casting({ reading: 'R', readingState: 'done', shape: { ...DEFAULT_SHAPE, writing: 'prose' } })
    expect(followUpRequest(c, [], 'why?', sam, day).system).toContain('Write in short flowing paragraphs')
  })

  it('leads with the focus asked for, in the reading and its answers, and never at the cost of a contact', () => {
    const r = shaped({ focus: ['challenges', 'supports'], areas: ['love', 'work'] })
    expect(r.system).toContain('FOCUS, as they asked: Lead with the hard contacts')
    expect(r.system).toContain('then the easy contacts (trines and sextiles)')
    expect(r.system).toContain('love and relationships (the 5th, 7th and 8th houses, Venus), and work and money')
    expect(r.system).toContain('Never drop one silently, never invent one to fill the focus')
    const personal = shaped({ focus: ['personal'] })
    expect(personal.system).toContain('Keep to the personal planets')
    expect(personal.input).not.toContain('**The Backdrop**')
    expect(shaped({}).system).not.toContain('FOCUS')
    const c = casting({ reading: 'R', readingState: 'done', shape: { ...DEFAULT_SHAPE, areas: ['home'] } })
    expect(followUpRequest(c, [], 'why?', sam, day).system).toContain('what touches home and family')
    // Tarot takes no focus.
    expect(shaped({ focus: ['challenges'] }, { kind: 'spread', result: three }).system).not.toContain('FOCUS')
  })

  it('asks for the thinking level chosen, for the reading and its answers', () => {
    expect(shaped({ thinking: 'high' }).reasoning).toBe('high')
    const c = casting({ reading: 'R', readingState: 'done', shape: { ...DEFAULT_SHAPE, thinking: 'off' } })
    expect(followUpRequest(c, [], 'why?', sam, day).reasoning).toBe('off')
  })
})

describe('an open session', () => {
  const open = casting({ kind: 'open', period: '2026-10-13', title: 'Saturn?', result: JSON.stringify({ birth: sam }), note: 'What is Saturn doing?', shape: { ...DEFAULT_SHAPE, thinking: 'low' } })

  it('is the birth details, the date and the conversation brief, then the message as written with when it was sent, with both tool servers', () => {
    const req = readingRequest(open, sam, new Date(2026, 9, 13))
    expect(req.system).toBe(`The person: Sam, born 1990-06-15 14:30 in New York, NY, USA. Today is Tue Oct 13 2026.\n\n${OPEN_RULES}`)
    expect(req.input).toBe('What is Saturn doing?\n\n[Sent Tue, Oct 13, 12:00 AM]')
    expect(req.tools).toEqual(['mcp/astrology-v2', 'mcp/tarot'])
    expect(req.reasoning).toBe('low')
  })

  it('holds it as a conversation: short replies allowed, tools only for what is new', () => {
    expect(OPEN_RULES).toContain('ongoing conversation, not a set reading')
    expect(OPEN_RULES).toContain('including the results from earlier turns')
    expect(OPEN_RULES).toContain('Call a tool only for what those results do not already hold')
    expect(OPEN_RULES).toContain('[Sent …] line')
  })

  const step = (name: string, args: Record<string, unknown>, output: string) => ({ kind: 'tool' as const, name, ok: true, args, output })
  const at = (h: number, m: number): number => new Date(2026, 9, 13, h, m).getTime()
  const done = { ...open, createdAt: at(22, 48), reading: 'Saturn squares your Sun.', readingState: 'done' as const, written: { ...NOT_WRITTEN, startedAt: at(22, 48), finishedAt: at(22, 50), trail: [step('create_natal_chart', { date_time: '1990-06-15 14:30' }, '{"natal":1}')] } }
  const earlier: FollowUp[] = [{ id: 'f1', castingId: 'c1', question: 'Since when?', answer: 'Since March.', state: 'done', error: null, createdAt: at(22, 54), remembered: null, memoriesUsed: [], written: { ...NOT_WRITTEN, startedAt: at(22, 54), finishedAt: at(22, 55), trail: [step('create_natal_chart', { date_time: '1990-06-15 14:30' }, '{"natal":2}'), step('create_transit_chart', { transit_date_time: '2026-10-13 12:00' }, '{"transit":1}')] }, card: null }]

  it('replays the session for a follow-up in the brief, tool results and full replies included, and sends the new message as it was written', () => {
    const req = followUpRequest(done, earlier, 'Until when?', sam, new Date(2026, 9, 13))
    const base = readingRequest(open, sam, new Date(2026, 9, 13)).system
    expect(req.system.startsWith(base)).toBe(true)
    expect(req.system.slice(base.length)).toBe([
      '',
      'THE CONVERSATION SO FAR (tool results included, for you to draw on):',
      'Sam (Tue, Oct 13, 10:48 PM): What is Saturn doing?',
      'You (Tue, Oct 13, 10:50 PM): Saturn squares your Sun.',
      'Sam (Tue, Oct 13, 10:54 PM): Since when?',
      '[Tool create_natal_chart {"date_time":"1990-06-15 14:30"} returned]\n{"natal":2}',
      '[Tool create_transit_chart {"transit_date_time":"2026-10-13 12:00"} returned]\n{"transit":1}',
      'You (Tue, Oct 13, 10:55 PM): Since March.',
    ].join('\n\n'))
    expect(req.input).toBe('Until when?\n\n[Sent Tue, Oct 13, 12:00 AM]')
    expect(req.tools).toEqual(['mcp/astrology-v2', 'mcp/tarot'])
  })

  it('keeps a long reply whole', () => {
    const long = 'x'.repeat(6000)
    expect(openHistory({ ...done, reading: long }, [], 'Sam')).toContain(`You (${sentAt(at(22, 50))}): ${long}`)
  })

  it('over its budget, leaves out the oldest tool results first, then the oldest turns', () => {
    const tools = openHistory(done, earlier, 'Sam', 200)
    expect(tools).toContain('(earlier parts left out)')
    expect(tools).not.toContain('{"natal":2}')
    expect(tools).toContain('What is Saturn doing?')
    const turns = openHistory(done, earlier, 'Sam', 60)
    expect(turns).not.toContain('What is Saturn doing?')
    expect(turns).toContain('): Since March.')
  })

})
