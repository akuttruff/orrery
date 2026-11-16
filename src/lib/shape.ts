/**
 * The shape of a reading, chosen beside its tone (lib/styles.ts): how long
 * it runs, how it is organised, what it leads with, which parts it has, how
 * it is written and how hard the model thinks first. The tone says how the
 * reading speaks; the shape says what it is made of. server/prompt.ts turns
 * a shape into the brief; the default shape asks for exactly what every
 * reading asked for before there was a choice.
 */
import type { Kind } from '../types.ts'

export type LengthId = 'glance' | 'short' | 'standard' | 'deep'
export type OrganiseId = 'contact' | 'time' | 'house' | 'planet'
export type WritingId = 'bullets' | 'mixed' | 'prose'
export type ThinkingId = '' | 'off' | 'on' | 'low' | 'medium' | 'high' | 'xhigh'
/** The parts a reading can have or leave out. */
export type PartId = 'summary' | 'theme' | 'glance' | 'carry' | 'moon' | 'actions' | 'timing' | 'reflect' | 'mantra' | 'tables'
export type FocusId = 'challenges' | 'supports' | 'personal'
export type AreaId = 'love' | 'work' | 'home' | 'self' | 'mind' | 'inner'

export interface ReadingShape {
  length: LengthId
  organise: OrganiseId
  writing: WritingId
  /** LM Studio's reasoning level for this reading and its answers; '' leaves it to Settings. */
  thinking: ThinkingId
  /** The parts switched on. */
  parts: PartId[]
  /** What to lead with; none is everything alike. */
  focus: FocusId[]
  /** The parts of life to lead with; none is all of them alike. */
  areas: AreaId[]
}

export interface Option<T extends string> {
  id: T
  label: string
  /** What the chip's popup says. */
  hint: string
}

export const LENGTHS: (Option<LengthId> & { factor: number })[] = [
  { id: 'glance', label: 'Glance', hint: 'A summary and the table, nothing per contact; about a quarter of the usual', factor: 0.25 },
  { id: 'short', label: 'Short', hint: 'Every contact, in two or three bullets each; about half the usual', factor: 0.5 },
  { id: 'standard', label: 'Standard', hint: 'Every contact with all its parts, as usual', factor: 1 },
  { id: 'deep', label: 'Deep', hint: 'More on the houses, rulers chained through, the patterns the contacts make', factor: 1.6 },
]

export const ORGANISE: Option<OrganiseId>[] = [
  { id: 'contact', label: 'By contact', hint: 'A section for each contact or placement, as usual' },
  { id: 'time', label: 'By time', hint: 'Day by day (week by week for a month, month by month for a year)' },
  { id: 'house', label: 'By house', hint: 'Grouped by the part of life each contact lands in, each house read once' },
  { id: 'planet', label: 'By planet', hint: 'Grouped by the moving planet: everything Saturn is doing, then the next' },
]

export const WRITING: Option<WritingId>[] = [
  { id: 'bullets', label: 'Bullets', hint: 'Lists wherever a part names several things, as usual' },
  { id: 'mixed', label: 'Mixed', hint: 'A sentence or two of prose to open each part, then bullets for the specifics' },
  { id: 'prose', label: 'Prose', hint: 'Short flowing paragraphs; lists only for actions' },
]

export const THINKING: Option<ThinkingId>[] = [
  { id: '', label: 'Settings', hint: 'The reasoning level set in Settings' },
  { id: 'off', label: 'Off', hint: 'No thinking first: starts fastest' },
  { id: 'on', label: 'On', hint: 'Thinks first: slower to start (a model with no levels)' },
  { id: 'low', label: 'Low', hint: 'A little thinking first' },
  { id: 'medium', label: 'Medium', hint: 'More thinking first: slower to start' },
  { id: 'high', label: 'High', hint: 'Thinks hard first: much slower to start' },
  { id: 'xhigh', label: 'Extra high', hint: 'Thinks hardest: slowest to start' },
]

/**
 * The thinking levels to offer for the model in use, from what LM Studio
 * says it takes (server/model.ts reasoningOptions): all the graded ones when
 * it can't say, none but Settings when it takes none, Off and On for an
 * on/off model.
 */
export function thinkingFor(allowed: string[] | null): Option<ThinkingId>[] {
  const settings = THINKING[0]!
  if (allowed === null) return THINKING.filter((t) => t.id !== 'on')
  return [settings, ...THINKING.filter((t) => t.id && allowed.includes(t.id))]
}

