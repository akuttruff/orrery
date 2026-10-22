/** The spreads a tarot casting can be dealt, as tarot-mcp names them, and what to call each. */
export const SPREADS = ['single', 'three', 'situation', 'celtic-cross'] as const
export type SpreadId = typeof SPREADS[number]
export const isSpreadId = (v: unknown): v is SpreadId => typeof v === 'string' && (SPREADS as readonly string[]).includes(v)
export const SPREAD_LABEL: Record<SpreadId, string> = { single: 'One card', three: 'Past, present, future', situation: 'Situation, obstacle, advice', 'celtic-cross': 'Celtic Cross' }
export const SPREAD_HINT: Record<SpreadId, string> = { single: 'One card for one question', three: 'Where it came from, where it stands, where it goes', situation: 'What is going on, what is in the way, what to do', 'celtic-cross': 'Ten cards, for a question with many sides' }
export const DEFAULT_SPREAD: SpreadId = 'three'
