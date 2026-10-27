import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import type { Person } from '../types.ts'

/** Who a reading is for: 'me' for your own chart, else a saved person's id. */
export type Who = 'me' | string

interface WhoseChartProps {
  /** Your own name, from Settings. */
  me: string
  people: Person[]
  value: Who
  onPick: (who: Who) => void
  /** Save a new person; resolves to them (then picked), or throws with what to fix. */
  onAdd: (input: Omit<Person, 'id'>) => Promise<Person>
}

const BLANK = { name: '', dateTime: '', city: '', state: '', country: '' }

/**
 * The first choice in the cast popup: your own chart, someone already
 * saved, or someone new, whose birth details are typed in here once and
 * kept for next time.
 */
export default function WhoseChart({ me, people, value, onPick, onAdd }: WhoseChartProps) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const person = await onAdd(form)
      onPick(person.id)
      setForm(BLANK)
      setAdding(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="whose">
      <div className="spread-choice" role="radiogroup" aria-label="Whose chart">
        <button type="button" role="radio" aria-checked={value === 'me'} className={`chip${value === 'me' ? ' on' : ''}`} onClick={() => onPick('me')}>
          {me ? `${me} (you)` : 'You'}
        </button>
        {people.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={value === p.id} className={`chip${value === p.id ? ' on' : ''}`} onClick={() => onPick(p.id)}>
            {p.name}
          </button>
        ))}
        <button type="button" className={`chip${adding ? ' on' : ''}`} aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          <UserPlus size={14} aria-hidden="true" /> Someone else
        </button>
      </div>
      {adding && (
        <div className="whose-form" role="group" aria-label="Someone else's birth details">
          <label className="field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field">
            <span>Born (local time at the birthplace)</span>
            <input value={form.dateTime} placeholder="YYYY-MM-DD HH:MM" inputMode="numeric" onChange={(e) => setForm({ ...form, dateTime: e.target.value })} />
          </label>
          <label className="field"><span>City</span><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
          <div className="field-row">
            <label className="field"><span>State</span><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></label>
            <label className="field"><span>Country</span><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label>
          </div>
          {error && <p className="reading-status error">{error}</p>}
          <div className="whose-actions">
            <button type="button" className="chip" onClick={() => { setAdding(false); setError(null) }}>Cancel</button>
            <button type="button" className="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save and choose'}</button>
          </div>
        </div>
      )}
      {value !== 'me' && <span className="memory-note">Cast from their chart. Your memories stay out of it, and nothing you ask about them is remembered as being about you.</span>}
    </div>
  )
}
