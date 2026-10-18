import { useState } from 'react'
import { KIND_LABEL, KIND_ORDER } from '../lib/kinds.ts'
import { formatWhen } from '../lib/when.ts'
import type { CastingSummary, Kind } from '../types.ts'

/** How many of a kind the list shows before it offers the rest. */
export const SHOWN_PER_KIND = 4

interface RecentProps {
  castings: CastingSummary[]
  onOpen: (id: string) => void
}

/**
 * The castings kept, grouped by kind in the tiles' order, the most recently
 * changed first within each group. A casting's time is its last change: the
 * reading written, a question asked or answered. Long groups fold to a few.
 */
export default function Recent({ castings, onOpen }: RecentProps) {
  const [expanded, setExpanded] = useState<Set<Kind>>(() => new Set())
  const groups = KIND_ORDER
    .map((kind) => ({ kind, items: castings.filter((c) => c.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt) }))
    .filter((g) => g.items.length > 0)
  if (groups.length === 0) return null
  const toggle = (kind: Kind): void => setExpanded((cur) => {
    const next = new Set(cur)
    if (next.has(kind)) next.delete(kind); else next.add(kind)
    return next
  })
  return (
    <section className="recent" aria-label="Recent castings">
      <h3 className="section-title">Recent</h3>
      {groups.map(({ kind, items }) => {
        const open = expanded.has(kind)
        const shown = open ? items : items.slice(0, SHOWN_PER_KIND)
        return (
          <section key={kind} className="recent-group" aria-label={KIND_LABEL[kind]}>
            <h4 className="recent-group-head">
              <span className="recent-kind">{KIND_LABEL[kind]}</span>
              <span className="recent-count">{items.length}</span>
            </h4>
            <ul className="recent-list">
              {shown.map((c) => <RecentRow key={c.id} casting={c} onOpen={() => onOpen(c.id)} />)}
            </ul>
            {items.length > SHOWN_PER_KIND && (
              <button type="button" className="link recent-more" aria-expanded={open} onClick={() => toggle(kind)}>
                {open ? 'Show fewer' : `Show all ${items.length}`}
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
        <span className="recent-title">{c.title}</span>
        <span className="recent-state">{STATE_LABEL[c.readingState]}{questions ? ` · ${questions}` : ''} · {formatWhen(c.updatedAt)}</span>
      </button>
    </li>
  )
}
