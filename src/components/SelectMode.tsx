import { useState } from 'react'
import { CheckSquare, Star, Trash2 } from 'lucide-react'
import { formatWhen } from '../lib/when.ts'
import type { CastingSummary } from '../types.ts'
import { choosable, type Selection } from '../hooks/useSelection.ts'

/** The Select / Done button on the list's head. */
export function SelectToggle({ selection, disabled }: { selection: Selection; disabled?: boolean }) {
  return (
    <button type="button" className="select-toggle" aria-pressed={selection.selecting} disabled={disabled} onClick={selection.selecting ? selection.stop : selection.start}>
      {selection.selecting ? 'Done' : <><CheckSquare size={14} aria-hidden="true" /> Select</>}
    </button>
  )
}

/** Under the head while selecting: all, none, how many, and the delete. */
export function SelectBar({ selection, onDelete }: { selection: Selection; onDelete: (ids: string[]) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const n = selection.chosen.length
  const remove = async (): Promise<void> => {
    setBusy(true)
    try { await onDelete(selection.chosen); selection.stop() } catch { /* the caller says what went wrong */ } finally { setBusy(false) }
  }
  return (
    <div className="select-bar" role="toolbar" aria-label="Selected castings">
      <button type="button" className="link" onClick={selection.all}>Select all</button>
      <button type="button" className="link" disabled={n === 0} onClick={selection.none}>Deselect all</button>
      <span className="select-count">{n} selected</span>
      <button type="button" className="select-delete" disabled={n === 0 || busy} onClick={() => void remove()}>
        <Trash2 size={14} aria-hidden="true" /> Delete{n ? ` ${n}` : ''}
      </button>
    </div>
  )
}

/** A group's heading while selecting: a box for every casting in it. */
export function GroupBox({ selection, label, items }: { selection: Selection; label: string; items: CastingSummary[] }) {
  const ids = items.filter(choosable).map((c) => c.id)
  const on = ids.filter((id) => selection.selected?.has(id)).length
  return (
    <label className="select-group">
      <input
        type="checkbox"
        checked={ids.length > 0 && on === ids.length}
        ref={(el) => { if (el) el.indeterminate = on > 0 && on < ids.length }}
        disabled={ids.length === 0}
        aria-label={`Select every casting in ${label}`}
        onChange={() => selection.toggleGroup(ids)}
      />
      <span>{label}</span>
    </label>
  )
}

/** A row while selecting: the whole row toggles its box. No star, no bin; the bar acts on the selection. */
export function SelectRow({ casting: c, selection }: { casting: CastingSummary; selection: Selection }) {
  const checked = selection.selected?.has(c.id) ?? false
  const writing = !choosable(c)
  const questions = c.questions === 1 ? ' · 1 question' : c.questions > 1 ? ` · ${c.questions} questions` : ''
  return (
    <label className={`select-row${checked ? ' checked' : ''}${writing ? ' writing' : ''}`} title={writing ? 'Being written; stop it first' : undefined}>
      <input type="checkbox" checked={checked} disabled={writing} aria-label={c.title} onChange={() => selection.toggle(c.id)} />
      <span className="select-main">
        <span className="select-name">{c.starred && <Star size={12} className="starred" aria-label="Starred" fill="currentColor" />}{c.title}</span>
        <span className="select-time">{writing ? 'writing' : formatWhen(c.updatedAt)}{questions}</span>
      </span>
    </label>
  )
}
