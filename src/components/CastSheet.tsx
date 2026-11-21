import { useEffect, useRef, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import MemoryChoice from './MemoryChoice'
import WhoseChart, { type Who } from './WhoseChart'
import StyleChips from './StyleChips'
import ShapeOptions from './ShapeOptions'
import ThinkingChips from './ThinkingChips'
import BirthFields, { type Birth } from './BirthFields'
import { NOTE_MAX, type StyleId } from '../lib/styles.ts'
import { DEFAULT_SHAPE, isDefaultShape, shapeOf, shapeSummary, type ReadingShape } from '../lib/shape.ts'
import { KIND_LABEL } from '../lib/kinds.ts'
import { SPREADS, SPREAD_HINT, SPREAD_LABEL, type SpreadId } from '../lib/spreads.ts'
import { isTarotKind } from '../types.ts'
import type { Kind, Person } from '../types.ts'

interface CastSheetProps {
  kind: Kind
  note: string
  style: StyleId
  /** Its length, organisation, parts, focus, writing and thinking (lib/shape.ts). */
  shape?: ReadingShape
  /** The thinking levels the model takes; null when LM Studio can't say. */
  thinking?: string[] | null
  /** Which spread a card spread is dealt. */
  spread: SpreadId
  /** Whose chart: you, or someone saved; new people are added here. */
  me: string
  people: Person[]
  who: Who
  onWho: (who: Who) => void
  onAddPerson: (text: string) => Promise<Person>
  memoryOn: boolean
  excluded: string[]
  busy: boolean
  onNote: (note: string) => void
  onStyle: (style: StyleId) => void
  onShape?: (shape: ReadingShape) => void
  onSpread: (spread: SpreadId) => void
  onMemory: (on: boolean) => void
  onExclude: (ids: string[]) => void
  onManage: () => void
  onCast: () => void
  onClose: () => void
  /** An open session's birth details: the chosen person's saved ones, those changed for it (null for none), and keeping the change as a person. */
  birthBase?: Birth
  birth?: Birth | null
  onBirth?: (birth: Birth | null) => void
  onSaveBirth?: (name: string, birth: Birth) => Promise<void>
}

/**
 * The popup a tile opens: what the reading is for, in the person's words,
 * the kind of reading and its shape, and whether it draws on memory, then the button that
 * casts. Nothing is cast until that button; the X or Escape puts the tile
 * back untouched.
 *
 * An open session asks for less: whose birth details (changeable for this
 * once), the first message, and how hard the model thinks. No tone, shape
 * or memory; the model works with the tools alone (server/prompt.ts).
 */
export default function CastSheet({ kind, note, style, shape, thinking = null, spread, me, people, who, onWho, onAddPerson, memoryOn, excluded, busy, onNote, onStyle, onShape, onSpread, onMemory, onExclude, onManage, onCast, onClose, birthBase, birth = null, onBirth, onSaveBirth }: CastSheetProps) {
  const tarot = isTarotKind(kind)
  const open = kind === 'open'
  // The shape stays folded under its summary unless it already asks for something unusual.
  const [shapeOpen, setShapeOpen] = useState(() => !isDefaultShape(shape))
  const summary = shapeSummary(shape, kind)
  const ready = !open || note.trim().length > 0
  const go = (): void => { if (ready && !busy) onCast() }
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
          {open && birthBase && onBirth && onSaveBirth && <BirthFields key={who} base={birthBase} value={birth} onChange={onBirth} onSave={onSaveBirth} />}
          <textarea
            id="cast-note"
            ref={box}
            aria-label={open ? 'What do you want to ask or explore?' : tarot ? 'What is the question?' : 'What do you want from this reading?'}
            className="ask-box frame-box"
            rows={open ? 4 : 3}
            maxLength={NOTE_MAX}
            value={note}
            required={open}
            placeholder={open ? 'Anything, in your words: “what are my transits doing to my 10th house this month?”, “pull three cards for the move”' : tarot ? 'Optional. The question, in your words: “should I take the job?”, “what do I need to see about this week?”' : "Optional. Context helps: “I'm going through some anxiety today”, “deciding about the job this week”"}
            onChange={(e) => onNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go() } }}
          />
          {kind === 'spread' && (
            <div className="spread-choice" role="radiogroup" aria-label="Which spread">
              {SPREADS.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={spread === id} className={`chip${spread === id ? ' on' : ''}`} title={SPREAD_HINT[id]} onClick={() => onSpread(id)}>{SPREAD_LABEL[id]}</button>
              ))}
              <span className="memory-note">{SPREAD_HINT[spread]}</span>
            </div>
          )}
          {open ? (
            <>
              {onShape && <ThinkingChips value={shapeOf(shape).thinking} thinking={thinking} onPick={(id) => onShape({ ...DEFAULT_SHAPE, parts: [...DEFAULT_SHAPE.parts], thinking: id })} />}
              <p className="memory-note open-tools">The model can call astro-mcp and tarot-mcp. It is told only that every chart fact must come from the tools, never its own working.</p>
            </>
          ) : (
            <>
              <span className="shape-label tone-label" aria-hidden="true">Tone</span>
              <StyleChips value={style} as="radio" onPick={onStyle} />
              {onShape && (
                <>
                  <button type="button" className="shape-toggle" aria-expanded={shapeOpen} onClick={() => setShapeOpen((o) => !o)}>
                    <ChevronRight size={16} aria-hidden="true" className="chev" />
                    <span className="shape-label">Shape</span>
                    <span className="shape-toggle-summary">{summary || 'Usual'}</span>
                  </button>
                  {shapeOpen && <ShapeOptions kind={kind} value={shape ?? null} onChange={onShape} thinking={thinking} />}
                </>
              )}
              {who === 'me' && <MemoryChoice on={memoryOn} excluded={excluded} onToggle={onMemory} onExclude={onExclude} onManage={onManage} quiet />}
            </>
          )}
        </div>
        <footer className="sheet-foot cast-foot">
          <button type="button" className="chip" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" disabled={busy || !ready} onClick={go}>{busy ? (open ? 'Starting…' : tarot ? 'Dealing…' : 'Casting…') : open ? 'Start' : tarot ? `Draw ${kind === 'card' ? 'the card' : 'the cards'}` : `Cast ${KIND_LABEL[kind].toLowerCase()}`}</button>
        </footer>
      </div>
    </div>
  )
}
