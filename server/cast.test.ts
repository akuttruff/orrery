// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { addDays, castResult, localDate, monthSpan, periodFor, shortDate, sundayOf, titleFor, trimWeek, weekSpan, withScan, SCAN_OBJECTS, WEEK_SCAN_OBJECTS } from './cast.ts'
import type { Profile } from '../src/types.ts'
import week from '../src/test/fixtures/forecast-week.json?raw'
import weekOct18 from '../src/test/fixtures/forecast-week-oct18.json?raw'
import scan from '../src/test/fixtures/scan-week.json?raw'
import month from '../src/test/fixtures/forecast-month.json?raw'
import scanMonth from '../src/test/fixtures/scan-month.json?raw'

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
    // The month's forecast and its scan over the calendar month, Mars outward, as the forecast itself ranks.
    await castResult('month', '2026-10', amie, call)
    expect(call).toHaveBeenCalledWith('forecast_month', expect.objectContaining({ month: '2026-10' }))
    expect(call).toHaveBeenLastCalledWith('list_upcoming_transits', expect.objectContaining({ start_date: '2026-10-01', end_date: '2026-10-31', object_filter: SCAN_OBJECTS.month, date_time: '1990-06-15 14:30' }))
    expect(SCAN_OBJECTS.month).not.toContain('Venus')
    // The week's forecast starts on the day it is cast, not on its Sunday; the scan covers the same days, Moon left out.
    await castResult('week', '2026-10-11', amie, call, oct15)
    expect(call).toHaveBeenCalledWith('forecast_week', expect.objectContaining({ start_date: '2026-10-15' }))
    expect(call).toHaveBeenLastCalledWith('list_upcoming_transits', expect.objectContaining({ start_date: '2026-10-15', end_date: '2026-10-17', object_filter: WEEK_SCAN_OBJECTS, date_time: '1990-06-15 14:30' }))
  })

  it('folds the week\'s scan into its forecast, and casts the week without it when the scan fails', async () => {
    const call = vi.fn(async (name: string) => (name === 'forecast_week' ? weekOct18 : scan))
    const result = JSON.parse(await castResult('week', '2026-10-18', amie, call, new Date(2026, 9, 18, 9))) as { forecast: string; week_transits: { range: unknown; total: number; transits: { from_object: string; exact: string | null }[] } }
    expect(result.forecast).toBe('week')
    expect(result.week_transits.range).toEqual({ start: '2026-10-18', end: '2026-10-24' })
    expect(result.week_transits.total).toBe(18)
    expect(result.week_transits.transits).toHaveLength(18)
    expect(result.week_transits.transits.some((t) => t.from_object === 'Uranus' && t.exact === null)).toBe(true)

    const failing = vi.fn(async (name: string) => { if (name === 'forecast_week') return weekOct18; throw new Error('scan timed out') })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const alone = JSON.parse(await castResult('week', '2026-10-18', amie, failing, new Date(2026, 9, 18, 9))) as Record<string, unknown>
    expect(alone.forecast).toBe('week')
    expect(alone.week_transits).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('scan failed'))
    warn.mockRestore()
    // Anything that is not a scan is left out rather than folded in.
    expect(withScan('week', weekOct18, '{"tool":"x"}')).toBe(weekOct18)
    expect(withScan('week', 'not json', scan)).toBe('not json')
  })

  it('folds the month\'s scan into its forecast under its own key', async () => {
    const call = vi.fn(async (name: string) => (name === 'forecast_month' ? month : scanMonth))
    const result = JSON.parse(await castResult('month', '2026-10', amie, call)) as { forecast: string; week_transits?: unknown; month_transits: { range: unknown; total: number; transits: { from_object: string; exact: string | null }[] } }
    expect(result.forecast).toBe('month')
    expect(result.week_transits).toBeUndefined()
    expect(result.month_transits.range).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(result.month_transits.total).toBe(19)
    // The six Mars contacts the twelve headlines had no room for, every one exact in the month.
    const mars = result.month_transits.transits.filter((t) => t.from_object === 'Mars')
    expect(mars).toHaveLength(6)
    expect(mars.every((t) => t.exact?.startsWith('2026-10'))).toBe(true)
  })

  it('anchors the week to Sunday and covers the days left in it, seven at most and one at least', () => {
    expect(weekSpan('2026-10-11', new Date(2026, 9, 11, 9))).toEqual({ start: '2026-10-11', end: '2026-10-17', days: 7 })
    expect(weekSpan('2026-10-11', oct15)).toEqual({ start: '2026-10-15', end: '2026-10-17', days: 3 })
    expect(weekSpan('2026-10-11', new Date(2026, 9, 17, 23, 50))).toEqual({ start: '2026-10-17', end: '2026-10-17', days: 1 })
    expect(sundayOf(new Date(2026, 9, 18, 0, 5))).toBe('2026-10-18')
    expect(sundayOf(new Date(2026, 9, 24, 12))).toBe('2026-10-18')
    expect(monthSpan('2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(monthSpan('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
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
