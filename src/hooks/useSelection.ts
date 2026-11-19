import { useState } from 'react'
import type { CastingSummary } from '../types.ts'

/** A casting being written can't be chosen: it would have to be stopped first. */
export const choosable = (c: CastingSummary): boolean => c.readingState !== 'writing'

export interface Selection {
  /** Null when not selecting, else the chosen ids. */
  selected: Set<string> | null
  selecting: boolean
  /** The chosen ids still in the list (one deleted elsewhere drops out). */
  chosen: string[]
  start: () => void
  stop: () => void
  toggle: (id: string) => void
  /** Every casting in a group on, or, when they are all on already, off. */
  toggleGroup: (ids: string[]) => void
  all: () => void
  none: () => void
}

/** Select mode over a list of castings, as lm-chat's chat list has it. */
export default function useSelection(castings: CastingSummary[]): Selection {
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const live = new Set(castings.filter(choosable).map((c) => c.id))
  const chosen = selected ? [...selected].filter((id) => live.has(id)) : []
  const flip = (ids: string[], on: (next: Set<string>) => boolean): void => setSelected((prev) => {
    const next = new Set(prev)
    const add = on(next)
    for (const id of ids) if (add) next.add(id); else next.delete(id)
    return next
  })
  return {
    selected,
    selecting: selected !== null,
    chosen,
    start: () => setSelected(new Set()),
    stop: () => setSelected(null),
    toggle: (id) => flip([id], (next) => !next.has(id)),
    toggleGroup: (ids) => flip(ids, (next) => !ids.every((id) => next.has(id))),
    all: () => setSelected(new Set(live)),
    none: () => setSelected(new Set()),
  }
}