export const PARTS: Option<PartId>[] = [
  { id: 'summary', label: 'Summary first', hint: 'Three to five bullets at the top: the reading in brief' },
  { id: 'theme', label: 'The thread', hint: 'A paragraph on what runs through it all' },
  { id: 'glance', label: 'At a Glance', hint: 'The overview table' },
  { id: 'carry', label: 'To Carry', hint: 'One line to take with you, at the end' },
  { id: 'moon', label: "The Moon's day", hint: 'The Moon’s sign, phase and house, and the hours to use' },
  { id: 'actions', label: 'Actions', hint: 'What to do, for each contact; off describes without advising' },
  { id: 'timing', label: 'Best times', hint: 'A table of good windows for starting, resting and talking' },
  { id: 'reflect', label: 'Questions', hint: 'Two or three questions to journal with' },
  { id: 'mantra', label: 'Mantra', hint: 'One short line to say to yourself' },
  { id: 'tables', label: 'Tables', hint: 'Tables allowed; off turns them into lists' },
]

export const FOCUS: Option<FocusId>[] = [
  { id: 'challenges', label: 'Challenges', hint: 'Lead with the hard contacts: what to watch for and how to work with it' },
  { id: 'supports', label: 'Supports', hint: 'Lead with the easy contacts: the openings and how to use them' },
  { id: 'personal', label: 'Personal planets', hint: 'Only what the Sun, Moon, Mercury, Venus and Mars are doing; the slow planets a line each' },
]

export const AREAS: (Option<AreaId> & { where: string })[] = [
  { id: 'love', label: 'Love', hint: 'Relationships, romance, intimacy', where: 'love and relationships (the 5th, 7th and 8th houses, Venus)' },
  { id: 'work', label: 'Work & money', hint: 'Career, daily work, income', where: 'work and money (the 2nd, 6th and 10th houses, the Midheaven, Saturn)' },
  { id: 'home', label: 'Home & family', hint: 'Home, family, roots', where: 'home and family (the 4th house, the IC, the Moon)' },
  { id: 'self', label: 'Self & body', hint: 'Identity, energy, health', where: 'self and body (the 1st and 6th houses, the Ascendant, the Sun and Mars)' },
  { id: 'mind', label: 'Mind', hint: 'Thinking, talking, learning, travel', where: 'mind and communication (the 3rd and 9th houses, Mercury)' },
  { id: 'inner', label: 'Inner life', hint: 'The unconscious, healing, what is hidden', where: 'inner life (the 8th and 12th houses, Neptune and Pluto)' },
]

export const DEFAULT_SHAPE: ReadingShape = {
  length: 'standard', organise: 'contact', writing: 'bullets', thinking: '',
  parts: ['glance', 'carry', 'moon', 'actions', 'tables'], focus: [], areas: [],
}

const TRANSITS: Kind[] = ['today', 'week', 'month', 'year']

/** What each kind of reading can be shaped by; the rest is hidden for it and ignored in its brief. */
export function optionsFor(kind: Kind): { organise: OrganiseId[]; parts: PartId[]; focus: FocusId[]; areas: boolean } {
  const transits = TRANSITS.includes(kind)
  const parts: PartId[] = ['summary']
  if (kind === 'today' || kind === 'week' || kind === 'month') parts.push('theme')
  if (kind !== 'card') parts.push('glance')
  if (kind === 'today' || kind === 'week' || kind === 'month' || kind === 'card' || kind === 'spread') parts.push('carry')
  if (kind === 'today') parts.push('moon')
  if (transits || kind === 'card' || kind === 'spread') parts.push('actions')
  if (transits) parts.push('timing')
  parts.push('reflect', 'mantra', 'tables')
  return {
    organise: transits ? (kind === 'today' ? ['contact', 'house', 'planet'] : ['contact', 'time', 'house', 'planet']) : kind === 'natal' ? ['contact', 'house'] : ['contact'],
    parts,
    focus: transits ? ['challenges', 'supports', 'personal'] : kind === 'natal' ? ['challenges', 'supports'] : [],
    areas: transits || kind === 'natal',
  }
}

const pick = <T extends string>(v: unknown, from: readonly Option<T>[], fallback: T): T => (from.some((o) => o.id === v) ? v as T : fallback)
const pickAll = <T extends string>(v: unknown, from: readonly Option<T>[]): T[] =>
  Array.isArray(v) ? from.map((o) => o.id).filter((id) => v.includes(id)) : []

