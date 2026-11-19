import { useState } from 'react'
import { Star } from 'lucide-react'
import { KIND_LABEL, KIND_ORDER, byPlace } from '../lib/kinds.ts'
import { formatWhen } from '../lib/when.ts'
import type { CastingSummary, Kind } from '../types.ts'
import { GroupBox, SelectBar, SelectRow, SelectToggle } from './SelectMode.tsx'
import useSelection from '../hooks/useSelection.ts'

/** How many of a kind the list shows before it offers the rest. */
export const SHOWN_PER_KIND = 4

interface RecentProps {
  castings: CastingSummary[]
  onOpen: (id: string) => void
  /** Select mode: delete the chosen castings in one go (with an Undo, the caller's). */
  onDeleteMany?: (ids: string[]) => Promise<void>
}

/**
 * The castings kept, grouped by kind in the tiles' order, the most recently
 * changed first within each group. A casting's time is its last change: the
 * reading written, a question asked or answered. Long groups fold to a few.
 */
export default function Recent({ castings, onOpen, onDeleteMany }: RecentProps) {
  const [expanded, setExpanded] = useState<Set<Kind>>(() => new Set())
  const selection = useSelection(castings)
  const groups = KIND_ORDER
    .map((kind) => ({ kind, items: castings.filter((c) => c.kind === kind).sort(byPlace) }))
    .filter((g) => g.items.length > 0)
  if (groups.length === 0 && !selection.selecting) return null
  const toggle = (kind: Kind): void => setExpanded((cur) => {
    const next = new Set(cur)
    if (next.has(kind)) next.delete(kind); else next.add(kind)
    return next
  })
  return (
    <section className="recent" aria-label="Recent castings">
      <div className="recent-head">
        <h3 className="section-title">Recent</h3>
        {onDeleteMany && <SelectToggle selection={selection} />}
      </div>
      {selection.selecting && onDeleteMany && <SelectBar selection={selection} onDelete={onDeleteMany} />}
      {groups.map(({ kind, items }) => {
        // While selecting, every casting is shown: a group's box takes the ones folded away too.
        const open = expanded.has(kind) || selection.selecting
        const shown = open ? items : items.slice(0, SHOWN_PER_KIND)
        return (
          <section key={kind} className="recent-group" aria-label={KIND_LABEL[kind]}>
            <h4 className="recent-group-head">{selection.selecting ? <GroupBox selection={selection} label={KIND_LABEL[kind]} items={items} /> : KIND_LABEL[kind]}</h4>
            <ul className="recent-list">
              {shown.map((c) => selection.selecting
                ? <li key={c.id}><SelectRow casting={c} selection={selection} /></li>
                : <RecentRow key={c.id} casting={c} onOpen={() => onOpen(c.id)} />)}
            </ul>
            {items.length > SHOWN_PER_KIND && !selection.selecting && (
              <button type="button" className="link recent-more" aria-expanded={open} onClick={() => toggle(kind)}>
                {open ? 'Show fewer' : `Show ${items.length - SHOWN_PER_KIND} more`}
              </button>
            )}
          </section>
        )
      })}
    </section>
  )
}

const STATE_LABEL: Record<CastingSummary['readingState'], string> = { none: 'cast', writing: 'writing', done: 'read', failed: 'failed' }

function RecentRow({ casting: c, onOpen }: { casting: CastingSummary; onOpen: () => void }) {
  const questions = c.questions === 1 ? '1 question' : c.questions > 1 ? `${c.questions} questions` : null
  return (
    <li>
      <button type="button" onClick={onOpen}>
        <span className="recent-title">{c.starred && <Star size={12} className="starred" aria-label="Starred" />}{c.title}</span>
        <span className="recent-state">{STATE_LABEL[c.readingState]}{questions ? ` · ${questions}` : ''} · {formatWhen(c.updatedAt)}</span>
      </button>
    </li>
  )
}
