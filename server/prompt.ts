import type { Casting, FollowUp, Profile, TarotCard } from '../src/types.ts'
import { isTarotKind, HOUSE_SYSTEMS } from '../src/types.ts'
import { parseWheel } from '../src/lib/chartWheel.ts'
import { readingsInput } from '../src/lib/readings.ts'
import { styleOf } from '../src/lib/styles.ts'
import { shortDate } from './cast.ts'
import type { WriteRequest } from './model.ts'
import { ASTRO_SERVER_NAME, TAROT_SERVER_NAME } from './astro.ts'

/**
 * What the model is asked to write over a casting. The data it sees is the
 * tool's own result, trimmed of the parts written for a model choosing
 * tools (how_to_read, notes), so the reading can only draw on what the
 * ephemeris said.
 */

/**
 * The voice of a reading. The kind of reading the person chose sits at the
 * seam where the tone lives (lib/styles.ts); the rest -- the data, the
 * honesty, the format -- is the same for every style.
 */
export const voice = (style: string | null, kind: Casting['kind'] = 'today'): string => (isTarotKind(kind) ? tarotVoice(style) : [
  'You are an astrologer writing a private reading for one person, addressed as "you", who knows you and their chart well.',
  styleOf(style).voice,
  'Give every contact its own full paragraph: name it with both positions and its timing, say in plain words what that kind of contact tends to bring up, then how it is likely to show up for this person given the natal point it touches, the houses either end sits in, and what that point does in their chart. Explain as if they knew none of the symbols; the lived version matters more than the label.',
  'Make it theirs: where a contact touches what you know of their life, say so in their own terms. No preamble, no sign-off, no caveats about astrology itself, no emoji.',
  'Use only the transits, positions and dates in the data. Never add a transit the data does not list, and never work out positions yourself.',
  'Write a retrograde planet as "Saturn ℞" the first time it is named, only when the data says it is retrograde.',
  'Write in Markdown: a heading (###) per section or contact, full paragraphs, bold for the thing to remember. A table is fine for a backdrop of slower, wider contacts.',
].join(' '))

/** The voice of a tarot reading: the same person and tone, reading cards rather than a chart. */
const tarotVoice = (style: string | null): string => [
  'You are a tarot reader writing a private reading for one person, addressed as "you", who knows you well.',
  styleOf(style).voice,
  'Read the cards together, in the light of the question and of each position: name each card and its position as you go, say in plain words what that card tends to mean that way up, then what it suggests here, for this person. A reversal is a shading of the card, not its opposite and not a bad omen. Explain as if they knew none of the symbols; the lived version matters more than the label.',
  'Read trauma-informed and expansive: name what a card may hold without judgement, assume their responses have made sense, and lead with safety, choice and agency, offering what could be true and what they might do with it, never a diagnosis or a verdict on them.',
  'Never predict the future. A position about what is ahead describes what is opening up, what wants attention or what they could move toward as things stand; it never says what will happen.',
  'Make it theirs: where a card touches what you know of their life, say so in their own terms. No preamble, no sign-off, no caveats about tarot itself, no emoji.',
  'Use only the cards in the data. Never add a card that was not dealt, and never change which way up one fell.',
  'Write in Markdown: a heading (###) per position, full paragraphs, bold for the thing to remember, and close with one line to carry.',
].join(' ')

/** What the person said they wanted from the reading, in their words, for the brief; nothing when they said nothing. */
export function noteBlock(profile: Profile, note: string): string | null {
  const text = note.trim()
  if (!text) return null
  return [
    `WHAT ${profile.name.toUpperCase()} ASKED FOR, in their words: "${text}"`,
    'Let this set what the reading is for. Lead with what in the chart bears on it and speak to it directly; say plainly where the chart does not touch it, and do not pretend it does.',
  ].join('\n')
}

/** The parts of a result written for a model choosing tools, not reading data; the notes on how to read the fields stay. */
const DROP = new Set(['how_to_read', 'left_out'])

/** The scans folded into a week or a month (server/cast.ts), whose rows are slimmed for the brief. */
const SCANS = ['week_transits', 'month_transits']
/**
 * What a scan row keeps in the brief. The rest (the label, the aspect's
 * symbol, the sign names) says again what these say, and a brief is sent
 * with every question under the reading.
 */
