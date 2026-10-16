import type { Casting, Profile } from '../src/types.ts'
import { parseWheel } from '../src/lib/chartWheel.ts'
import { readingsInput } from '../src/lib/readings.ts'
import type { WriteRequest } from './model.ts'

/**
 * What the model is asked to write over a casting. The data it sees is the
 * tool's own result, trimmed of the parts written for a model choosing
 * tools (how_to_read, notes), so the reading can only draw on what the
 * ephemeris said.
 */

const VOICE = [
  'You are an astrologer writing a private reading for one person, addressed as "you".',
  'Warm, concrete and plain: what each contact tends to bring up, in their day-to-day terms. No preamble, no sign-off, no caveats about astrology itself, no emoji.',
  'Use only the transits, positions and dates in the data. Never add a transit the data does not list, and never work out positions yourself.',
  'Write a retrograde planet as "Saturn ℞" the first time it is named, only when the data says it is retrograde.',
  'Write in Markdown: short headings (###), short paragraphs, the odd bold phrase for the thing to remember.',
].join(' ')

const DROP = new Set(['how_to_read', 'note', 'headline_note', 'left_out'])

/** The result with the model-facing commentary taken out, as compact JSON. */
export function trimmedData(result: string): string {
  let data: unknown
  try { data = JSON.parse(result) } catch { return result }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return result
  const kept = Object.fromEntries(Object.entries(data as Record<string, unknown>).filter(([k]) => !DROP.has(k)))
  return JSON.stringify(kept)
}

const WORDS: Record<Casting['kind'], string> = {
  today: '250 to 350 words', week: '350 to 450 words', month: '450 to 600 words', year: '600 to 800 words',
  natal: '500 to 700 words', moon: '200 to 300 words',
}

function ask(casting: Casting): { task: string; data: string } {
  switch (casting.kind) {
    case 'today': {
      const wheel = parseWheel(casting.result)
      const transits = wheel ? readingsInput(wheel) : null
      let moon = ''
      try {
        const d = JSON.parse(casting.result) as { moon_phase?: { formatted?: string }; objects?: Record<string, { position?: string; house?: number }> }
        const m = d.objects?.Moon
        if (m?.position) moon = `\nTransiting Moon: ${m.position}${m.house ? `, natal house ${m.house}` : ''}${d.moon_phase?.formatted ? `, ${d.moon_phase.formatted}` : ''}.`
      } catch { /* no moon line */ }
      return {
        task: `Write today's reading (${casting.period}). Lead with the one or two contacts that matter most today (tight orbs, slower planets first), then the Moon's day, then one line to carry. ${WORDS.today}.`,
        data: (transits ?? trimmedData(casting.result)) + moon,
      }
    }
    case 'week':
      return { task: `Write the forecast for the week starting ${casting.period}. Take the headline transits in order with their dates, then the week's lunations, stations and ingresses that touch the chart, then one line to carry. ${WORDS.week}.`, data: trimmedData(casting.result) }
    case 'month':
      return { task: `Write the forecast for ${casting.title}. Take the headline transits in order with their dates, then the month's lunations and eclipses in their natal houses, then stations and ingresses worth knowing, then one line to carry. ${WORDS.month}.`, data: trimmedData(casting.result) }
    case 'year':
      return { task: `Write the forecast for the year from ${casting.period}. Open with the year's theme from the slow-planet transits, take each headline transit with its exact dates and retrograde passes, note the eclipses in their natal houses, and close with the months to watch. ${WORDS.year}.`, data: trimmedData(casting.result) }
    case 'natal':
      return { task: `Describe this birth chart. Open with the Sun, Moon and Ascendant together, then the chart's shape and patterns, then the four or five aspects that say most, then the houses that are busiest. ${WORDS.natal}.`, data: trimmedData(casting.result) }
    case 'moon':
      return { task: `Write a short guide to the next two weeks by the Moon: the void-of-course windows worth planning around (the long ones, the ones in working hours), and the coming lunations and eclipses with the natal house each falls in. ${WORDS.moon}.`, data: trimmedData(casting.result) }
  }
}

export function readingRequest(casting: Casting, profile: Profile, now = new Date()): WriteRequest {
  const { task, data } = ask(casting)
  const system = `${VOICE}\n\nThe person: ${profile.name}, born ${profile.dateTime} in ${[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}. Today is ${now.toDateString()}.`
  return { system, input: `${task}\n\nDATA:\n${data}`, maxTokens: 2400 }
}
