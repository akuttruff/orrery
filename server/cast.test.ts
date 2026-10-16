// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { addDays, castResult, localDate, periodFor, shortDate, titleFor } from './cast.ts'
import type { Profile } from '../src/types.ts'

const amie: Profile = { name: 'Sam', dateTime: '1990-06-15 14:30', city: 'New York', state: 'CA', country: 'USA' }
const oct15 = new Date(2026, 9, 15, 22, 8)

describe('periods', () => {
  it('keys each kind by the span it covers', () => {
    expect(periodFor('today', oct15)).toBe('2026-10-15')
    expect(periodFor('week', oct15)).toBe('2026-10-15')
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
    await castResult('week', '2026-10-15', amie, call)
    expect(call).toHaveBeenLastCalledWith('forecast_week', expect.objectContaining({ start_date: '2026-10-15' }))
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