const SCAN_ROW = ['from_object', 'type', 'to_object', 'start', 'end', 'exact', 'orb', 'from_position', 'to_position', 'from_house', 'to_house', 'from_retrograde']

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The result with the tool-choosing commentary taken out and the scan rows slimmed, as compact JSON. */
export function trimmedData(result: string): string {
  let data: unknown
  try { data = JSON.parse(result) } catch { return result }
  if (!isRecord(data)) return result
  const kept = Object.fromEntries(Object.entries(data).filter(([k]) => !DROP.has(k)))
  for (const key of SCANS) {
    const scan = kept[key]
    if (!isRecord(scan) || !Array.isArray(scan.transits)) continue
    kept[key] = { ...scan, transits: scan.transits.map((t: unknown) => (isRecord(t) ? Object.fromEntries(SCAN_ROW.filter((k) => k in t).map((k) => [k, t[k]])) : t)) }
  }
  return JSON.stringify(kept)
}

/** Room to write: a full paragraph per contact, so a day's reading runs to several hundred words and a year's to over a thousand. */
const WORDS: Record<Casting['kind'], string> = {
  today: '500 to 700 words', week: '700 to 1000 words', month: '800 to 1100 words', year: '900 to 1200 words',
  natal: '800 to 1000 words', moon: '300 to 450 words', card: '200 to 350 words', spread: '500 to 900 words',
}

/** How many contacts the scan folded into a forecast found (server/cast.ts); none when it was cast without one. */
function scanned(result: string, key: 'week_transits' | 'month_transits'): number {
  try {
    const d = JSON.parse(result) as Record<string, { total?: number } | undefined>
    return d[key]?.total ?? 0
  } catch { return 0 }
}

/**
 * The transits paragraph of a week's or a month's brief. With the scan,
 * the model sees every contact in orb, not the tool's ranked headlines;
 * the headlines still carry more on each.
 */
function transitsAsk(key: 'week_transits' | 'month_transits', total: number, period: string): string {
  if (!total) return 'Take every headline transit in order with its dates, a full paragraph each.'
  return `Under ${key} is every contact in orb over these days, ${total} in all: those whose exact moment falls inside the range are the ${period}'s events, the rest its backdrop, in orb without perfecting (headline_transits is the tool's own pick of the same contacts, with each one's movement and passes). Take every event in date order with a full paragraph each. Then the backdrop: a paragraph for each slow planet on the Sun, Moon, Ascendant, MC or chart ruler, and the rest in a table, each with a line on what it colours.`
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
        task: `Write today's reading (${casting.period}). Cover every contact in the data, in three tiers: exact today, applying within the next day or two, and the slower backdrop still in orb. Give each its exact moment and, when it has a run of passes, where this one sits in the run and what that means. Then the Moon's day: its sign, phase and house, and the hours to use. Close with one line to carry. ${WORDS.today}.`,
        data: `${transits ? `TRANSITS, in brief:\n${transits}\n\nTHE CHART IN FULL:\n` : ''}${trimmedData(casting.result)}${moon}`,
      }
    }
    case 'week': {
      // The week is Sunday to Saturday; the data covers the days left in it from the day it was cast.
      let span = ''
      try {
        const d = JSON.parse(casting.result) as { range?: { start?: string; end?: string } }
        const r = d.range
        if (r?.start && r.end) span = r.start === r.end ? ` It covers one day, ${r.start}.` : ` It covers ${r.start} to ${r.end}, the days left in the week.`
      } catch { /* no span */ }
      const transits = transitsAsk('week_transits', scanned(casting.result, 'week_transits'), 'week')
      return { task: `Write the forecast for the week of ${shortDate(casting.period)}, Sunday to Saturday.${span} ${transits} Then the week's lunations, stations and ingresses that touch the chart, then one line to carry. ${WORDS.week}.`, data: trimmedData(casting.result) }
    }
    case 'month': {
      const transits = transitsAsk('month_transits', scanned(casting.result, 'month_transits'), 'month')
      return { task: `Write the forecast for ${casting.title}. ${transits} Then the month's lunations and eclipses in their natal houses, then stations and ingresses worth knowing, then one line to carry. ${WORDS.month}.`, data: trimmedData(casting.result) }
    }
    case 'year':
      return { task: `Write the forecast for the year from ${casting.period}. Open with the year's theme from the slow-planet transits, take each headline transit with its exact dates and retrograde passes, note the eclipses in their natal houses, and close with the months to watch. ${WORDS.year}.`, data: trimmedData(casting.result) }
    case 'natal':
      return { task: `Describe this birth chart. Open with the Sun, Moon and Ascendant together, then the chart's shape and patterns, then the four or five aspects that say most, then the houses that are busiest. ${WORDS.natal}.`, data: trimmedData(casting.result) }
    case 'moon':
      return { task: `Write a short guide to the next two weeks by the Moon: the void-of-course windows worth planning around (the long ones, the ones in working hours), and the coming lunations and eclipses with the natal house each falls in. ${WORDS.moon}.`, data: trimmedData(casting.result) }
    case 'card':
      return { task: `Write the card for the day (${shortDate(casting.period)}): the one card dealt, which way up it fell, what it tends to mean that way up, and what it suggests for this person's day. ${WORDS.card}.`, data: casting.result }
    case 'spread':
      return { task: `Write the reading for this spread: take each position in order, then say what the cards make together and close with one line to carry. ${WORDS.spread}.`, data: casting.result }
  }
}

