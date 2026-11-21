import {
  AREAS, DEFAULT_SHAPE, FOCUS, LENGTHS, ORGANISE, PARTS, WRITING,
  isDefaultShape, optionsFor, shapeFor, shapeOf,
  type Option, type ReadingShape,
} from '../lib/shape.ts'
import type { Kind } from '../types.ts'
import ThinkingChips from './ThinkingChips'

interface ShapeOptionsProps {
  kind: Kind
  value: ReadingShape | null
  onChange: (shape: ReadingShape) => void
  /** The thinking levels the model takes (server/model.ts); null when LM Studio can't say. */
  thinking: string[] | null
  disabled?: boolean
}

/**
 * The shape of a reading, beside its tone: length, how it is organised,
 * which parts it has, what it leads with, how it is written and how hard
 * the model thinks first (lib/shape.ts). A labelled row of chips each, in
 * line with the rest of the popup. Only what the kind of reading can take
 * is offered.
 */
export default function ShapeOptions({ kind, value, onChange, thinking, disabled = false }: ShapeOptionsProps) {
  // What is shown is the shape as this kind takes it; a change is made to the whole, so a choice another kind takes is kept.
  const shape = shapeFor(value, kind)
  const whole = shapeOf(value)
  const offered = optionsFor(kind)
  const set = (patch: Partial<ReadingShape>): void => onChange({ ...whole, ...patch })
  const toggle = <T extends string>(list: T[], id: T): T[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const radios = <T extends string>(label: string, options: Option<T>[], chosen: T, pick: (id: T) => void) => (
    <div className="shape-group" role="radiogroup" aria-label={label}>
      <span className="shape-label" aria-hidden="true">{label}</span>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === chosen} className={`chip${o.id === chosen ? ' on' : ''}`} title={o.hint} disabled={disabled} onClick={() => pick(o.id)}>{o.label}</button>
      ))}
    </div>
  )
  const toggles = <T extends string>(label: string, options: Option<T>[], chosen: T[], flip: (id: T) => void) => (
    <div className="shape-group" role="group" aria-label={label}>
      <span className="shape-label" aria-hidden="true">{label}</span>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={chosen.includes(o.id)} className={`chip${chosen.includes(o.id) ? ' on' : ''}`} title={o.hint} disabled={disabled} onClick={() => flip(o.id)}>{o.label}</button>
      ))}
    </div>
  )

  return (
    <div className="shape" role="group" aria-label="Shape of the reading">
      {radios('Length', LENGTHS, shape.length, (length) => set({ length }))}
      {offered.organise.length > 1 && radios('Organise', ORGANISE.filter((o) => offered.organise.includes(o.id)), shape.organise, (organise) => set({ organise }))}
      {toggles('Include', PARTS.filter((p) => offered.parts.includes(p.id)), shape.parts, (id) => set({ parts: toggle(whole.parts, id) }))}
      {offered.focus.length > 0 && toggles('Lead with', FOCUS.filter((f) => offered.focus.includes(f.id)), shape.focus, (id) => set({ focus: toggle(whole.focus, id) }))}
      {offered.areas && toggles('Life areas', AREAS, shape.areas, (id) => set({ areas: toggle(whole.areas, id) }))}
      {radios('Writing', WRITING, shape.writing, (writing) => set({ writing }))}
      <ThinkingChips value={shape.thinking} thinking={thinking} disabled={disabled} onPick={(id) => set({ thinking: id })} />
      {!isDefaultShape(shape) && (
        <button type="button" className="link shape-reset" disabled={disabled} onClick={() => onChange({ ...DEFAULT_SHAPE, parts: [...DEFAULT_SHAPE.parts] })}>Back to the usual shape</button>
      )}
    </div>
  )
}
