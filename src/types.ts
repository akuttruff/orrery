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
  /** Whether a casting with no memory setting of its own is read with the saved memories. */
  memoryDefault: 'on' | 'off'
}

/** One saved memory, as the memory MCP server stores it (see server/memory.ts). */
export interface Memory {
  id: string
  text: string
  createdAt: number
  updatedAt: number
}

/** A memory as noted on a follow-up: what was saved from that question. */
export type Remembered = Pick<Memory, 'id' | 'text'>

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
  /** Per-casting memory switch; null inherits Settings' default (Config.memoryDefault). */
  memory: boolean | null
  /** The saved memories the reading was written with, by id; empty when written without. */
  memoriesUsed: string[]
}

/** A casting in the recent list: everything but the bodies. */
export type CastingSummary = Omit<Casting, 'result' | 'reading'>

/**
 * A question asked under a reading and the model's answer, written on the
 * server like the reading itself. The whole thread so far goes back to the
 * model with each new question, so an answer can refer to an earlier one.
 */
export interface FollowUp {
  id: string
  castingId: string
  question: string
  answer: string
  state: ReadingState
  error: string | null
  createdAt: number
  /** What was saved to memory from this question; null while that is still being worked out, or when memory was off. */
  remembered: Remembered[] | null
}

/** What the reading stream sends. */
export type ReadingEvent =
  | { type: 'snapshot'; reading: string; state: ReadingState; error: string | null }
  | { type: 'delta'; text: string }
  | { type: 'done'; reading: string }
  | { type: 'error'; message: string }