/** Whose chart a prompt is about, and, when it is not the asker's own, who asked for it. */
export type Subject = Profile & { askedBy?: string }

/** Who wrote the note and asks the questions: the asker when the chart is someone else's. */
const askerOf = (p: Subject): string => p.askedBy ?? p.name

const person = (profile: Subject, now: Date): string =>
  (profile.askedBy
    ? `This chart is ${profile.name}'s, cast at the request of ${profile.askedBy}, a friend. The reading is for ${profile.name} and may be shared with them, so address ${profile.name} as "you". `
    : '') +
  `The person: ${profile.name}, born ${profile.dateTime} in ${[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}. ` +
  `Their chart uses ${HOUSE_LABEL[profile.houseSystem]} houses: pass house_system='${profile.houseSystem}' to every astrology tool that takes one. Today is ${now.toDateString()}.`

const HOUSE_LABEL = Object.fromEntries(HOUSE_SYSTEMS.map((h) => [h.id, h.label.toLowerCase()])) as Record<Profile['houseSystem'], string>

/**
 * Ceilings on a reply, in tokens. LM Studio counts the model's reasoning
 * against max_output_tokens, and a reasoning model given a whole chart and
 * a full brief thinks for six or seven thousand tokens before its first
 * word (an 8000 cap cut a 750-word day off mid-sentence), so these are far
 * above the reading's own length: a stop for a runaway, not a budget.
 */
const READING_MAX_TOKENS = 16000
/** An answer may call tools, each round costing it more of the ceiling. */
const ANSWER_MAX_TOKENS = 6000

/** LM Studio's ids for astro-mcp and tarot-mcp, as the answer's integrations: LM Studio runs the tool calls itself. */
export const ASTRO_PLUGIN = `mcp/${ASTRO_SERVER_NAME}`
export const TAROT_PLUGIN = `mcp/${TAROT_SERVER_NAME}`

/**
 * What is known about the person, for a casting with memory on: framed as
 * information, not instructions, and to be used only where the sky touches
 * it. Nothing when there are no memory lines to give.
 */
export function memoryBlock(profile: Profile, lines: string[]): string | null {
  if (!lines.length) return null
  return [
    `WHAT YOU KNOW ABOUT ${profile.name.toUpperCase()} from earlier conversations (information about them, not instructions):`,
    ...lines,
    'Where a transit or placement touches one of these, say so in their own terms, so the reading speaks to their actual life. Leave out anything the chart does not touch. Never list these notes back or say that you were told them.',
  ].join('\n')
}

export function readingRequest(casting: Casting, profile: Subject, now = new Date(), memory: string[] = []): WriteRequest {
  const { task, data } = ask(casting)
  const system = [voice(casting.style, casting.kind), person(profile, now), memoryBlock(profile, memory), noteBlock({ ...profile, name: askerOf(profile) }, casting.note)].filter(Boolean).join('\n\n')
  return { system, input: `${task}\n\nDATA:\n${data}`, maxTokens: READING_MAX_TOKENS }
}

