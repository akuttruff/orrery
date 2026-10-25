import type { LiveReading } from '../hooks/useReading.ts'
import { toolLabel } from './toolFormat.ts'
import { pendingTools, thinking } from './trail.ts'

/**
 * What a reading or answer is doing while it is written, as lm-chat's header
 * shows it: LM Studio's step ("Reading the prompt 63%", "Thinking",
 * "Writing") and the seconds since it started. A tool call still out reads
 * as what it is looking up.
 */
export function liveLabel({ text, written, status }: Pick<LiveReading, 'text' | 'written' | 'status'>): string {
  const pending = pendingTools(written.trail)
  if (pending.length) return `Looking up ${pending.map((t) => toolLabel(t.name)).join(', ')}`
  if (status) return status
  return thinking(written.trail) ? 'Thinking' : text || written.trail.length ? 'Writing' : 'Starting'
}
