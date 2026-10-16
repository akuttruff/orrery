import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import type { Memory } from '../types.ts'

interface MemoryPickerProps {
  /** Memories this casting leaves out, by id. */
  excluded: string[]
  /** The ones the last reading was written with, by id, marked as such. */
  used: string[]
  onChange: (excluded: string[]) => void
  onManage: () => void
}

/**
 * Which of the saved memories go to the model for this casting: every
 * reading, rewrite and answer from here on. All of them unless unticked.
 */
export default function MemoryPicker({ excluded, used, onChange, onManage }: MemoryPickerProps) {
  const [items, setItems] = useState<Memory[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    api.memories().then((m) => { if (live) setItems(m) }).catch((e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [])

  const out = new Set(excluded)
  const toggle = (id: string) => {
    const next = new Set(out)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChange([...next])
  }
  const going = items ? items.filter((m) => !out.has(m.id)).length : 0

  return (
    <div className="memory-picker" role="group" aria-label="Memories for this casting">
      {error && <p className="reading-status error" role="alert">{error}</p>}
      {items && (
        <p className="memory-picker-head">
          <span>{items.length === 0 ? 'Nothing remembered yet.' : `${going} of ${items.length} go to the model with the next reading or answer.`}</span>
          {items.length > 0 && (
            <>
              <button type="button" className="link" disabled={going === items.length} onClick={() => onChange([])}>All</button>
              <button type="button" className="link" disabled={going === 0} onClick={() => onChange(items.map((m) => m.id))}>None</button>
            </>
          )}
          <button type="button" className="link" onClick={onManage}>Manage</button>
        </p>
      )}
      <ul className="memory-picks">
        {items?.map((m) => (
          <li key={m.id}>
            <label className="memory-pick">
              <input type="checkbox" checked={!out.has(m.id)} onChange={() => toggle(m.id)} />
              <span className="memory-pick-text">{m.text}</span>
              {used.includes(m.id) && <span className="memory-pick-used">in the reading</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