/** Anything as a shape: what is known kept, what is not dropped, what is missing the default. Null or junk is the default. */
export function shapeOf(v: unknown): ReadingShape {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...DEFAULT_SHAPE, parts: [...DEFAULT_SHAPE.parts] }
  const s = v as Record<string, unknown>
  return {
    length: pick(s.length, LENGTHS, DEFAULT_SHAPE.length),
    organise: pick(s.organise, ORGANISE, DEFAULT_SHAPE.organise),
    writing: pick(s.writing, WRITING, DEFAULT_SHAPE.writing),
    thinking: pick(s.thinking, THINKING, DEFAULT_SHAPE.thinking),
    parts: 'parts' in s ? pickAll(s.parts, PARTS) : [...DEFAULT_SHAPE.parts],
    focus: pickAll(s.focus, FOCUS),
    areas: pickAll(s.areas, AREAS),
  }
}

/** Whether a value is a whole, well-formed shape, for checking a request. */
export function isShape(v: unknown): v is ReadingShape {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const s = v as Record<string, unknown>
  const known = (key: string, from: readonly Option<string>[]): boolean => from.some((o) => o.id === s[key])
  const knownAll = (key: string, from: readonly Option<string>[]): boolean => Array.isArray(s[key]) && (s[key] as unknown[]).every((x) => from.some((o) => o.id === x))
  return known('length', LENGTHS) && known('organise', ORGANISE) && known('writing', WRITING) && known('thinking', THINKING)
    && knownAll('parts', PARTS) && knownAll('focus', FOCUS) && knownAll('areas', AREAS)
}

/** The shape as it applies to a kind: what the kind cannot take falls back to the default, so the brief and the label agree. */
export function shapeFor(shape: ReadingShape | null | undefined, kind: Kind): ReadingShape {
  const s = shapeOf(shape)
  const o = optionsFor(kind)
  return {
    ...s,
    organise: o.organise.includes(s.organise) ? s.organise : 'contact',
    // A part the kind does not offer keeps its default, so a day's Moon is not lost on a week and back.
    parts: PARTS.map((p) => p.id).filter((id) => (o.parts.includes(id) ? s.parts.includes(id) : DEFAULT_SHAPE.parts.includes(id))),
    focus: s.focus.filter((id) => o.focus.includes(id)),
    areas: o.areas ? s.areas : [],
  }
}

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x))

/** Whether a shape asks for nothing different from the default. */
export const isDefaultShape = (shape: ReadingShape | null | undefined): boolean => {
  const s = shapeOf(shape)
  return s.length === DEFAULT_SHAPE.length && s.organise === DEFAULT_SHAPE.organise && s.writing === DEFAULT_SHAPE.writing
    && s.thinking === DEFAULT_SHAPE.thinking && same(s.parts, DEFAULT_SHAPE.parts) && !s.focus.length && !s.areas.length
}

const label = <T extends string>(from: readonly Option<T>[], id: T): string => from.find((o) => o.id === id)?.label ?? id

/**
 * The shape in a few words, for a casting's subtitle and the closed panel:
 * only what differs from the default, so an ordinary reading says nothing.
 */
export function shapeSummary(shape: ReadingShape | null | undefined, kind: Kind): string {
  const s = shapeFor(shape, kind)
  const words: string[] = []
  if (s.length !== 'standard') words.push(label(LENGTHS, s.length))
  if (s.organise !== 'contact') words.push(label(ORGANISE, s.organise).toLowerCase())
  for (const id of s.focus) words.push(label(FOCUS, id).toLowerCase())
  for (const id of s.areas) words.push(label(AREAS, id).toLowerCase())
  const added = s.parts.filter((id) => !DEFAULT_SHAPE.parts.includes(id))
  const dropped = DEFAULT_SHAPE.parts.filter((id) => !s.parts.includes(id) && optionsFor(kind).parts.includes(id))
  for (const id of added) words.push(`+ ${label(PARTS, id).toLowerCase()}`)
  for (const id of dropped) words.push(`no ${label(PARTS, id).toLowerCase()}`)
  if (s.writing !== 'bullets') words.push(label(WRITING, s.writing).toLowerCase())
  if (s.thinking) words.push(`thinking ${label(THINKING, s.thinking).toLowerCase()}`)
  return words.join(' · ')
}
