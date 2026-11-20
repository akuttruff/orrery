import fs from 'node:fs'
import path from 'node:path'
import { Store } from '../server/store.ts'
import { Memories, memoryPath } from '../server/memory.ts'
import { withScan } from '../server/cast.ts'
import type { ReplyStats, Step } from '../src/types.ts'

/**
 * Fills the development database (.data-dev, the one `npm run dev` uses)
 * with demo castings for the fictional demo person the test fixtures
 * belong to, with readings and a question already written, so the app can
 * be screenshotted. Run with `npm run seed:demo`; it starts from an empty
 * database every time and copies nothing from lm-chat.
 */

const dir = path.resolve(process.cwd(), '.data-dev')
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })
const store = new Store(dir, path.join(dir, 'no-such-seed.sqlite'))
const fixture = (name: string): string => fs.readFileSync(path.resolve('src/test/fixtures', `${name}.json`), 'utf8')

store.setProfile({ name: 'Sam', dateTime: '1990-06-15 14:30', city: 'New York', state: 'NY', country: 'USA' })
store.setConfig({ model: 'qwen/qwen3.8-27b', reasoning: 'low', memoryDefault: 'on' })

const stats = (out: number): ReplyStats => ({ model: 'qwen/qwen3.8-27b', inputTokens: 6400, outputTokens: out, reasoningTokens: Math.round(out * 0.3), tokensPerSecond: 41.8, firstTokenSeconds: 1.9 })
const thought = (text: string, seconds: number): Step => ({ kind: 'reasoning', text, done: true, seconds })
const brief = (task: string) => ({ system: 'You are an astrologer writing a private reading for one person, Sam, born 1990-06-15 14:30 in New York, NY, USA. Warm, concrete and unhurried.', task })

const write = (id: string, task: string, reading: string, secs: number, out: number, trail: Step[] = []): void => {
  store.beginReading(id, brief(task))
  store.finishReading(id, reading, 'done', null, { trail: [thought('Sorting the contacts by weight: Saturn on Mars is the backdrop, the Mercury contacts the day’s events.', secs), ...trail], stats: stats(out) })
}

// The birth chart, read once.
const natal = store.addCasting({ kind: 'natal', period: 'natal', title: "Sam's birth chart", result: fixture('natal-chart') })
write(natal.id, 'Describe this birth chart.', `### Sun, Moon and Ascendant

A **Gemini Sun in the ninth house** with a **Pisces Moon in the sixth** and **Libra rising**: a mind that wants to go everywhere, a heart that notices everything, and a manner that smooths the room. Venus rules the chart from Taurus in the eighth, so what steadies you is depth with one or two people rather than breadth.

### The shape

The chart leans on a tight **Jupiter–Chiron conjunction on the Midheaven** in Cancer: your work is where you are seen caring, and where an old wound became a skill. Mars in Aries on the Descendant squares it, so partners bring the friction that keeps you honest.

### Four aspects worth knowing

1. **Moon sextile Venus**, exact to a tenth of a degree: tenderness is a reflex.
2. **Jupiter trine Pluto**: conviction, and the stamina to see it through.
3. **Sun quincunx Saturn**: the recurring adjustment between curiosity and duty.
4. **Uranus opposite the Part of Fortune**: luck arrives sideways, never on schedule.`, 6.2, 980)

// The month and its scan, then the week and its scan, then today: the most recent last, so it tops the list.
const month = store.addCasting({ kind: 'month', period: '2026-10', title: 'October 2026', result: withScan('month', fixture('forecast-month'), fixture('scan-month')) })
write(month.id, 'Write the forecast for October 2026.', `### The backdrop

**Saturn on your Mars** for the whole month, exact on the 5th, is the second of three passes: effort is being tested, not punished. Pace the push. **Uranus on your Mercury** keeps the mind restless; write things down.

### The events

- **Oct 8, Mars sextile Mercury.** A quick, useful conversation.
- **Oct 12, Mars opposite the North Node.** Pushing back on where you are headed; notice who you argue with.
- **Oct 17, Mars trine Mars.** Energy returns. Use it on something physical.
- **Oct 22, Mars sextile the Ascendant.** You are easy to say yes to.
- **Oct 25, Mars square Pluto.** Do not force the locked door.

### Lunations

The **new Moon on the 10th** falls in your first house: a fresh start you can feel in the body. The **full Moon on the 26th** lights the seventh: something between you and a partner asks for attention; a good time to say what you need.`, 7.8, 1240)

