import { useId } from 'react'
import { READING_STYLES, styleOf, type StyleId } from '../lib/styles.ts'

interface StyleChipsProps {
  /** The kind of reading chosen, or the one this reading was written as. */
  value: StyleId
  /** As a radio group, one chosen; or as plain buttons, each a cast in that tone. */
  as: 'radio' | 'button'
  disabled?: boolean
  onPick: (id: StyleId) => void
  /** What a chip does, for the popup over the one already chosen ('How this one was read'). */
  chosenNote?: string
}

/**
 * The kinds of reading as a row of chips, each with a popup over it saying
 * what that reading is like and, in its own words, what the model is told
 * (lib/styles.ts). The popup shows to a pointer that rests or a focus that
 * lands; a phone, which has neither, reads the chosen one's line under the
 * row instead.
 */
export default function StyleChips({ value, as, disabled = false, onPick, chosenNote }: StyleChipsProps) {
  const base = useId()
  const chosen = styleOf(value)
  return (
    <>
      <div className="frame-styles" role={as === 'radio' ? 'radiogroup' : undefined} aria-label={as === 'radio' ? 'Kind of reading' : undefined}>
        {READING_STYLES.map((s) => {
          const on = s.id === value
          const tipId = `${base}-${s.id}`
          return (
            <span key={s.id} className="style-chip tt-th-help">
              <button
                type="button"
                role={as === 'radio' ? 'radio' : undefined}
                aria-checked={as === 'radio' ? on : undefined}
                aria-describedby={tipId}
                className={`chip${on ? ' on' : ''}`}
                disabled={disabled}
                onClick={() => onPick(s.id)}
              >
                {s.label}
              </button>
              <div className="tt-help style-tip" role="tooltip" id={tipId}>
                <div className="wheel-tip-title">{s.label}{on && chosenNote ? <span className="style-chosen"> · {chosenNote}</span> : null}</div>
                <p>{s.hint}.</p>
                <p className="style-voice">The model is told: “{s.voice}”</p>
              </div>
            </span>
          )
        })}
      </div>
      <p className="style-hint"><b>{chosen.label}</b> · {chosen.hint}.</p>
    </>
  )
}
