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
  /** Save a new person from their details typed as a sentence; resolves to them (then picked), or throws with what to fix. */
  onAdd: (text: string) => Promise<Person>
}

/** "1960-06-08 09:45 · Pleasanton, CA, USA": a saved person's details, to check at a glance. */
const detailsOf = (p: Person): string => `Born ${p.dateTime} in ${[p.city, p.state, p.country].filter(Boolean).join(', ')}`

/**
 * The first choice in the cast popup: your own chart, someone already
 * saved, or someone new, whose details are typed as one sentence and read
 * by the model, then kept for next time.
 */
export default function WhoseChart({ me, people, value, onPick, onAdd }: WhoseChartProps) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = people.find((p) => p.id === value)

  const save = async (): Promise<void> => {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    try {
      const person = await onAdd(text)
      onPick(person.id)
      setText('')
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
          <textarea
            aria-label="Their name and birth details"
            className="ask-box"
            rows={3}
            maxLength={500}
            value={text}
            placeholder="Their name, birth date, time and place, any way you like: “Jo, born June 8 1960 at 9:45 AM in Pleasanton, CA”"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void save() } }}
          />
          {error && <p className="reading-status error">{error}</p>}
          <div className="whose-actions">
            <button type="button" className="chip" onClick={() => { setAdding(false); setError(null) }}>Cancel</button>
            <button type="button" className="primary" disabled={saving || !text.trim()} onClick={() => void save()}>{saving ? 'Reading…' : 'Add'}</button>
          </div>
        </div>
      )}
      {chosen && (
        <span className="memory-note">
          {detailsOf(chosen)}. Cast from their chart; your memories stay out of it, and nothing you ask about them is remembered as being about you.
        </span>
      )}
    </div>
  )
}
