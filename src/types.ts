/** What a shortcut button casts. */
export type Kind = 'today' | 'week' | 'month' | 'year' | 'natal' | 'moon'

export const KINDS: Kind[] = ['today', 'week', 'month', 'year', 'natal', 'moon']

/** Whose chart: one person, kept in Settings. */
export interface Profile {
  name: string
  /** Birth date and time, 'YYYY-MM-DD HH:MM', local to the birthplace. */
  dateTime: string
  city: string
  state: string
  country: string
}

/** How to reach LM Studio. The token never leaves the server; `hasToken` says whether one is set. */
export interface Config {
  lmStudioUrl: string
  model: string
  /** LM Studio's reasoning level ('low', 'medium', 'off', ...); '' leaves it to the model. */
  reasoning: string
  hasToken: boolean
}

export type ReadingState = 'none' | 'writing' | 'done' | 'failed'

/**
 * One cast: a tool result (the chart or forecast, as the tool's JSON text)
 * and the reading the model wrote over it. Cast once per period and kept,
 * so reopening today's forecast is instant.
 */
export interface Casting {
  id: string
  kind: Kind
  /** The period key: a day, a week's first day, a month, 'natal'. */
  period: string
  title: string
  /** The main tool's JSON. For 'moon', an object with `void` and `lunations` inside. */
  result: string
  reading: string
  readingState: ReadingState
  readingError: string | null
  createdAt: number
}

/** A casting in the recent list: everything but the bodies. */
export type CastingSummary = Omit<Casting, 'result' | 'reading'>

/** What the reading stream sends. */
export type ReadingEvent =
  | { type: 'snapshot'; reading: string; state: ReadingState; error: string | null }
  | { type: 'delta'; text: string }
  | { type: 'done'; reading: string }
  | { type: 'error'; message: string }
