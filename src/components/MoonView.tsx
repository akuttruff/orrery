import { hoursText, parseMoon, timeText, whenText } from '../lib/moon.ts'
import { ordinal } from '../lib/chartWheel.ts'

/** The Moon casting: void-of-course windows and the coming lunations, as two lists. */
export default function MoonView({ result }: { result: string }) {
  const moon = parseMoon(result)
  if (!moon) return null
  return (
    <div className="moon">
      {moon.voidNow && (
        <p className="moon-now">
          The Moon is void now, in {moon.voidNow.moonIn}, until <b>{whenText(moon.voidNow.until)}</b> ({moon.voidNow.enters}).
        </p>
      )}
      <h3 className="section-title">Void of course</h3>
      <ul className="moon-list">
        {moon.voids.map((p) => (
          <li key={p.from}>
            <span className="moon-day">{whenText(p.from)}</span>
            <span className="moon-span">→ {sameDay(p.from, p.until) ? timeText(p.until) : whenText(p.until)} · {hoursText(p.hours)}</span>
            <span className="moon-sub">{p.moonIn} → {p.enters}{p.beganWith ? ` · after ${p.beganWith}` : ''}</span>
          </li>
        ))}
        {moon.voids.length === 0 && <li className="moon-sub">No void periods in range.</li>}
      </ul>
      <h3 className="section-title">Lunations</h3>
      <ul className="moon-list">
        {moon.lunations.map((l) => (
          <li key={l.exact}>
            <span className="moon-day">{whenText(l.exact)}</span>
            <span className="moon-span">{cap(l.event)}{l.position ? ` at ${l.position}` : ''}</span>
            <span className="moon-sub">
              {l.natalHouse ? `${ordinal(l.natalHouse)} house` : ''}
              {l.contacts.length ? `${l.natalHouse ? ' · ' : ''}${l.contacts.join(', ')}` : ''}
            </span>
          </li>
        ))}
        {moon.lunations.length === 0 && <li className="moon-sub">No lunations in range.</li>}
      </ul>
    </div>
  )
}

const sameDay = (a: string, b: string): boolean => a.slice(0, 10) === b.slice(0, 10)
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
