import type { DrawnCard } from './lib/tarotSpread.ts'

/** What a shortcut button casts: a chart or forecast from the ephemeris, or a tarot draw. */
export type Kind = 'today' | 'week' | 'month' | 'year' | 'natal' | 'moon' | 'card' | 'spread'

export const KINDS: Kind[] = ['today', 'week', 'month', 'year', 'natal', 'moon', 'card', 'spread']

/** The kinds that are a tarot draw rather than a chart. */
export const TAROT_KINDS: Kind[] = ['card', 'spread']
export const isTarotKind = (kind: Kind): boolean => TAROT_KINDS.includes(kind)

/** One card as the tarot server dealt it: where it fell, which card, which way up, and what it means that way (lib/tarotSpread.ts's DrawnCard). */
export type TarotCard = DrawnCard

/** The house systems astro-mcp casts in, by the id its tools take and report. */
export type HouseSystem = 'whole_sign' | 'placidus'
export const HOUSE_SYSTEMS: { id: HouseSystem; label: string }[] = [
  { id: 'whole_sign', label: 'Whole sign' },
  { id: 'placidus', label: 'Placidus' },
]
export const isHouseSystem = (v: unknown): v is HouseSystem => HOUSE_SYSTEMS.some((h) => h.id === v)

/** Whose chart: one person, kept in Settings. */
export interface Profile {
  name: string
  /** Birth date and time, 'YYYY-MM-DD HH:MM', local to the birthplace. */
  dateTime: string
  city: string
  state: string
  country: string
  /** The houses every chart is cast in: natal, transits, forecasts and lunations all use the same natal cusps. */
  houseSystem: HouseSystem
}

/** How to reach LM Studio. The token never leaves the server; `hasToken` says whether one is set. */
export interface Config {
  lmStudioUrl: string
  model: string
  /** A model to use instead of `model` whenever LM Studio has it loaded; '' for none. Orrery never loads it. */
  preferredModel: string
  /** A model for short, tool-free jobs (the transit table's notes, what to remember); '' sends them to the main one. LM Studio may load it. */
  fastModel: string
  /** LM Studio's reasoning level ('low', 'medium', 'off', ...); '' leaves it to the model. */
  reasoning: string
  hasToken: boolean
  /** Whether a casting with no memory setting of its own is read with the saved memories. */
  memoryDefault: 'on' | 'off'
}

/** One thing Orrery remembers about the person (see server/memory.ts). */
export interface Memory {
  id: string
  text: string
  createdAt: number
  updatedAt: number
}

/** A memory as noted on a follow-up: what was saved from that question. */
export type Remembered = Pick<Memory, 'id' | 'text'>

export type ReadingState = 'none' | 'writing' | 'done' | 'failed'

/** One tool the model called while answering: ok is null until the call returns, then the result is kept with it. */
export interface ToolUse {
  name: string
  ok: boolean | null
  /** The MCP server it came from, e.g. "mcp/astrology-v2". */
  plugin?: string
  /** What it was called with. */
  args?: Record<string, unknown>
  /** What it returned, or why it failed. */
  output?: string
}

/** A stretch of the model's thinking, as LM Studio streams it; done once the model moved on. */
export interface ReasoningStep {
  kind: 'reasoning'
  text: string
  done: boolean
  /** How long it thought, in seconds, once done. */
  seconds?: number
}

export interface ToolStep extends ToolUse {
  kind: 'tool'
}

/** What the model did on the way to its text, in order: thought, called a tool, thought again. */
export type Step = ReasoningStep | ToolStep

/** LM Studio's own numbers for one turn, from its final chat.end event; token counts cover every tool round. */
export interface ReplyStats {
  model: string
  inputTokens: number
  outputTokens: number
  /** Of outputTokens, how many were thinking. */
  reasoningTokens: number
  tokensPerSecond: number
  /** Seconds before the first token: prompt reading, or a wait in LM Studio's queue. */
  firstTokenSeconds: number
}

/** How a reading or answer was written: the model's trail, what it cost, and when. */
export interface Written {
  trail: Step[]
  stats: ReplyStats | null
  startedAt: number | null
  finishedAt: number | null
}

export const NOT_WRITTEN: Written = { trail: [], stats: null, startedAt: null, finishedAt: null }

/**
 * One cast: a tool result (the chart or forecast, as the tool's JSON text)
 * and the reading the model wrote over it. Every tap casts anew and the
 * earlier castings are kept, so a day can hold several readings of a kind.
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
  /** When something last happened here: the reading written, a question asked or answered. */
  updatedAt: number
  /** Per-casting memory switch; null inherits Settings' default (Config.memoryDefault). */
  memory: boolean | null
  /** The saved memories the reading was written with, by id; empty when written without. */
  memoriesUsed: string[]
  /** Memories this casting leaves out of its reading and answers, by id, chosen by the person. */
  memoryExcluded: string[]
  /** How the reading was written. A casting in a list carries no trail. */
  written: Written
  /**
   * On a transit wheel, a sentence for each aspect by its key (see lib/readings.ts),
   * for the popup over it; null until the model has written them.
   */
  transitReadings: Record<string, string> | null
  /** The kind of reading asked for (see lib/styles.ts); null is the balanced one. */
  style: string | null
  /** What the person wanted from the reading, in their words; '' when they said nothing. */
  note: string
  /** The brief the reading was last written with, kept for anyone who wants to see it; null until a reading starts. */
  brief: Brief | null
  /** Starred by the person: kept at the top of its kind in the lists. */
  starred: boolean
}

/** The prompt a reading was written with: the system part, and the task without the data under it. */
export interface Brief {
  system: string
  task: string
}

/** A casting in the recent list: everything but the bodies, and how many questions were asked under it. */
export type CastingSummary = Omit<Casting, 'result' | 'reading' | 'transitReadings' | 'brief'> & { questions: number }

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
  /** What was saved to memory from this question: null while that is still being worked out, [] when nothing was (or memory was off). */
  remembered: Remembered[] | null
  /** The saved memories the answer was written with, by id; empty when written without. */
  memoriesUsed: string[]
  /** How the answer was written: thinking and tool calls in order, cost and timing. */
  written: Written
  /** A card pulled beside the reading, when this follow-up is one; the answer reads it against the reading. */
  card: TarotCard | null
}

/** What the reading stream sends: the text as pieces, the thinking as pieces, the trail whenever its shape changes. */
export type ReadingEvent =
  | { type: 'snapshot'; reading: string; state: ReadingState; error: string | null; written: Written; status?: string | null }
  /** What LM Studio is doing now: "Reading the prompt 63%", "Thinking", "Writing". */
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'trail'; trail: Step[] }
  | { type: 'done'; reading: string; written: Written }
  | { type: 'error'; message: string; written: Written }
