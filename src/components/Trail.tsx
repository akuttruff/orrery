import ReasoningBlock from './ReasoningBlock'
import ToolCard from './ToolCard'
import type { Step } from '../types.ts'

/** What the model did on the way to its text, in the order it happened: each stretch of thinking, each tool call. */
export default function Trail({ trail }: { trail: Step[] }) {
  if (trail.length === 0) return null
  return (
    <div className="trail" aria-label="How the model got here">
      {trail.map((step, i) => (
        step.kind === 'reasoning'
          ? <ReasoningBlock key={i} step={step} />
          : <div key={i} className="msg tool"><ToolCard use={step} /></div>
      ))}
    </div>
  )
}
