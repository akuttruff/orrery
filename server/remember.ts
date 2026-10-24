import type { Memory, Profile } from '../src/types.ts'
import type { WriteRequest } from './model.ts'

/**
 * What a question reveals about the person, worth keeping: the one place
 * Orrery learns anything, since the readings themselves are written from
 * the ephemeris. The model is asked for the durable facts in a question,
 * as a JSON list, and each is saved to the shared pool unless already
 * there.
 */

const VOICE = [
  'You keep notes about one person for an astrologer who writes their readings.',
  'From the question below, which the person asked about a reading, pick out what it tells you about them that could colour a later reading: people in their life, work, home, health, money, plans and dates, what they are going through or trying, changes they mention however small (a new haircut, a trip, a habit), and how they feel about any of it or like readings written.',
  'Leave out the question itself, anything about the chart or planets, and anything already known.',
  'Write each fact as one short standalone sentence about "the user", in the past or present as the person put it, with dates where they gave them.',
  'Reply with a JSON array of strings only, [] when there is nothing to keep.',
].join(' ')

/** Room for a handful of sentences and the brackets around them. */
const MAX_TOKENS = 1500

/** How long the note-taking may take. It is a short answer; past this the model is stuck, and the follow-up should not wait on it forever. */
export const REMEMBER_TIMEOUT_MS = 120_000

export function rememberRequest(question: string, known: Memory[], profile: Profile, now = new Date()): WriteRequest {
  const system = [
    VOICE,
    `The person: ${profile.name}. Today is ${now.toDateString()}.`,
    known.length ? `Already known (do not repeat):\n${known.map((m) => `- ${m.text}`).join('\n')}` : 'Nothing is known yet.',
  ].join('\n\n')
  return { system, input: `The question:\n${question}`, maxTokens: MAX_TOKENS }
}

/**
 * The model's answer as facts: a JSON array of strings, possibly fenced or
 * wrapped in a remark. Anything that is not a short sentence of text is
 * dropped; nothing usable gives an empty list.
 */
export function parseFacts(text: string, max = 6): string[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let parsed: unknown
  try { parsed = JSON.parse(text.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  const out: string[] = []
  for (const item of parsed) {
    if (typeof item !== 'string') continue
    const fact = item.replace(/\s+/g, ' ').trim()
    if (fact.length < 8 || fact.length > 400) continue
    if (!out.includes(fact)) out.push(fact)
    if (out.length >= max) break
  }
  return out
}
