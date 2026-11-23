import { ChevronRight, Telescope } from 'lucide-react'
import ReasoningBlock from './ReasoningBlock'
import ToolCard from './ToolCard'
import { trailSummary } from '../lib/toolFormat.ts'
import type { Step } from '../types.ts'

interface TrailProps {
  trail: Step[]
  /** Fold the tool calls to one line that opens to them, as a conversation shows them. */
  folded?: boolean
}

/** What the model did on the way to its text, in the order it happened: each stretch of thinking, each tool call. */
export default function Trail({ trail, folded = false }: TrailProps) {
  if (trail.length === 0) return null
  const steps = (
    <div className="trail" aria-label="How the model got here">
      {trail.map((step, i) => (
        step.kind === 'reasoning'
          ? <ReasoningBlock key={i} step={step} />
          : <div key={i} className="msg tool"><ToolCard use={step} /></div>
      ))}
    </div>
  )
  if (!folded || !trail.some((s) => s.kind === 'tool')) return steps
  return (
    <details className="trail-fold">
      <summary>
        <Telescope size={14} aria-hidden="true" />
        <span>{trailSummary(trail)}</span>
        <span className="chev"><ChevronRight size={14} aria-hidden="true" /></span>
      </summary>
      {steps}
    </details>
  )
}
