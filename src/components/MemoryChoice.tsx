import { useState } from 'react'
import { Brain, ListChecks } from 'lucide-react'
import MemoryPicker from './MemoryPicker'

interface MemoryChoiceProps {
  on: boolean
  /** Memories the next casting leaves out, by id. */
  excluded: string[]
  onToggle: (on: boolean) => void
  onExclude: (ids: string[]) => void
  onManage: () => void
  /** No line under the chips about what the switch means. */
  quiet?: boolean
}

/**
 * Whether the next casting is read with the saved memories, decided before
 * the tap that casts it, and which of them. The switch is Settings' default,
 * so it stays as set; the choice of memories is kept on this device.
 */
export default function MemoryChoice({ on, excluded, onToggle, onExclude, onManage, quiet = false }: MemoryChoiceProps) {
  const [picking, setPicking] = useState(false)
  return (
    <div className="memory-choice">
      <div className="memory-switch">
        <button type="button" role="switch" aria-checked={on} className={`chip${on ? ' on' : ''}`} onClick={() => onToggle(!on)}>
          <Brain size={13} aria-hidden="true" /> Memory {on ? 'on' : 'off'}
        </button>
        {on && (
          <button type="button" className={`chip${picking ? ' on' : ''}`} aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
            <ListChecks size={13} aria-hidden="true" /> Choose{excluded.length ? ` · ${excluded.length} out` : ''}
          </button>
        )}
        {!quiet && (
          <span className="memory-note">
            {on ? 'The reading draws on what the model knows about you.' : 'The reading is written from the chart alone.'}
          </span>
        )}
      </div>
      {on && picking && <MemoryPicker excluded={excluded} used={[]} onChange={onExclude} onManage={onManage} />}
    </div>
  )
}
