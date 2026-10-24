import { afterEach, describe, expect, it, vi } from 'vitest'
import { cardRows, castingImage, imageFilename, layoutCards, parseInline, parseMarkdown, pulledImage, saveImage, scaleFor, wrapRuns } from './readingImage.ts'
import type { Measure, Run } from './readingImage.ts'
import { parseReading } from './tarotSpread.ts'
import three from '../test/fixtures/tarot-three.json?raw'
import single from '../test/fixtures/tarot-card.json?raw'

/** Ten units a letter, eleven in bold. */
const measure: Measure = (text, run) => text.length * (run.bold ? 11 : 10)
const texts = (lines: Run[][]): string[] => lines.map((l) => l.map((r) => r.text).join(''))

describe('parseInline', () => {
  it('keeps bold and italic as runs and drops the rest of the markup', () => {
    expect(parseInline('The **Queen of Swords**, *reversed*, see [the deck](https://x) and `code`')).toEqual([
      { text: 'The ' }, { text: 'Queen of Swords', bold: true }, { text: ', ' }, { text: 'reversed', italic: true }, { text: ', see the deck and code' },
    ])
  })

  it('nests italic in bold, leaves snake_case alone and strips a marker left open', () => {
    expect(parseInline('**a *b* c**')).toEqual([{ text: 'a ', bold: true }, { text: 'b', bold: true, italic: true }, { text: ' c', bold: true }])
    expect(parseInline('snake_case_name and _this_')).toEqual([{ text: 'snake_case_name and ' }, { text: 'this', italic: true }])
    expect(parseInline('an open **bold')).toEqual([{ text: 'an open bold' }])
  })
})

describe('parseMarkdown', () => {
  it('reads headings, paragraphs joined across lines, lists, quotes and rules', () => {
    const md = '### Past · Six of Wands\n\nThe first\nline goes on.\n\n- one **thing**\n- two\n  more\n1. first\n\n> a quote\n\n---\n\n| A | B |\n|---|---|\n| x | y |'
    expect(parseMarkdown(md)).toEqual([
      { type: 'heading', level: 3, runs: [{ text: 'Past · Six of Wands' }] },
      { type: 'para', runs: [{ text: 'The first line goes on.' }] },
      { type: 'item', marker: '•', runs: [{ text: 'one ' }, { text: 'thing', bold: true }] },
      { type: 'item', marker: '•', runs: [{ text: 'two more' }] },
      { type: 'item', marker: '1.', runs: [{ text: 'first' }] },
      { type: 'para', quote: true, runs: [{ text: 'a quote' }] },
      { type: 'rule' },
      { type: 'para', runs: [{ text: 'A · B' }] },
      { type: 'para', runs: [{ text: 'x · y' }] },
    ])
  })
})

describe('wrapRuns', () => {
  it('breaks between words, never wider than the line', () => {
    const lines = wrapRuns([{ text: 'the quick brown fox jumps over' }], 100, measure)
    expect(texts(lines)).toEqual(['the quick', 'brown fox', 'jumps over'])
  })

  it('keeps styles across a break and a word made of two styles together', () => {
    const lines = wrapRuns([{ text: 'aa ' }, { text: 'bold', bold: true }, { text: 'ly cc dd' }], 95, measure)
    expect(texts(lines)).toEqual(['aa boldly', 'cc dd'])
    expect(lines[0]).toEqual([{ text: 'aa ' }, { text: 'bold', bold: true }, { text: 'ly' }])
  })

  it('breaks a word too long for any line by letters', () => {
    expect(texts(wrapRuns([{ text: 'abcdefghijkl x' }], 50, measure))).toEqual(['abcde', 'fghij', 'kl x'])
  })

  it('gives no lines for no words', () => {
    expect(wrapRuns([{ text: '   ' }], 100, measure)).toEqual([])
  })
})

describe('the cards', () => {
  it('puts at most five in a row, the rows as even as they can be', () => {
    expect(cardRows(1)).toEqual([1])
    expect(cardRows(3)).toEqual([3])
    expect(cardRows(6)).toEqual([3, 3])
    expect(cardRows(7)).toEqual([4, 3])
    expect(cardRows(10)).toEqual([5, 5])
    expect(cardRows(0)).toEqual([])
  })

  it('centres each row and sizes every card alike', () => {
    const one = layoutCards(1, 1000, { maxCard: 400 })
    expect(one.cardWidth).toBe(400)
    expect(one.slots).toEqual([{ x: 300, row: 0 }])
    const seven = layoutCards(7, 1000, { gap: 40, maxCard: 400 })
    expect(seven.cardWidth).toBe(220)
    expect(seven.slots.filter((s) => s.row === 1).map((s) => s.x)).toEqual([130, 390, 650])
    expect(seven.cardHeight).toBeCloseTo(220 * 4.75 / 2.75)
  })

  it('draws at 2x unless the picture would be too big for a phone canvas', () => {
    expect(scaleFor(1080, 3000)).toBe(2)
    expect(scaleFor(1080, 10_000)).toBeLessThan(2)
    expect(1080 * 10_000 * scaleFor(1080, 10_000) ** 2).toBeLessThanOrEqual(16_777_216)
  })
})

describe('what is drawn', () => {
  const day = new Date(2026, 9, 14, 9).getTime()
  it('names the file by kind and day', () => {
    expect(imageFilename({ kind: 'daily-card', date: day })).toBe('orrery-daily-card-2026-10-14.png')
    expect(imageFilename({ kind: 'Celtic Cross!', date: day })).toBe('orrery-celtic-cross-2026-10-14.png')
  })

  it('takes a spread with its positions and question, a daily card without', () => {
    const spread = castingImage({ kind: 'spread', createdAt: day, note: 'the job search' }, parseReading(three)!, 'text')
    expect(spread.heading).toBe('Past, present, future')
    expect(spread.question).toBe('What do I need to see about the job search this week?')
    expect(spread.cards).toHaveLength(3)
    expect(spread.cards[0]).toMatchObject({ position: expect.any(String), src: expect.stringMatching(/^\/api\/tarot\/.+\.jpg$/) })
    expect(spread.cards.some((c) => c.reversed)).toBe(true)
    const card = castingImage({ kind: 'card', createdAt: day, note: '' }, parseReading(single)!, 'text')
    expect(card).toMatchObject({ kind: 'daily-card', heading: 'Daily card', question: null })
    expect(card.cards[0]).toEqual({ src: '/api/tarot/pentacles-05.jpg', name: 'Five of Pentacles', reversed: true })
  })

  it('takes a pulled card with what it was read against', () => {
    const pulled = parseReading(single)!.cards[0]!
    expect(pulledImage({ card: pulled, createdAt: day }, 'answer', 'Today · Oct 14')).toMatchObject({ kind: 'pulled-card', sub: 'Read against “Today · Oct 14”', text: 'answer' })
    expect(pulledImage({ card: null, createdAt: day }, 'answer')).toBeNull()
  })
})

describe('saveImage', () => {
  afterEach(() => { vi.restoreAllMocks() })
  const file = new File(['png'], 'orrery-spread-2026-10-14.png', { type: 'image/png' })

  it('opens the share sheet when it takes files', async () => {
    const share = vi.fn(async () => {})
    const nav = { canShare: () => true, share } as unknown as Navigator
    expect(await saveImage(file, 'Spread', nav)).toBe('shared')
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'Spread' })
  })

  it('downloads otherwise', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('orrery-spread-2026-10-14.png')
      expect(this.href).toBe('blob:x')
    })
    expect(await saveImage(file, 'Spread', { canShare: () => false, share: vi.fn() } as unknown as Navigator)).toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
  })
})
