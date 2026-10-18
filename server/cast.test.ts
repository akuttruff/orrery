// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { addDays, castResult, localDate, periodFor, shortDate, sundayOf, titleFor, trimWeek, weekSpan } from './cast.ts'
import type { Profile } from '../src/types.ts'
import week from '../src/test/fixtures/forecast-week.json?raw'

const amie: Profile = { name: 'Sam', dateTime: '1990-06-15 14:30', city: 'New York', state: 'CA', country: 'USA' }
const oct15 = new Date(2026, 9, 15, 22, 8)

describe('periods', () => {
  it('keys each kind by the span it covers', () => {
    expect(periodFor('today', oct15)).toBe('2026-10-15')
    // A Thursday: its week began on Sunday the 11th.
    expect(periodFor('week', oct15)).toBe('2026-10-11')
    expect(periodFor('month', oct15)).toBe('2026-10')
    expect(periodFor('year', oct15)).toBe('2026-10-15')
    expect(periodFor('moon', oct15)).toBe('2026-10-15')
    expect(periodFor('natal', oct15)).toBe('natal')
  })

  it('counts days without drifting across DST', () => {
    expect(addDays('2026-10-31', 14)).toBe('2026-11-14')
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09')
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(shortDate('2026-10-05')).toBe('Oct 5')
  })

  it('titles read as a person would say them', () => {
    expect(titleFor('today', '2026-10-15', amie)).toBe('Today · Oct 15')
    expect(titleFor('month', '2026-10', amie)).toBe('October 2026')
    expect(titleFor('natal', 'natal', amie)).toBe("Sam's birth chart")
    expect(titleFor('moon', '2026-10-15', amie)).toBe('Moon · Oct 15 – Oct 29')
  })
})

describe('castResult', () => {
  it('passes the birth data by city, and the period as the tool wants it', async () => {
    const call = vi.fn(async (name: string) => `{"tool":"${name}"}`)
    await castResult('today', '2026-10-15', amie, call)
    expect(call).toHaveBeenCalledWith('create_transit_chart', { date_time: '1990-06-15 14:30', city: 'New York', state: 'CA', country: 'USA' })
    await castResult('month', '2026-10', amie, call)
    expect(call).toHaveBeenLastCalledWith('forecast_month', expect.objectContaining({ month: '2026-10' }))
    // The week's forecast starts on the day it is cast, not on its Sunday.
    await castResult('week', '2026-10-11', amie, call, oct15)
    expect(call).toHaveBeenLastCalledWith('forecast_week', expect.objectContaining({ start_date: '2026-10-15' }))
  })

  it('anchors the week to Sunday and covers the days left in it, seven at most and one at least', () => {
    expect(weekSpan('2026-10-11', new Date(2026, 9, 11, 9))).toEqual({ start: '2026-10-11', end: '2026-10-17', days: 7 })
    expect(weekSpan('2026-10-11', oct15)).toEqual({ start: '2026-10-15', end: '2026-10-17', days: 3 })
    expect(weekSpan('2026-10-11', new Date(2026, 9, 17, 23, 50))).toEqual({ start: '2026-10-17', end: '2026-10-17', days: 1 })
    expect(sundayOf(new Date(2026, 9, 18, 0, 5))).toBe('2026-10-18')
    expect(sundayOf(new Date(2026, 9, 24, 12))).toBe('2026-10-18')
  })

  it('trims a week forecast to the days asked for', () => {
    const trimmed = JSON.parse(trimWeek(week, '2026-10-15', '2026-10-17')) as {
      range: { start: string; end: string }
      headline_transits: { transiting: string; natal: string; start: string; end: string; exact: string | null; nearest_exact: string | null }[]
      stations: { exact: string }[]
    }
    expect(trimmed.range).toEqual({ start: '2026-10-15', end: '2026-10-17' })
    const whole = JSON.parse(week) as { headline_transits: unknown[] }
    expect(trimmed.headline_transits.length).toBe(whole.headline_transits.length)
    for (const h of trimmed.headline_transits) {
      expect(h.start >= '2026-10-15').toBe(true)
      expect(h.end <= '2026-10-17').toBe(true)
      expect(!h.exact || (h.exact.slice(0, 10) >= '2026-10-15' && h.exact.slice(0, 10) <= '2026-10-17')).toBe(true)
    }
    // Mercury sextile MC was exact on the 13th: outside the days, so only its nearest moment stands.
    const mercury = trimmed.headline_transits.find((h) => h.transiting === 'Mercury' && h.natal === 'MC')!
    expect(mercury.exact).toBeNull()
    expect(mercury.nearest_exact).toBe('2026-10-13 16:16')
    expect(trimmed.stations).toHaveLength(1)
    expect(JSON.parse(trimWeek(week, '2026-10-19', '2026-10-24')).headline_transits).toEqual([])
    expect(trimWeek('not json', '2026-10-15', '2026-10-17')).toBe('not json')
  })

  it('leaves an empty state or country out rather than sending blanks', async () => {
    const call = vi.fn(async (_name: string, _args: Record<string, unknown>) => '{}')
    await castResult('natal', 'natal', { ...amie, state: '', country: '' }, call)
    expect(call.mock.calls[0]![1]).toEqual({ date_time: '1990-06-15 14:30', city: 'New York', state: undefined, country: undefined })
  })

  it('folds the two Moon tools into one result', async () => {
    const call = vi.fn(async (name: string) => (name === 'moon_void_periods' ? '{"periods":[]}' : '{"events":[]}'))
    const result = JSON.parse(await castResult('moon', '2026-10-15', amie, call)) as { void: unknown; lunations: unknown }
    expect(result).toEqual({ void: { periods: [] }, lunations: { events: [] } })
    expect(call).toHaveBeenCalledWith('moon_void_periods', expect.objectContaining({ start_date: '2026-10-15', end_date: '2026-10-29' }))
    expect(call).toHaveBeenCalledWith('lunations_and_eclipses', expect.objectContaining({ date_time: '1990-06-15 14:30', end_date: '2026-11-29' }))
  })
})
