/** The Moon casting's result: void-of-course windows and the coming lunations, parsed for the page. */

export interface VoidPeriod {
  moonIn: string
  from: string
  until: string
  enters: string
  hours: number
  beganWith: string | null
}

export interface Lunation {
  event: string
  exact: string
  position: string | null
  natalHouse: number | null
  contacts: string[]
}

export interface MoonData {
  range: { start: string; end: string } | null
  voidNow: VoidPeriod | null
  voids: VoidPeriod[]
  lunations: Lunation[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function voidOf(raw: unknown): VoidPeriod | null {
  if (!isRecord(raw)) return null
  const moonIn = str(raw.moon_in)
  const from = str(raw.void_from)
  const until = str(raw.void_until)
  const enters = str(raw.enters)
  if (!moonIn || !from || !until || !enters) return null
  return { moonIn, from, until, enters, hours: num(raw.hours) ?? 0, beganWith: str(raw.began_with) }
}

export function parseMoon(result: string): MoonData | null {
  let data: unknown
  try { data = JSON.parse(result) } catch { return null }
  if (!isRecord(data)) return null
  const v = isRecord(data.void) ? data.void : {}
  const l = isRecord(data.lunations) ? data.lunations : {}
  const range = isRecord(v.range) && str(v.range.start) && str(v.range.end) ? { start: str(v.range.start)!, end: str(v.range.end)! } : null
  const voids = Array.isArray(v.periods) ? v.periods.map(voidOf).filter((p): p is VoidPeriod => p !== null) : []
  const lunations: Lunation[] = []
  if (Array.isArray(l.events)) {
    for (const e of l.events) {
      if (!isRecord(e)) continue
      const event = str(e.event)
      const exact = str(e.exact)
      if (!event || !exact) continue
      lunations.push({
        event, exact, position: str(e.position), natalHouse: num(e.natal_house),
        contacts: Array.isArray(e.contacts) ? e.contacts.filter((c): c is string => typeof c === 'string') : [],
      })
    }
  }
  return { range, voidNow: voidOf(v.void_now), voids, lunations }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'Thu Oct 15, 2:56 PM' from the tools' 'YYYY-MM-DD HH:MM'. */
export function whenText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const day = `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`
  if (!m[4]) return day
  const h = Number(m[4])
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${day}, ${hour}:${m[5]} ${h < 12 ? 'AM' : 'PM'}`
}

/** Just the clock part: '2:56 PM'. */
export function timeText(iso: string): string {
  const t = whenText(iso)
  const i = t.indexOf(', ')
  return i < 0 ? t : t.slice(i + 2)
}

export const hoursText = (h: number): string => (h >= 24 ? `${Math.round(h / 24 * 10) / 10} d` : `${Math.round(h * 10) / 10} h`)
