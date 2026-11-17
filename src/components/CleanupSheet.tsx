import { useState } from 'react'
import { Star, X } from 'lucide-react'
import { api } from '../lib/api.ts'
import { KIND_LABEL, KIND_ORDER, byPlace } from '../lib/kinds.ts'
import { formatWhen } from '../lib/when.ts'
import type { CastingSummary } from '../types.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/** The quick picks: every unstarred casting not changed for this long. */
const OLDER_THAN: { label: string; days: number }[] = [
  { label: 'Older than a week', days: 7 },
  { label: 'Older than a month', days: 30 },
  { label: 'Older than 3 months', days: 90 },
]

interface CleanupSheetProps {
  castings: CastingSummary[]
  /** After the delete: the ids that went, for the caller to close one that was open. */
  onRemoved: (ids: string[]) => void
  onClose: () => void
  /** For tests: the time the quick picks count back from. */
  now?: number
}

/**
 * Clearing out castings many at a time: a box on each, a box on each kind
 * for the lot of it, and quick picks for the old ones (starred ones are
 * left out of those, never out of a hand pick). One delete takes the
 * chosen castings with their readings and questions, after a second tap.
 * A casting being written can't be chosen; it would have to be stopped first.
 */
export default function CleanupSheet({ castings, onRemoved, onClose, now: fixedNow }: CleanupSheetProps) {
  // The quick picks count back from when the list was opened.
  const [now] = useState(() => fixedNow ?? Date.now())
  const [chosen, setChosen] = useState<Set<string>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const choosable = castings.filter((c) => c.readingState !== 'writing')
  const groups = KIND_ORDER
    .map((kind) => ({ kind, items: castings.filter((c) => c.kind === kind).sort(byPlace) }))
    .filter((g) => g.items.length > 0)

  const choose = (ids: string[], on: boolean): void => {
    setConfirming(false)
    setChosen((cur) => {
      const next = new Set(cur)
      for (const id of ids) if (on) next.add(id); else next.delete(id)
      return next
    })
  }
  const only = (ids: string[]): void => { setConfirming(false); setChosen(new Set(ids)) }
  const olderThan = (days: number): string[] => choosable.filter((c) => !c.starred && c.updatedAt < now - days * DAY_MS).map((c) => c.id)

  const remove = async (): Promise<void> => {
    const ids = [...chosen]
    setBusy(true)
    setError(null)
    try {
      await api.removeMany(ids)
      setChosen(new Set())
      setConfirming(false)
      onRemoved(ids)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const n = chosen.size
  const what = n === 1 ? '1 casting' : `${n} castings`
  return (
    <div className="sheet cleanup-sheet" role="dialog" aria-label="Clear out castings">
      <header className="sheet-head">
        <h2>Clear out castings</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="sheet-body">
        {castings.length === 0 ? <p className="reading-status">No castings kept.</p> : (
          <>
            <div className="cleanup-picks" role="group" aria-label="Quick picks">
              {OLDER_THAN.map(({ label, days }) => {
                const ids = olderThan(days)
                return <button key={days} type="button" className="chip" disabled={busy || ids.length === 0} title="Starred castings are left out" onClick={() => only(ids)}>{label} · {ids.length}</button>
              })}
              <button type="button" className="chip" disabled={busy} onClick={() => only(choosable.map((c) => c.id))}>All</button>
              <button type="button" className="chip" disabled={busy || n === 0} onClick={() => only([])}>None</button>
            </div>
            {groups.map(({ kind, items }) => {
              const ids = items.filter((c) => c.readingState !== 'writing').map((c) => c.id)
              const on = ids.filter((id) => chosen.has(id)).length
              return (
                <section key={kind} className="cleanup-group" aria-label={KIND_LABEL[kind]}>
                  <label className="cleanup-group-head">
                    <input
                      type="checkbox"
                      checked={ids.length > 0 && on === ids.length}
                      ref={(el) => { if (el) el.indeterminate = on > 0 && on < ids.length }}
                      disabled={busy || ids.length === 0}
                      aria-label={`All of ${KIND_LABEL[kind]}`}
                      onChange={(e) => choose(ids, e.target.checked)}
                    />
                    <span>{KIND_LABEL[kind]}</span>
                    <span className="cleanup-count">{on > 0 ? `${on} of ${items.length}` : items.length}</span>
                  </label>
                  <ul className="cleanup-list">
                    {items.map((c) => {
                      const writing = c.readingState === 'writing'
                      return (
                        <li key={c.id}>
                          <label className={`cleanup-row${writing ? ' writing' : ''}`} title={writing ? 'Being written; stop it first' : undefined}>
                            <input type="checkbox" checked={chosen.has(c.id)} disabled={busy || writing} aria-label={c.title} onChange={(e) => choose([c.id], e.target.checked)} />
                            <span className="cleanup-main">
                              <span className="cleanup-title">{c.starred && <Star size={12} className="starred" aria-label="Starred" />}{c.title}</span>
                              <span className="cleanup-when">{writing ? 'writing' : formatWhen(c.updatedAt)}{c.questions > 0 ? ` · ${c.questions === 1 ? '1 question' : `${c.questions} questions`}` : ''}</span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </>
        )}
      </div>
      <footer className="sheet-foot cleanup-foot">
        {error && <p className="reading-status error" role="alert">{error}</p>}
        {confirming ? (
          <div className="cleanup-confirm" role="alert">
            <span>Delete {what} with their readings and questions? This can't be undone.</span>
            <span className="cleanup-buttons">
              <button type="button" className="chip" disabled={busy} onClick={() => setConfirming(false)}>Keep them</button>
              <button type="button" className="chip danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : `Delete ${what}`}</button>
            </span>
          </div>
        ) : (
          <div className="cleanup-confirm">
            <span>{n === 0 ? 'Nothing chosen' : `${what} chosen`}</span>
            <button type="button" className="chip danger" disabled={n === 0} onClick={() => setConfirming(true)}>Delete{n > 0 ? ` ${n}` : ''}</button>
          </div>
        )}
      </footer>
    </div>
  )
}