const week = store.addCasting({ kind: 'week', period: '2026-10-18', title: 'Week of Oct 18', result: withScan('week', fixture('forecast-week-oct18'), fixture('scan-week')), style: 'coach', note: 'finishing the album' })
write(week.id, 'Write the forecast for the week of Oct 18, Sunday to Saturday.', `### Sunday

**Mercury trine your Moon** in the small hours and **Mercury opposite your Venus** by breakfast: say the kind thing you have been sitting on, and leave room for someone to see it differently. Good for writing liner notes in your own voice.

### Monday to Wednesday

The **Sun trine your Sun** is still warm on Monday: a good day to play the rough mixes for someone you trust. By Wednesday the Moon is in Aquarius, and a quieter day in the studio may suit you.

### Thursday

**Mars sextile your Ascendant**, exact at 07:48. If you want help with the last two songs, this is an easy day to ask for it; you come across as warm and clear.

### The backdrop

**Saturn on your Mars** separates slowly all week, and **Uranus on your Mercury** keeps the plans fluid. Mercury stations retrograde on Saturday: give anything you sign after Friday a second read.`, 5.4, 1090)
store.addFollowUp(week.id, 'Where could I make room for rest this week?')

// A busier day, fourteen contacts on the wheel, listed under the Oct 13 one.
const busy = store.addCasting({ kind: 'today', period: '2026-11-07', title: 'Today · Nov 7', result: fixture('transit-chart-nov7') })
write(busy.id, "Write today's reading (2026-11-07).", `### Today

Once a year the **Sun reaches your Pluto**, and today is the day, exact at 14:20 in your second house. What you have been understating about money or your own worth gets said plainly, by you or to you. It is not a crisis; it is the annual audit. By tomorrow before dawn the Sun trines your **Midheaven**, **Jupiter** and **Chiron** in turn, so whatever is faced today turns into standing at work.

**Venus, retrograde, squares your Saturn** for the second of three passes and still trines your Sun: a friendship or a price is being renegotiated slowly, and someone from early September comes back around warmer than before. **Mercury, also retrograde**, doubles back on a clever idea from early October and has second thoughts about the direction; write them down rather than act on them.

### The Moon

A heavy first hour, the Moon in Libra square your Saturn at 06:21, then trine your Sun by 07:03 and the mood lifts. The morning is easy company.

### The backdrop

**Jupiter sextile your Sun**, the first of three passes into next summer: doors open with little push. **Saturn square your Uranus** and sextile your North Node are the season's long argument between the old structure and the new method, and patience is winning it.

### In one line

Say the number out loud.`, 4.6, 840)
store.setTransitReadings(busy.id, {
  'Sun|Conjunction|Pluto': 'Once a year the Sun reaches your Pluto. What you have been understating about money or worth gets said plainly today.',
  'Moon|Square|Saturn': 'A heavy first hour: the to-do list looks longer than it is.',
  'Venus|Square|Saturn': 'Second pass of three: a friendship or a price being renegotiated, slowly.',
  'Mercury|Sextile|Uranus': 'Retrograde Mercury doubles back on a clever idea from early October; this time it works.',
  'Mercury|Square|True North Node': 'Second thoughts about the direction. Write them down rather than acting on them.',
  'Moon|Trine|Sun': 'By breakfast the mood lifts; the morning is easy company.',
  'Venus|Trine|Sun': 'Someone from early September comes back around, warmer than before.',
  'Jupiter|Sextile|Sun': 'The first of three passes into next summer: doors open with little push.',
  'Saturn|Square|Uranus': 'The long backdrop: the old structure and the new method, still arguing.',
  'Saturn|Sextile|True North Node': 'Patience is the way forward this season, and it is working.',
  'Sun|Trine|MC': 'Tomorrow before dawn: a quiet lift in how your work is seen.',
  'Sun|Trine|Jupiter': 'Generosity at work, yours and theirs.',
  'Sun|Trine|Chiron': 'What once hurt is now what you are consulted on.',
  'Sun|Sextile|Neptune': 'A dreamier edge to the week, fading.',
})

