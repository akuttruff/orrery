/**
 * Sorting a transit table by a column: the moment it is exact, the
 * transiting body, how close the orb is, or the natal point. A click on a
 * header sorts ascending, another descending, a third puts the table back
 * in its own order. Ties keep that order, so sorting by planet groups the
 * rows without shuffling them.
 */

export type SortKey = 'when' | 'from' | 'orb' | 'to'
export type SortDir = 'asc' | 'desc'
export interface Sort { key: SortKey; dir: SortDir }

/** What a row must carry to be sorted. */
export interface Sortable {
  from: string
  to: string
  orb: number
  exact: string | null
  nearestExact?: string | null
}

/** The sort a click on `key` leads to from `current`: up, then down, then none. */
export function nextSort(current: Sort | null, key: SortKey): Sort | null {
  if (!current || current.key !== key) return { key, dir: 'asc' }
  return current.dir === 'asc' ? { key, dir: 'desc' } : null
}

/** A row's moment for the When column: when it is exact, else the nearest moment it is; none sorts last either way. */
const whenOf = (r: Sortable): string | null => r.exact ?? r.nearestExact ?? null

function compare(a: Sortable, b: Sortable, key: SortKey): number {
  switch (key) {
    case 'when': {
      const x = whenOf(a); const y = whenOf(b)
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
      return x < y ? -1 : x > y ? 1 : 0
    }
    case 'from': return a.from.localeCompare(b.from)
    case 'to': return a.to.localeCompare(b.to)
    case 'orb': return a.orb - b.orb
  }
}

/** The rows in the sort's order (a new array), or as given when there is no sort. */
export function sortRows<T extends Sortable>(rows: T[], sort: Sort | null): T[] {
  if (!sort) return rows
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows.map((row, i) => ({ row, i })).sort((a, b) => {
    const c = compare(a.row, b.row, sort.key)
    // A row with no moment stays last whichever way the dates run.
    if (sort.key === 'when' && c !== 0 && (whenOf(a.row) === null || whenOf(b.row) === null)) return c
    return c !== 0 ? c * sign : a.i - b.i
  }).map((x) => x.row)
}
