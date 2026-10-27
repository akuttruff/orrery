import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import MemoryChoice from './MemoryChoice'
import WhoseChart, { type Who } from './WhoseChart'
import StyleChips from './StyleChips'
import { NOTE_MAX, type StyleId } from '../lib/styles.ts'
import { KIND_LABEL } from '../lib/kinds.ts'
import { SPREADS, SPREAD_HINT, SPREAD_LABEL, type SpreadId } from '../lib/spreads.ts'
import { isTarotKind } from '../types.ts'
import type { Kind, Person } from '../types.ts'

interface CastSheetProps {
  kind: Kind
  note: string
  style: StyleId
  /** Which spread a card spread is dealt. */
  spread: SpreadId
  /** Whose chart: you, or someone saved; new people are added here. */
  me: string
  people: Person[]
  who: Who
  onWho: (who: Who) => void
  onAddPerson: (input: Omit<Person, 'id'>) => Promise<Person>
  memoryOn: boolean
  excluded: string[]
  busy: boolean
  onNote: (note: string) => void
  onStyle: (style: StyleId) => void
  onSpread: (spread: SpreadId) => void
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
export default function CastSheet({ kind, note, style, spread, me, people, who, onWho, onAddPerson, memoryOn, excluded, busy, onNote, onStyle, onSpread, onMemory, onExclude, onManage, onCast, onClose }: CastSheetProps) {
  const tarot = isTarotKind(kind)
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
          <h2>{KIND_LABEL[kind]}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="sheet-body cast-body">
          <WhoseChart me={me} people={people} value={who} onPick={onWho} onAdd={onAddPerson} />
          <textarea
            id="cast-note"
            ref={box}
            aria-label={tarot ? 'What is the question?' : 'What do you want from this reading?'}
            className="ask-box frame-box"
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            placeholder={tarot ? 'Optional. The question, in your words: “should I take the job?”, “what do I need to see about this week?”' : "Optional. Context helps: “I'm going through some anxiety today”, “deciding about the job this week”"}
            onChange={(e) => onNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onCast() } }}
          />
          {kind === 'spread' && (
            <div className="spread-choice" role="radiogroup" aria-label="Which spread">
              {SPREADS.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={spread === id} className={`chip${spread === id ? ' on' : ''}`} title={SPREAD_HINT[id]} onClick={() => onSpread(id)}>{SPREAD_LABEL[id]}</button>
              ))}
              <span className="memory-note">{SPREAD_HINT[spread]}</span>
            </div>
          )}
          <StyleChips value={style} as="radio" onPick={onStyle} />
          {who === 'me' && <MemoryChoice on={memoryOn} excluded={excluded} onToggle={onMemory} onExclude={onExclude} onManage={onManage} quiet />}
        </div>
        <footer className="sheet-foot cast-foot">
          <button type="button" className="chip" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" disabled={busy} onClick={onCast}>{busy ? (tarot ? 'Dealing…' : 'Casting…') : tarot ? `Draw ${kind === 'card' ? 'the card' : 'the cards'}` : `Cast ${KIND_LABEL[kind].toLowerCase()}`}</button>
        </footer>
      </div>
    </div>
  )
}
