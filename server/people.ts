import type { Person } from '../src/types.ts'
import type { WriteRequest } from './model.ts'

/**
 * Someone else's birth details typed as a sentence ("Jo, born June 8 1960 at
 * 9:45 AM in Pleasanton, CA") turned into the fields the chart tools take.
 * The model reads the sentence; the server checks what it wrote before a
 * person is saved, as it checks a typed profile.
 */

const VOICE = [
  'You turn a description of someone\'s birth into JSON for an astrology app.',
  'Reply with one JSON object and nothing else, with these fields: "name"; "date" as YYYY-MM-DD; "time" as HH:MM on a 24-hour clock, the local time at the birthplace (9:45 PM is 21:45, noon is 12:00, midnight is 00:00); "city"; "state"; "country".',
  'Use the name as given; a first name is fine. Put a state, province or region in "state" and a country in "country"; for a US state, "country" is "USA". Leave "state" or "country" as "" when unknown.',
  'Example: "Ana Lopez, 3/14/1988 11:20 pm, Austin Texas" -> {"name": "Ana Lopez", "date": "1988-03-14", "time": "23:20", "city": "Austin", "state": "Texas", "country": "USA"}.',
  'Example: "Kai, born 2 Feb 1993 at 7:05 in the morning in Toronto" -> {"name": "Kai", "date": "1993-02-02", "time": "07:05", "city": "Toronto", "state": "", "country": "Canada"}.',
  'Never guess. If the name, date, time or city is missing or unclear, reply {"error": "..."} naming only what is missing, for example {"error": "the birth time is missing"}.',
].join(' ')

/** What the model is asked for one description. */
export function birthRequest(text: string): WriteRequest {
  return { system: VOICE, input: `The description:\n${text.trim()}`, maxTokens: 1500, reasoning: 'off', quick: true }
}

/** What the model wrote, read: the fields for a person, or what it said is missing. Anything else is an error too. */
export function parseBirth(reply: string): { person: Omit<Person, 'id'> } | { error: string } {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return { error: "Those details couldn't be read. Try again, with the name, date, time and place." }
  let parsed: unknown
  try { parsed = JSON.parse(reply.slice(start, end + 1)) } catch { return { error: "Those details couldn't be read. Try again, with the name, date, time and place." } }
  if (!parsed || typeof parsed !== 'object') return { error: "Those details couldn't be read." }
  const o = parsed as Record<string, unknown>
  if (typeof o.error === 'string' && o.error.trim()) {
    const why = o.error.trim().replace(/\.$/, '')
    return { error: `${why.charAt(0).toUpperCase()}${why.slice(1)}. Add it and try again.` }
  }
  const text = (key: string): string => (typeof o[key] === 'string' ? (o[key] as string).trim() : '')
  // Asked for as a separate date and time (a small model drops the date from a combined field); a combined one is taken too.
  const dateTime = text('date') && text('time') ? `${text('date')} ${text('time')}` : text('dateTime')
  return { person: { name: text('name'), dateTime, city: text('city'), state: text('state'), country: text('country') } }
}
