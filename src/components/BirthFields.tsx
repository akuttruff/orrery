import { useState } from 'react'
import { birthLine, sameBirth } from '../lib/open.ts'
import type { Profile } from '../types.ts'

/** Birth details on their own, without whose they are. */
export type Birth = Pick<Profile, 'dateTime' | 'city' | 'state' | 'country'>

interface BirthFieldsProps {
  /** The chosen person's saved details: yours, or a friend's. */
  base: Birth
  /** The details changed for this session; null keeps the saved ones. */
  value: Birth | null
  onChange: (birth: Birth | null) => void
  /** Keep the changed details as a new person, under the name given; throws with what to fix. */
  onSave: (name: string, birth: Birth) => Promise<void>
}

/** 'YYYY-MM-DD HH:MM' as a datetime-local input takes it, and back. */
const toInput = (dateTime: string): string => dateTime.replace(' ', 'T')
const fromInput = (v: string): string => v.replace('T', ' ').slice(0, 16)

/**
 * The birth details an open session is cast from: the chosen person's, in
 * a line, until Change opens them as fields. What is changed is for this
 * session only (kept on it, never on the person) unless it is saved as
 * someone new.
 */
export default function BirthFields({ base, value, onChange, onSave }: BirthFieldsProps) {
  const [editing, setEditing] = useState(value !== null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shown = value ?? base
  const changed = value !== null && !sameBirth(value, base)
  // A change that lands back on the saved details is no change.
  const set = (patch: Partial<Birth>): void => {
    const next = { ...shown, ...patch }
    onChange(sameBirth(next, base) ? null : next)
  }
  const reset = (): void => { onChange(null); setNaming(false); setError(null) }

  const save = async (): Promise<void> => {
    if (!value || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave(name.trim(), value)
      setNaming(false)
      setName('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <p className="birth-line">
        <span>Born {birthLine(shown)}</span>
        <button type="button" className="link" onClick={() => setEditing(true)}>Change</button>
      </p>
    )
  }
  return (
    <div className="birth-fields" role="group" aria-label="Birth details for this session">
      <label className="birth-field birth-when">
        <span className="shape-label">Born</span>
        <input type="datetime-local" className="ask-box" value={toInput(shown.dateTime)} onChange={(e) => { if (e.target.value) set({ dateTime: fromInput(e.target.value) }) }} />
      </label>
      <label className="birth-field">
        <span className="shape-label">City</span>
        <input type="text" className="ask-box" value={shown.city} maxLength={120} onChange={(e) => set({ city: e.target.value })} />
      </label>
      <label className="birth-field birth-short">
        <span className="shape-label">State</span>
        <input type="text" className="ask-box" value={shown.state} maxLength={60} onChange={(e) => set({ state: e.target.value })} />
      </label>
      <label className="birth-field birth-short">
        <span className="shape-label">Country</span>
        <input type="text" className="ask-box" value={shown.country} maxLength={60} onChange={(e) => set({ country: e.target.value })} />
      </label>
      {changed ? (
        <div className="birth-actions">
          <span className="memory-note">Changed for this session only.</span>
          <button type="button" className="link" onClick={reset}>Reset</button>
          {!naming && <button type="button" className="link" onClick={() => setNaming(true)}>Save as a person</button>}
        </div>
      ) : (
        <div className="birth-actions">
          <span className="memory-note">The saved details.</span>
          <button type="button" className="link" onClick={() => setEditing(false)}>Done</button>
        </div>
      )}
      {changed && naming && (
        <div className="birth-save">
          <input type="text" className="ask-box" aria-label="Their name" placeholder="Name to save them under" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save() } }} />
          <button type="button" className="chip" onClick={() => { setNaming(false); setError(null) }}>Cancel</button>
          <button type="button" className="primary" disabled={saving || !name.trim()} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      )}
      {error && <p className="reading-status error">{error}</p>}
    </div>
  )
}
