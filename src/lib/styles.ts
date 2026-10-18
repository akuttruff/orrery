/**
 * The kinds of reading the model can be asked for, chosen before the tap
 * that casts and kept on the casting. Each one is a sentence or two at the
 * seam of the brief where the tone lives (server/prompt.ts); the rules
 * about the data, honesty and format stay the same whatever the style.
 */

export type StyleId = 'balanced' | 'companion' | 'coach' | 'strategist' | 'gentle' | 'plain'

export interface ReadingStyle {
  id: StyleId
  label: string
  /** What the chip's title says. */
  hint: string
  /** What the model is told. */
  voice: string
}

export const READING_STYLES: ReadingStyle[] = [
  { id: 'balanced', label: 'Balanced', hint: 'Warm and concrete, with something to do where it helps', voice: 'Warm, concrete and unhurried. Where a contact touches their life, say what to do with it.' },
  { id: 'companion', label: 'Companion', hint: 'Keeps you company in the day; no instructions', voice: 'Sit with them. Name what the day may feel like, say that it makes sense, and keep them company in it. Offer no instructions unless the chart plainly asks for one.' },
  { id: 'coach', label: 'Coach', hint: 'One concrete thing to do for every contact', voice: 'Be their coach. For every contact, end with one concrete thing to do, avoid or schedule, and say when. Keep the why short and the what clear.' },
  { id: 'strategist', label: 'Strategist', hint: 'The day as a problem to work: leverage and decisions', voice: 'Treat the day as a problem to work. For each contact: what is in play, where the leverage is, what to decide now and what to leave alone. Direct and unsentimental.' },
  { id: 'gentle', label: 'Gentle', hint: 'Assumes you may be raw; leads with safety and choice', voice: 'Assume they may be raw today. Lead with safety and choice, never with warning. Frame hard contacts as something that can be held, and say what helps and what can wait.' },
  { id: 'plain', label: 'Plain', hint: 'What the sky is doing and what it tends to bring, nothing more', voice: 'No comfort and no advice: what the sky is doing and what it tends to bring, stated plainly, and nothing else.' },
]

export const DEFAULT_STYLE: StyleId = 'balanced'

/** The style by id, falling back to the balanced one for anything unknown or unset. */
export const styleOf = (id: string | null | undefined): ReadingStyle => READING_STYLES.find((s) => s.id === id) ?? READING_STYLES[0]!

export const isStyleId = (v: unknown): v is StyleId => typeof v === 'string' && READING_STYLES.some((s) => s.id === v)

/** The most a framing note may run to. */
export const NOTE_MAX = 600
