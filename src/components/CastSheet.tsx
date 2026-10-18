import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import MemoryChoice from './MemoryChoice'
import { NOTE_MAX, READING_STYLES, type StyleId } from '../lib/styles.ts'
import { KIND_LABEL } from '../lib/kinds.ts'
import type { Kind } from '../types.ts'

interface CastSheetProps {
  kind: Kind
  /** The tile's own line about what the kind covers. */
  hint: string
  note: string
  style: StyleId
  memoryOn: boolean
  excluded: string[]
  busy: boolean
  onNote: (note: string) => void
  onStyle: (style: StyleId) => void
  onMemory: (on: boolean) => void
  onExclude: (ids: string[]) => void
  onManage: () => void
  onCast: () => void
  onClose: () => void
}

/**
 * The popup a tile opens: what the reading is for, in the person's words,
 * the kind of reading, and whether it draws on memory, then the button that
 * casts. Nothing is cast until that button; the X or Escape puts the tile
 * back untouched.
 */
export default function CastSheet({ kind, hint, note, style, memoryOn, excluded, busy, onNote, onStyle, onMemory, onExclude, onManage, onCast, onClose }: CastSheetProps) {
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    box.current?.focus()
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="cast-backdrop" onClick={onClose}>
      <div className="sheet cast-sheet" role="dialog" aria-label={`Cast ${KIND_LABEL[kind]}`} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <div>
            <h2>{KIND_LABEL[kind]}</h2>
            <p className="cast-hint">{hint}</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="sheet-body">
          <label className="ask-label" htmlFor="cast-note">What do you want from this reading?</label>
          <textarea
            id="cast-note"
            ref={box}
            className="ask-box frame-box"
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            placeholder="Optional. Context helps: “I'm going through some anxiety today”, “deciding about the job this week”"
            onChange={(e) => onNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onCast() } }}
          />
          <p className="ask-label cast-section">Kind of reading</p>
          <div className="frame-styles" role="radiogroup" aria-label="Kind of reading">
            {READING_STYLES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={style === s.id} className={`chip${style === s.id ? ' on' : ''}`} title={s.hint} onClick={() => onStyle(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <p className="ask-label cast-section">Memory</p>
          <MemoryChoice on={memoryOn} excluded={excluded} onToggle={onMemory} onExclude={onExclude} onManage={onManage} />
        </div>
        <footer className="sheet-foot cast-foot">
          <button type="button" className="chip" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" disabled={busy} onClick={onCast}>{busy ? 'Casting…' : `Cast ${KIND_LABEL[kind].toLowerCase()}`}</button>
        </footer>
      </div>
    </div>
  )
}
