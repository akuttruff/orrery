import { describe, expect, it } from 'vitest'
import { DEFAULT_SHAPE, isDefaultShape, isShape, optionsFor, shapeFor, shapeOf, shapeSummary, thinkingFor } from './shape.ts'

describe('shapeOf', () => {
  it('makes anything a whole shape: the default for nothing or junk, what is known kept, the rest dropped', () => {
    expect(shapeOf(null)).toEqual(DEFAULT_SHAPE)
    expect(shapeOf('short')).toEqual(DEFAULT_SHAPE)
    expect(shapeOf([1])).toEqual(DEFAULT_SHAPE)
    const s = shapeOf({ length: 'short', organise: 'sideways', parts: ['summary', 'nonsense'], focus: ['challenges', 'x'], areas: ['love'], thinking: 'high', extra: 1 })
    expect(s).toEqual({ ...DEFAULT_SHAPE, length: 'short', parts: ['summary'], focus: ['challenges'], areas: ['love'], thinking: 'high' })
    // Parts missing altogether are the default ones; an empty list is none.
    expect(shapeOf({}).parts).toEqual(DEFAULT_SHAPE.parts)
    expect(shapeOf({ parts: [] }).parts).toEqual([])
  })

  it('never hands out the default shape itself to be changed', () => {
    shapeOf(null).parts.push('mantra')
    expect(DEFAULT_SHAPE.parts).not.toContain('mantra')
  })
})

describe('isShape', () => {
  it('takes only a whole, well-formed shape', () => {
    expect(isShape(DEFAULT_SHAPE)).toBe(true)
    expect(isShape({ ...DEFAULT_SHAPE, length: 'epic' })).toBe(false)
    expect(isShape({ ...DEFAULT_SHAPE, parts: ['summary', 'x'] })).toBe(false)
    const { writing: _w, ...partial } = DEFAULT_SHAPE
    expect(isShape(partial)).toBe(false)
    expect(isShape(null)).toBe(false)
  })
})

describe('shapeFor', () => {
  it('drops what a kind cannot take, keeping the default for the parts it does not have', () => {
    const s = shapeOf({ organise: 'time', focus: ['challenges', 'personal'], areas: ['love'], parts: ['summary', 'timing'] })
    expect(shapeFor(s, 'week')).toMatchObject({ organise: 'time', focus: ['challenges', 'personal'], areas: ['love'] })
    // A day has no 'by time'; a birth chart has no personal-planets focus; tarot has neither focus nor areas.
    expect(shapeFor(s, 'today').organise).toBe('contact')
    expect(shapeFor(s, 'natal').focus).toEqual(['challenges'])
    expect(shapeFor(s, 'spread')).toMatchObject({ organise: 'contact', focus: [], areas: [] })
    // A card offers Tables, so this shape's 'off' holds; it has no Moon's day, so that keeps its default.
    expect(shapeFor(s, 'card').parts).not.toContain('tables')
    expect(shapeFor(s, 'card').parts).toContain('moon')
  })
})

describe('isDefaultShape and shapeSummary', () => {
  it('says only what differs from the usual, and nothing for the usual', () => {
    expect(isDefaultShape(null)).toBe(true)
    expect(isDefaultShape({ ...DEFAULT_SHAPE, parts: [...DEFAULT_SHAPE.parts].reverse() })).toBe(true)
    expect(shapeSummary(null, 'today')).toBe('')
    const s = shapeOf({ ...DEFAULT_SHAPE, length: 'short', organise: 'house', focus: ['challenges'], parts: ['glance', 'moon', 'tables', 'reflect'], writing: 'mixed', thinking: 'high' })
    expect(isDefaultShape(s)).toBe(false)
    expect(shapeSummary(s, 'today')).toBe('Short · by house · challenges · + questions · no to carry · no actions · mixed · thinking high')
    // A part the kind does not have is not reported missing.
    expect(shapeSummary(shapeOf({ parts: ['glance', 'carry', 'actions', 'tables'] }), 'week')).toBe('')
  })
})

describe('optionsFor and thinkingFor', () => {
  it('offers each kind only what it can be shaped by', () => {
    expect(optionsFor('today').organise).toEqual(['contact', 'house', 'planet'])
    expect(optionsFor('month').organise).toContain('time')
    expect(optionsFor('natal').organise).toEqual(['contact', 'house'])
    expect(optionsFor('card').organise).toEqual(['contact'])
    expect(optionsFor('today').parts).toContain('moon')
    expect(optionsFor('week').parts).not.toContain('moon')
    expect(optionsFor('card').parts).not.toContain('glance')
    expect(optionsFor('spread').areas).toBe(false)
  })

  it('offers the thinking levels the model takes', () => {
    expect(thinkingFor(null).map((t) => t.id)).toEqual(['', 'off', 'low', 'medium', 'high', 'xhigh'])
    expect(thinkingFor([]).map((t) => t.id)).toEqual([''])
    expect(thinkingFor(['off', 'on']).map((t) => t.id)).toEqual(['', 'off', 'on'])
    expect(thinkingFor(['low', 'medium', 'high']).map((t) => t.id)).toEqual(['', 'low', 'medium', 'high'])
  })
})
