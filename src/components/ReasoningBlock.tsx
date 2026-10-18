import { memo, useState } from 'react'
import { Brain, ChevronRight } from 'lucide-react'
import type { ReasoningStep } from '../types.ts'

/** The model's thinking, collapsed by default as lm-chat and LM Studio show it: a dashed row that opens to the text. */
function ReasoningBlock({ step }: { step: ReasoningStep }) {
  const [open, setOpen] = useState(false)
  const label = step.done ? `Thought${step.seconds != null ? ` for ${step.seconds}s` : ''}` : 'Thinking...'
  return (
    <div className="msg reasoning">
      <button type="button" className="reasoning-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Brain size={14} aria-hidden="true" />
        <span>{label}</span>
        <span className="chev"><ChevronRight size={14} aria-hidden="true" /></span>
      </button>
      {open && (
        <div className="reasoning-body">
          <div className="reasoning-text">{step.text || '…'}</div>
        </div>
      )}
    </div>
  )
}

export default memo(ReasoningBlock)
