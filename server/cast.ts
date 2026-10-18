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

/** The Sunday a day's week starts on. */
export const sundayOf = (d: Date): string => addDays(localDate(d), -d.getDay())

/**
 * The days a week casting covers: the week is anchored to Sunday whatever
 * day it is cast on, and the forecast runs from that day to the Saturday,
 * so a Sunday gets seven days and a Saturday one.
 */
export function weekSpan(period: string, now: Date): { start: string; end: string; days: number } {
  const end = addDays(period, 6)
  const today = localDate(now)
  const start = today < period ? period : today > end ? end : today
  return { start, end, days: Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / DAY_MS) + 1 }
}

/** The period a kind is cast for: a day, the week's Sunday, a month, 'natal'. */
export function periodFor(kind: Kind, now: Date): string {
  switch (kind) {
    case 'today': return localDate(now)
    case 'week': return sundayOf(now)
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
export async function castResult(kind: Kind, period: string, profile: Profile, call: ToolCaller, now = new Date()): Promise<string> {
  switch (kind) {
    case 'today':
      // No transit_date_time: 'now', so the Moon and the fast planets are where they are this minute.
      return call('create_transit_chart', birth(profile))
    case 'week': {
      // The tool always gives seven days from its start; the week ends on Saturday, so the days past it are trimmed off.
      const span = weekSpan(period, now)
      return trimWeek(await call('forecast_week', { ...birth(profile), start_date: span.start }), span.start, span.end)
    }
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

type Row = Record<string, unknown>
const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
/** The day an entry falls on, from whichever of its fields carries a date. */
const dayOf = (r: Row): string | null => {
  for (const key of ['exact', 'date', 'date_time', 'when', 'moment']) {
    const v = r[key]
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  }
  return null
}

/**
 * A week forecast cut down to the days from `start` to `end`: the range
 * itself, the headline transits (those in orb on any of the days, their
 * windows clipped, an exact moment outside the days dropped so the nearest
 * one stands), and the lunations, ingresses and stations that fall inside.
 * Text that is not a forecast is left as it is.
 */
export function trimWeek(text: string, start: string, end: string): string {
  let data: unknown
  try { data = JSON.parse(text) } catch { return text }
  if (!isRow(data) || !Array.isArray(data.headline_transits)) return text
  const within = (day: string | null): boolean => day === null || (day >= start && day <= end)
  const out: Row = { ...data, range: { ...(isRow(data.range) ? data.range : {}), start, end } }
  out.headline_transits = (data.headline_transits as unknown[]).filter(isRow)
    .filter((h) => typeof h.start === 'string' && typeof h.end === 'string' && h.start <= end && h.end >= start)
    .map((h) => {
      const clipped: Row = { ...h, start: (h.start as string) < start ? start : h.start, end: (h.end as string) > end ? end : h.end }
      if (typeof h.exact === 'string' && !within(h.exact.slice(0, 10))) clipped.exact = null
      return clipped
    })
  for (const key of ['lunations', 'eclipses', 'ingresses', 'stations']) {
    const list = data[key]
    if (Array.isArray(list)) out[key] = list.filter((item) => !isRow(item) || within(dayOf(item)))
  }
  return JSON.stringify(out)
}
