import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { type Wheel, ordinal } from '../lib/chartWheel.ts'
import { activeTransits, aspectCell, bodyCell, dayParts, dayText, orbText, windowText } from '../lib/transitTable.ts'
import { type ForecastTable, keyTransits, periodText } from '../lib/forecastTable.ts'
import { nextSort, sortRows, type Sort, type SortKey, type Sortable } from '../lib/sortRows.ts'

/** The four columns, each sortable: a click sorts up, another down, a third goes back to the table's own order. */
const COLUMNS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'when', label: 'When', hint: 'by the moment it is exact' },
  { key: 'from', label: 'Transit', hint: 'by the transiting body' },
  { key: 'orb', label: 'Aspect', hint: 'by how close the orb is' },
  { key: 'to', label: 'Natal', hint: 'by the natal point' },
]

function SortHead({ sort, onSort }: { sort: Sort | null; onSort: (key: SortKey) => void }) {
  return (
    <thead>
      <tr>
        {COLUMNS.map(({ key, label, hint }) => {
          const on = sort?.key === key ? sort.dir : null
          return (
            <th key={key} aria-sort={on === 'asc' ? 'ascending' : on === 'desc' ? 'descending' : 'none'}>
              <button type="button" className={`tt-sort${on ? ' on' : ''}`} title={`Sort ${hint}`} onClick={() => onSort(key)}>
                {label}
                {on === 'asc' && <ArrowUp size={11} aria-label="ascending" />}
                {on === 'desc' && <ArrowDown size={11} aria-label="descending" />}
              </button>
            </th>
          )
        })}
      </tr>
    </thead>
  )
}

/** The rows in the chosen order, with the header to choose it and a way back to the table's own order. */
function useSorted<T extends Sortable>(rows: T[]): { rows: T[]; sort: Sort | null; onSort: (key: SortKey) => void; reset: () => void } {
  const [sort, setSort] = useState<Sort | null>(null)
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort])
  return { rows: sorted, sort, onSort: (key) => setSort((cur) => nextSort(cur, key)), reset: () => setSort(null) }
}

function Caption({ text, sort, onReset }: { text: string; sort: Sort | null; onReset: () => void }) {
  return (
    <caption>
      {text}
      {sort && <> · <button type="button" className="link tt-reset" onClick={onReset}>default order</button></>}
    </caption>
  )
}

function Body({ name, retrograde }: { name: string; retrograde: boolean }) {
  const cell = bodyCell(name, retrograde)
  return (
    <span className="tt-body">
      {cell.glyph && <span className="tt-glyph" aria-hidden="true">{cell.glyph}</span>}
      {cell.name}
      {retrograde && <span className="wheel-rx" title="retrograde"> ℞</span>}
    </span>
  )
}

function Aspect({ type }: { type: string }) {
  const cell = aspectCell(type)
  return (
    <span className={`tt-aspect tt-${cell.family}`}>
      {cell.glyph && <span className="tt-glyph" aria-hidden="true">{cell.glyph}</span>}
      {cell.name}
    </span>
  )
}

function Natal({ name, retrograde = false, house }: { name: string; retrograde?: boolean; house: number | null }) {
  return (
    <>
      <Body name={name} retrograde={retrograde} />
      {house !== null && <span className="tt-house"> · {ordinal(house)}</span>}
    </>
  )
}

/** "Oct 6 16:36" on top; dim when it has passed. Over the movement, or the days in orb. */
/** A moment as "Dec 7, 2025 16:36", breakable only between the day and the time. */
function Day({ iso, on }: { iso: string; on: string | null }) {
  const { day, time } = dayParts(iso, on)
  return <>{<span className="tt-date">{day}</span>}{time && <> <span className="tt-date">{time}</span></>}</>
}

function When({ exact, past, nearest, under, on, pass, passes }: {
  exact: string | null; past: boolean; nearest?: string | null; under: string | null; on: string | null; pass: string | null; passes: string[]
}) {
  const shown = exact ?? nearest ?? null
  return (
    <td className="tt-when">
      {exact
        ? <span className={past ? 'tt-near' : 'tt-exact'}>{past ? 'was exact ' : 'exact '}<Day iso={exact} on={on} /></span>
        : nearest
          ? <span className="tt-near" title="in orb through these days; the nearest moment it is exact">{past ? 'was exact ' : 'exact '}<Day iso={nearest} on={on} /></span>
          : <span className="tt-house" title="in orb, not exact within reach of the search">—</span>}
      {under && <div className="tt-pos">{under}</div>}
      {pass && <Run pass={pass} others={passes.filter((p) => p !== shown)} on={on} />}
    </td>
  )
}

