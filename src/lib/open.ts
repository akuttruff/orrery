/**
 * An open session: birth details and a message, with the model left to call
 * astro-mcp and tarot-mcp itself (server/prompt.ts openRequest). Nothing is
 * run up front, so the casting's result keeps only the birth details the
 * session was given, which may differ from the saved ones for this once.
 */
import type { Profile } from '../types.ts'

/** The birth details an open session is given, as kept on it. */
export const openBirth = (p: Profile): Profile => ({ name: p.name, dateTime: p.dateTime, city: p.city, state: p.state, country: p.country })

/** The birth details an open session was started with, from its result; null for anything else. */
export function birthOf(result: string): Profile | null {
  try {
    const b = (JSON.parse(result) as { birth?: Partial<Profile> } | null)?.birth
    if (!b || typeof b.dateTime !== 'string' || typeof b.city !== 'string') return null
    return { name: String(b.name ?? ''), dateTime: b.dateTime, city: b.city, state: String(b.state ?? ''), country: String(b.country ?? '') }
  } catch { return null }
}

/** "1985-03-02 14:10 in Portland, OR, USA": birth details at a glance. */
export const birthLine = (b: Pick<Profile, 'dateTime' | 'city' | 'state' | 'country'>): string =>
  `${b.dateTime} in ${[b.city, b.state, b.country].filter(Boolean).join(', ')}`

/** Whether two sets of birth details are the same chart. */
export const sameBirth = (a: Pick<Profile, 'dateTime' | 'city' | 'state' | 'country'>, b: Pick<Profile, 'dateTime' | 'city' | 'state' | 'country'>): boolean =>
  a.dateTime === b.dateTime && a.city.trim() === b.city.trim() && a.state.trim() === b.state.trim() && a.country.trim() === b.country.trim()
