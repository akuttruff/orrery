import { describe, expect, it } from 'vitest'
import { hasHouses, houseSystemOf } from './houses.ts'

describe('a casting\'s house system', () => {
  it('is read back from what astro-mcp recorded, at the top or under natal, spaced or not', () => {
    expect(houseSystemOf('{"chart_type":"natal","house_system":"placidus","objects":{}}')).toBe('placidus')
    expect(houseSystemOf('{"forecast":"week","natal": { "house_system": "whole_sign" }}')).toBe('whole_sign')
    expect(houseSystemOf('{"void":{},"lunations":{"house_system":"placidus"}}')).toBe('placidus')
  })

  it('is unknown for tarot and for castings from before there was a choice', () => {
    expect(houseSystemOf('{"spread":{"id":"three"},"cards":[]}')).toBeNull()
    expect(houseSystemOf('{"house_system":"koch"}')).toBeNull()
  })

  it('is offered for the chart kinds only', () => {
    expect(['today', 'week', 'month', 'year', 'natal', 'moon'].every((k) => hasHouses(k as never))).toBe(true)
    expect(hasHouses('card')).toBe(false)
    expect(hasHouses('spread')).toBe(false)
  })
})
