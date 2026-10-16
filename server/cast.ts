import type { Kind, Profile } from '../src/types.ts'
import type { ToolCaller } from './astro.ts'

/**
 * What each shortcut button does: which tools to run, for which period,
 * and what to call the result. Everything the model is later asked to
 * write about comes from these results and nothing else.
 */

const pad = (n: number): string => String(n).padStart(2, '0')
/** A date as the tools want it, in this machine's timezone (the same as the person's). */
export const localDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const localMonth = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

const DAY_MS = 24 * 60 * 60 * 1000
export const addDays = (iso: string, n: number): string => localDate(new Date(new Date(`${iso}T12:00:00`).getTime() + n * DAY_MS))

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 'Oct 15' style, for titles. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTHS[(m ?? 1) - 1]!.slice(0, 3)} ${d}`
}

/** The period a kind is cast for, keyed so one cast per period is kept. */
export function periodFor(kind: Kind, now: Date): string {
  switch (kind) {
    case 'today': return localDate(now)
    case 'week': return localDate(now)
    case 'month': return localMonth(now)
    case 'year': return localDate(now)
    case 'moon': return localDate(now)
    case 'natal': return 'natal'
  }
}

export function titleFor(kind: Kind, period: string, profile: Profile): string {
  switch (kind) {
    case 'today': return `Today · ${shortDate(period)}`
    case 'week': return `Week of ${shortDate(period)}`
    case 'month': {
      const [y, m] = period.split('-').map(Number)
      return `${MONTHS[(m ?? 1) - 1]} ${y}`
    }
    case 'year': return `Year from ${shortDate(period)}`
    case 'moon': return `Moon · ${shortDate(period)} – ${shortDate(addDays(period, 14))}`
    case 'natal': return `${profile.name}'s birth chart`
  }
}

const birth = (p: Profile): Record<string, unknown> => ({
  date_time: p.dateTime, city: p.city, state: p.state || undefined, country: p.country || undefined,
})

/** Run the tools behind a kind and return the result text to keep. */
export async function castResult(kind: Kind, period: string, profile: Profile, call: ToolCaller): Promise<string> {
  switch (kind) {
    case 'today':
      // No transit_date_time: 'now', so the Moon and the fast planets are where they are this minute.
      return call('create_transit_chart', birth(profile))
    case 'week':
      return call('forecast_week', { ...birth(profile), start_date: period })
    case 'month':
      return call('forecast_month', { ...birth(profile), month: period })
    case 'year':
      return call('forecast_year', { ...birth(profile), start_date: period })
    case 'natal':
      return call('create_natal_chart', birth(profile))
    case 'moon': {
      const place = { city: profile.city, state: profile.state || undefined, country: profile.country || undefined }
      const end = addDays(period, 14)
      const [voids, lunations] = await Promise.all([
        call('moon_void_periods', { ...place, start_date: period, end_date: end }),
        call('lunations_and_eclipses', { ...birth(profile), start_date: period, end_date: addDays(period, 45) }),
      ])
      return JSON.stringify({ void: parseOr(voids), lunations: parseOr(lunations) })
    }
  }
}

const parseOr = (text: string): unknown => { try { return JSON.parse(text) } catch { return text } }
