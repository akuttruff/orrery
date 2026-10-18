import { describe, expect, it } from 'vitest'
import { castKindIn, castingIdIn, hashFor, wheelHashFor, wheelIdIn } from './route.ts'

describe('route', () => {
  it('tells a casting from a wheel from home', () => {
    expect(castingIdIn('#/c/ab12')).toBe('ab12')
    expect(wheelIdIn('#/c/ab12')).toBeNull()
    expect(wheelIdIn('#/w/ab12')).toBe('ab12')
    expect(castingIdIn('#/w/ab12')).toBeNull()
    expect(castingIdIn('')).toBeNull()
    expect(castingIdIn('#/c/a/b')).toBeNull()
    expect(castKindIn('#/cast/today')).toBe('today')
    expect(castKindIn('#/c/today')).toBeNull()
    expect(castingIdIn('#/cast/today')).toBeNull()
  })

  it('round-trips an id through the hash', () => {
    expect(castingIdIn(hashFor('a b%'))).toBe('a b%')
    expect(wheelIdIn(wheelHashFor('a b%'))).toBe('a b%')
    expect(hashFor(null)).toBe('')
  })
})
