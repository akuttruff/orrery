import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { api } from '../lib/api.ts'
import type { Memory } from '../types.ts'

interface MemoriesSheetProps {
  onClose: () => void
}

/**
 * Everything Orrery remembers about you: to read, correct, add to or
 * delete, so a wrong memory gets fixed instead of shaping every reading.
 * Readings use these only for castings with memory on.
 */
export default function MemoriesSheet({ onClose }: MemoriesSheetProps) {
  const [items, setItems] = useState<Memory[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState('')

  useEffect(() => {
    let live = true
    api.memories().then((m) => { if (live) setItems(m) }).catch((e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [])

  const save = async (id: string): Promise<void> => {
    try {
      const updated = await api.updateMemory(id, draft)
      setItems((list) => list && [updated, ...list.filter((m) => m.id !== id)])
      setEditing(null)
    } catch (e) { setError((e as Error).message) }
  }

  const add = async (): Promise<void> => {
    const text = adding.trim()
    if (!text) return
    try {
      const saved = await api.remember(text)
      setItems((list) => list && [saved, ...(list.filter((m) => m.id !== saved.id))])
      setAdding('')
    } catch (e) { setError((e as Error).message) }
  }

  const remove = async (m: Memory): Promise<void> => {
    try {
      await api.forget(m.id)
      setItems((list) => list && list.filter((x) => x.id !== m.id))
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="sheet" role="dialog" aria-label="Memories">
      <header className="sheet-head">
        <h2>Memories{items ? ` · ${items.length}` : ''}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="sheet-body">
        <p className="memory-hint">
          What Orrery knows about you, kept here and nowhere else. A reading with memory on draws on these where the chart touches them. Questions you ask with memory on add to them.
        </p>
        <form className="memory-add" onSubmit={(e) => { e.preventDefault(); void add() }}>
          <input value={adding} placeholder="Add something worth remembering" aria-label="New memory" maxLength={1000} onChange={(e) => setAdding(e.target.value)} />
          <button type="submit" className="ask-send" aria-label="Remember" disabled={!adding.trim()}><Plus size={18} aria-hidden="true" /></button>
        </form>
        {error && <p className="reading-status error" role="alert">{error}</p>}
        {items?.length === 0 && <p className="reading-status">Nothing remembered yet. Turn memory on for a casting and ask about the reading, or add one above.</p>}
        <ul className="memory-list">
          {items?.map((m) => (
            <li key={m.id} className="memory">
              {editing === m.id ? (
                <div className="memory-edit">
                  <textarea aria-label="Memory text" value={draft} maxLength={1000} rows={3} onChange={(e) => setDraft(e.target.value)} />
                  <div className="memory-actions">
                    <button type="button" className="chip" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="button" className="chip" disabled={!draft.trim()} onClick={() => void save(m.id)}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="memory-text">{m.text}</p>
                  <div className="memory-meta">
                    <span>{new Date(m.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span className="spacer" />
                    <button type="button" className="icon-btn small" aria-label={`Edit: ${m.text}`} onClick={() => { setEditing(m.id); setDraft(m.text) }}><Pencil size={15} aria-hidden="true" /></button>
                    <button type="button" className="icon-btn small danger" aria-label={`Forget: ${m.text}`} onClick={() => void remove(m)}><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