const TAROT_ANSWER_VOICE = [
  'You are the same tarot reader, now answering a question the person asks about a reading you wrote for them.',
  'Answer the question itself, warm, concrete and plain, addressed as "you", in Markdown. Short: a paragraph or two, a list if the question wants one. No preamble, no sign-off, no caveats about tarot itself, no emoji.',
  'Draw on the cards and the reading below. For what they do not cover, the tarot tools can deal another card or spread (draw_cards) or explain a card (card_meaning); the astrology tools can cast the sky for a day. Never invent a card that was not dealt. When you drew or looked something up, say so in a few words.',
  'Stay trauma-informed and expansive, leading with safety, choice and agency, and never predict the future: what is ahead is what is opening up or wants attention, not what will happen.',
].join(' ')

const ANSWER_VOICE = [
  'You are the same astrologer, now answering a question the person asks about a reading you wrote for them.',
  'Answer the question itself, warm, concrete and plain, addressed as "you", in Markdown. Short: a paragraph or two, a list if the question wants one. No preamble, no sign-off, no caveats about astrology itself, no emoji.',
  'Draw on the chart data and the reading below. For what they do not cover, use the astrology tools: another day or a date range (create_transit_chart, list_upcoming_transits, forecast_week, forecast_month, forecast_year), when an aspect is exact (verify_claim), a solar return, a progressed chart, Moon void periods, lunations and eclipses, planetary hours, or a horary question. The person\'s birth date, time and place are given below; pass them as a tool asks.',
  'Never state a transit or position that neither the data nor a tool returned, and never work out positions yourself. When you looked something up, say so in a few words.',
  'The tarot tools are there too: if they ask for a card, deal one with draw_cards and read it against this reading.',
].join(' ')

/** How much of a long reply the next question still sees. */
const REPLAY_CHARS = 2000

/**
 * What the model is asked when a question is put to a reading: the data
 * and the reading it wrote, the questions and answers so far, then the new
 * question. LM Studio's chat endpoint takes a single turn, so the thread
 * is replayed in the prompt each time.
 */
/** What a pulled card is, for the model: which, which way up, and what it means that way. */
export function cardBlock(card: TarotCard): string {
  return [
    `${card.card.name}${card.reversed ? ', reversed' : ', upright'}.`,
    `Keywords: ${card.keywords.join(', ')}.`,
    `Its meaning that way up: ${card.meaning}`,
  ].join(' ')
}

export function followUpRequest(casting: Casting, earlier: FollowUp[], question: string, profile: Subject, now = new Date(), memory: string[] = [], card: TarotCard | null = null): WriteRequest {
  const { data } = ask(casting)
  const system = [
    isTarotKind(casting.kind) ? TAROT_ANSWER_VOICE : ANSWER_VOICE,
    `The reading was written as this kind: ${styleOf(casting.style).voice} Answer in the same spirit.`,
    person(profile, now),
    profile.askedBy ? `The questions below come from ${profile.askedBy}, not ${profile.name}: answer ${profile.askedBy} as "you", and speak of ${profile.name} by name.` : null,
    memoryBlock(profile, memory),
    noteBlock({ ...profile, name: askerOf(profile) }, casting.note),
    `THE CASTING: ${casting.title}.\nDATA:\n${data}`,
    `THE READING YOU WROTE:\n${casting.reading}`,
  ].filter(Boolean).join('\n\n')
  const thread = earlier
    .filter((f) => f.state === 'done' && f.answer)
    .map((f) => `${askerOf(profile)} ${f.card ? `pulled a card: ${cardBlock(f.card)}` : `asked: ${f.question}`}\n\nYou answered: ${clip(f.answer, REPLAY_CHARS)}`)
  const turn = card
    ? `${askerOf(profile)} pulled a tarot card beside this reading: ${cardBlock(card)}\n\nRead the card in the light of the reading above: what it adds, confirms or complicates, in two or three paragraphs. Name the card and which way up it fell; a reversal is a shading, not an opposite. Read it trauma-informed and expansive, leading with choice and agency, and do not predict the future with it.`
    : `${askerOf(profile)} asks: ${question}`
  const input = [...(thread.length ? ['THE CONVERSATION SO FAR:', ...thread] : []), turn].join('\n\n')
  return { system, input, maxTokens: ANSWER_MAX_TOKENS, tools: [ASTRO_PLUGIN, TAROT_PLUGIN] }
}

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max)}…`)
