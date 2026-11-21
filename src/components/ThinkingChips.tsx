import { thinkingFor, type ThinkingId } from '../lib/shape.ts'

interface ThinkingChipsProps {
  /** The level chosen; '' leaves it to Settings. */
  value: ThinkingId
  onPick: (id: ThinkingId) => void
  /** The thinking levels the model takes (server/model.ts); null when LM Studio can't say. */
  thinking: string[] | null
  disabled?: boolean
}

/**
 * How hard the model thinks first, as a labelled row of chips: only the
 * levels the model in use takes (lib/shape.ts thinkingFor), and nothing at
 * all when it takes none but Settings'.
 */
export default function ThinkingChips({ value, onPick, thinking, disabled = false }: ThinkingChipsProps) {
  const levels = thinkingFor(thinking)
  if (levels.length < 2) return null
  const chosen = levels.some((l) => l.id === value) ? value : ''
  return (
    <div className="shape-group" role="radiogroup" aria-label="Thinking">
      <span className="shape-label" aria-hidden="true">Thinking</span>
      {levels.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === chosen} className={`chip${o.id === chosen ? ' on' : ''}`} title={o.hint} disabled={disabled} onClick={() => onPick(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}