/** "pass 1 of 3 · also Feb 21, 2027 · Jun 2, 2027": the rest of a retrograde's run, so one date is never taken for the end of it. */
function Run({ pass, others, on }: { pass: string; others: string[]; on: string | null }) {
  return (
    <div className="tt-pos" title="every moment this contact is exact as the planet retrogrades over it">
      pass {pass}
      {others.map((p, i) => <span key={p}>{i === 0 ? ' · also ' : ' · '}<span className="tt-date">{dayText(p.slice(0, 10), on)}</span></span>)}
    </div>
  )
}

/**
 * The transits in play at the wheel's moment, under the wheel: each aspect
 * on it as a row in date order of its exact moment, past ones dimmed, with
 * whether it is applying or separating, each body over its position, the
 * natal house, and the aspect over its orb.
 */
export function ActiveTransits({ wheel }: { wheel: Wheel }) {
  const all = useMemo(() => activeTransits(wheel), [wheel])
  const { rows, sort, onSort, reset } = useSorted(all)
  if (rows.length === 0) return null
  return (
    <div className="tt-wrap">
      <table className="tt">
        <Caption text={`Transits on ${wheel.dateTime ? dayText(wheel.dateTime) : 'this day'}`} sort={sort} onReset={reset} />
        <SortHead sort={sort} onSort={onSort} />
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.from}|${r.type}|${r.to}`}>
              <When exact={r.exact} past={Boolean(r.exact && wheel.dateTime && r.exact < wheel.dateTime)} under={r.movement} on={wheel.dateTime ?? null} pass={r.pass} passes={r.passes} />
              <td>
                <Body name={r.from} retrograde={r.fromRetrograde} />
                {r.fromPosition && <div className="tt-pos">{r.fromPosition}</div>}
              </td>
              <td>
                <Aspect type={r.type} />
                <div className="tt-pos">orb {orbText(r.orb)}</div>
              </td>
              <td>
                <Natal name={r.to} retrograde={r.toRetrograde} house={r.toHouse} />
                {r.toPosition && <div className="tt-pos">{r.toPosition}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The key transits of a forecast, under the result: the headlines that reach
 * KEY_WEIGHT in date order. Four columns, each with a dim second line so the
 * table fits a phone: the moment it is exact over the days it is in orb
 * (when it never perfects within the period, the nearest exact moment
 * before or after it and whether it is applying or separating), each body
 * over its position, and the aspect over its orb and, when a retrograde
 * brings the contact back, which pass this is.
 */
export function ForecastTransits({ table }: { table: ForecastTable }) {
  const all = useMemo(() => keyTransits(table), [table])
  const { rows, sort, onSort, reset } = useSorted(all)
  if (rows.length === 0) return null
  return (
    <div className="tt-wrap">
      <table className="tt">
        <Caption text={`Key transits · ${periodText(table)}`} sort={sort} onReset={reset} />
        <SortHead sort={sort} onSort={onSort} />
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.from}|${r.type}|${r.to}|${r.start}|${i}`}>
              <When
                exact={r.exact}
                past={Boolean(!r.exact && r.nearestExact && r.nearestExact < r.start)}
                nearest={r.nearestExact}
                on={table.start}
                pass={r.pass}
                passes={r.passes}
                under={`in orb ${windowText(r.start, r.end)}${r.movement ? ` · ${r.movement}` : ''}`}
              />
              <td>
                <Body name={r.from} retrograde={r.fromRetrograde} />
                {r.fromPosition && <div className="tt-pos">{r.fromPosition}</div>}
              </td>
              <td>
                <Aspect type={r.type} />
                <div className="tt-pos">orb {orbText(r.orb)}</div>
              </td>
              <td>
                <Natal name={r.to} house={r.toHouse} />
                {r.toPosition && <div className="tt-pos">{r.toPosition}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