const today = store.addCasting({ kind: 'today', period: '2026-10-13', title: 'Today · Oct 13', result: fixture('transit-chart'), starred: true })
write(today.id, "Write today's reading (2026-10-13).", `### Today

The day belongs to **Mercury**. It sits on your natal **Pluto** this afternoon, exact at 14:42, the first of three passes: a conversation that goes deeper than planned, or a message you draft three times. Let it. By tomorrow morning the same Mercury trines your **Midheaven** and **Jupiter**, so what is said today finds its use at work.

**Saturn on your Mars** is a week past exact and still close. Energy is rationed; spend it on one thing. **Mars opposite your North Node** is separating too, so yesterday's argument about direction is already losing heat.

### The Moon

The Moon is in Scorpio in your second house all day, a few degrees from transiting Mercury: feelings about money and worth are near the surface. Nothing needs deciding.

### In one line

Say the true thing once, quietly, and then go to bed early.`, 4.1, 720)
store.setTransitReadings(today.id, {
  'Mercury|Conjunction|Pluto': 'A conversation that goes deeper than planned; one message drafted three times.',
  'Saturn|Conjunction|Mars': 'Effort rationed. A week past exact, still asking you to pace yourself.',
  'Mars|Opposition|True North Node': 'Yesterday’s argument about direction, cooling.',
  'Mercury|Trine|MC': 'What you say today is useful at work tomorrow.',
  'Mercury|Trine|Jupiter': 'A generous reading of the news; a mentor’s word lands.',
  'Uranus|Conjunction|Mercury': 'The long restlessness of mind: new tools, new names for old things.',
  'Mercury|Trine|Chiron': 'Talking about the old wound makes it a skill.',
  'Mercury|Sextile|Neptune': 'Daydreams with a thread of plan in them.',
})
const q = store.addFollowUp(today.id, 'How can I look after myself through a day like this?')
store.beginAnswer(q.id)
store.finishAnswer(q.id, `Go gently with the heavy parts. **Mercury on your Pluto** can make every message feel loaded, so it is fine to draft and not send, or to save the deep conversation for a day that feels steadier. **Saturn on your Mars** is asking you to ration energy: pick one thing that matters and let the rest be small.

The Moon in your second house points toward comfort you can touch: a proper meal, a walk, an early night. And if you want an easier day for reaching out, **Mars sextile your Ascendant** on the 22nd is a warm one.`, 'done', null, {
  trail: [thought('The question is about self-care on a heavy day. Mercury conjunct Pluto and Saturn on Mars are the weight; the Moon in the second house points to comfort. An easier day for reaching out would help; I should check the 22nd with a transit chart.', 3.6), { kind: 'tool', name: 'create_transit_chart', ok: true, plugin: 'mcp/astrology-v2', args: { date_time: '1990-06-15 14:30', city: 'New York', state: 'NY', country: 'USA', transit_date_time: '2026-10-22 12:00' }, output: '{"chart_type":"transit","date_time":"2026-10-22 12:00","aspects":[{"from_object":"Mars","to_object":"Asc","type":"Sextile","orb":0.11}]}' }],
  stats: stats(310),
})

const moon = store.addCasting({ kind: 'moon', period: '2026-10-15', title: 'Moon · Oct 15 – Oct 29', result: JSON.stringify({
  void: {
    range: { start: '2026-10-15', end: '2026-10-29' },
    void_now: null,
    periods: [
      { moon_in: 'Sagittarius', void_from: '2026-10-15 14:56', void_until: '2026-10-16 05:57', enters: 'Capricorn', hours: 15, began_with: 'Moon sextile Sun' },
      { moon_in: 'Capricorn', void_from: '2026-10-18 09:13', void_until: '2026-10-18 18:40', enters: 'Aquarius', hours: 9.5, began_with: 'Moon square Mars' },
      { moon_in: 'Pisces', void_from: '2026-10-22 20:02', void_until: '2026-10-23 06:11', enters: 'Aries', hours: 10.2, began_with: 'Moon trine Venus' },
    ],
  },
  lunations: { events: [{ event: 'full moon', exact: '2026-10-26 00:12', position: "2°46' Taurus", natal_house: 8, contacts: ['opposition natal Pluto (2.6°)'] }] },
}) })
void moon
// A three-card spread on settling into a new city, and a card for the day, dealt by tarot-mcp (the fixtures are seeded draws).
const spread = store.addCasting({ kind: 'spread', period: '2026-10-14', title: 'Past, present, future · Oct 14', result: fixture('tarot-three'), note: 'settling into a new city' })
write(spread.id, 'Write the reading for this spread.', `### Past · Six of Wands

You come to this move **having already built something**: the Six of Wands is recognition, the ride through the crowd. In the place you left, people knew you and valued you, and that is still yours, even on the days the new city feels like starting from nothing.

### Present · Queen of Swords, reversed

The present is the Queen of Swords reversed: **clarity hardened into armour**. Upright she sees clearly and speaks plainly; reversed, that sharpness may be keeping new people at a distance, often for good reasons, after a lot of change at once. You get to choose when, and with whom, to soften.

### Future · The Chariot, reversed

The Chariot reversed is energy pulling two ways: the old life and the new one, both asking for you. In this position it describes what is opening up, not what will happen: a chance to pause and **decide what you actually want this city to be for you**. Momentum tends to come once it has somewhere to go.

**One line to carry:** you have been known before; you can let yourself be known again, at your own pace.`, 5.8, 640)

const dayCard = store.addCasting({ kind: 'card', period: '2026-10-14', title: 'Card · Oct 14', result: fixture('tarot-card') })
write(dayCard.id, 'Write the card for the day.', `### Five of Pentacles, reversed

The day's card is the Five of Pentacles reversed: **coming in from the cold**. Whatever has felt short this week, money, company, sleep, the card suggests the hardest stretch may be easing, and that asking for what you need is allowed.

What it invites today is small: if help is offered, you could let yourself say yes to one thing you would normally wave off.

**One line to carry:** you are allowed to come in where it is warm.`, 3.1, 260)

const year = store.addCasting({ kind: 'year', period: '2026-10-14', title: 'Year from Oct 14', result: fixture('forecast-year') })
void year

const memories = new Memories(memoryPath(dir))
memories.remember('Works nights, so mornings are slow and evenings are for calls.')
memories.remember('Finishing a first album this autumn; mixing on weekends.')
memories.remember('Moved to Lisbon this summer.')
console.log(`seeded ${dir}`)
