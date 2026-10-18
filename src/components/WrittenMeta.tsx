import { formatSeconds, formatWhen, statsLine } from '../lib/when.ts'
import type { ReadingState, Written } from '../types.ts'

interface WrittenMetaProps {
  written: Written
  state: ReadingState
  /** 'Written' for a reading, 'Answered' for an answer. */
  label: string
}

/**
 * The footer under a reading or answer, as lm-chat puts one under each
 * reply: when it was finished and how long it took, then the model and LM
 * Studio's own numbers for the turn. While it is being written, when it
 * started.
 */
export default function WrittenMeta({ written, state, label }: WrittenMetaProps) {
  const { startedAt, finishedAt, stats } = written
  if (state === 'writing') return startedAt ? <p className="meta">Started {formatWhen(startedAt)}</p> : null
  if (!finishedAt && !stats) return null
  const parts: string[] = []
  if (finishedAt) parts.push(`${label} ${formatWhen(finishedAt)}`)
  if (finishedAt && startedAt) parts.push(formatSeconds(finishedAt - startedAt))
  if (stats) parts.push(stats.model)
  return (
    <p className="meta">
      {parts.join(' · ')}
      {stats && <span className="meta-stats"> · {statsLine(stats)}</span>}
    </p>
  )
}
