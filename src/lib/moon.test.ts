import { describe, expect, it } from 'vitest'
import { hoursText, parseMoon, timeText, whenText } from './moon.ts'

const sample = JSON.stringify({
  void: {
    range: { start: '2026-10-15', end: '2026-10-29' },
    void_now: { moon_in: 'Sagittarius', void_from: '2026-10-15 14:56', void_until: '2026-10-16 05:57', enters: 'Capricorn', hours: 15, began_with: 'Moon sextile Sun' },
    periods: [
      { moon_in: 'Sagittarius', void_from: '2026-10-15 14:56', void_until: '2026-10-16 05:57', enters: 'Capricorn', hours: 15, began_with: 'Moon sextile Sun' },
      { moon_in: 'Capricorn', void_from: '2026-10-18 09:13', void_until: '2026-10-18 18:40', enters: 'Aquarius', hours: 9.5 },
      { broken: true },
    ],
  },
  lunations: { events: [{ event: 'full moon', exact: '2026-10-25 21:12', position: "2°46' Taurus", natal_house: 6, contacts: ['opposition natal Pluto (2.6°)'] }] },
})

describe('parseMoon', () => {
  it('reads both tools, dropping rows it cannot make sense of', () => {
    const moon = parseMoon(sample)!
    expect(moon.range).toEqual({ start: '2026-10-15', end: '2026-10-29' })
    expect(moon.voidNow?.enters).toBe('Capricorn')
    expect(moon.voids).toHaveLength(2)
    expect(moon.voids[1]!.beganWith).toBeNull()
    expect(moon.lunations[0]).toMatchObject({ event: 'full moon', natalHouse: 6, contacts: ['opposition natal Pluto (2.6°)'] })
  })

  it('is null for anything that is not the Moon result', () => {
    expect(parseMoon('nope')).toBeNull()
    expect(parseMoon('[]')).toBeNull()
    expect(parseMoon('{}')).toEqual({ range: null, voidNow: null, voids: [], lunations: [] })
  })
})

describe('text', () => {
  it('writes the tools\' timestamps as a person reads a clock', () => {
    expect(whenText('2026-10-15 14:56')).toBe('Thu Oct 15, 2:56 PM')
    expect(whenText('2026-10-16 00:05')).toBe('Fri Oct 16, 12:05 AM')
    expect(whenText('2026-10-16')).toBe('Fri Oct 16')
    expect(timeText('2026-10-15 14:56')).toBe('2:56 PM')
    expect(hoursText(9.5)).toBe('9.5 h')
    expect(hoursText(36)).toBe('1.5 d')
  })
})
