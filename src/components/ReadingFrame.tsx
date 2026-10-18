import type { ReactNode } from 'react'
import { NOTE_MAX, READING_STYLES, type StyleId } from '../lib/styles.ts'

interface ReadingFrameProps {
  note: string
  style: StyleId
  onNote: (note: string) => void
  onStyle: (style: StyleId) => void
  /** Sidebar: a lower box. */
  compact?: boolean
  /** The memory switch, under the kinds, so every choice for the next reading sits in one place. */
  children?: ReactNode
}

/**
 * What the next reading is for, in the person's own words, and the kind of
 * reading they want, chosen before the tap that casts. Both go into the
 * brief and stay with the casting, so Write again and the questions under
 * it keep the same frame.
 */
export default function ReadingFrame({ note, style, onNote, onStyle, compact = false, children }: ReadingFrameProps) {
  return (
    <div className={`frame${compact ? ' compact' : ''}`}>
      <label className="ask-label" htmlFor="frame-note">What do you want from the next reading?</label>
      <textarea
        id="frame-note"
        className="ask-box frame-box"
        rows={compact ? 2 : 2}
        maxLength={NOTE_MAX}
        value={note}
        placeholder="Optional. Context helps: “I'm going through some anxiety today”, “deciding about the job this week”"
        onChange={(e) => onNote(e.target.value)}
      />
      <div className="frame-styles" role="radiogroup" aria-label="Kind of reading">
        {READING_STYLES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={style === s.id} className={`chip${style === s.id ? ' on' : ''}`} title={s.hint} onClick={() => onStyle(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}
