import type { ReplyStats } from '../types.ts'

/** A moment, short: the time alone today, the day and time otherwise, the year when it is not this one. */
export function formatWhen(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  const n = new Date(now)
  const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
  if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString([], time)
  if (d.getFullYear() === n.getFullYear()) return d.toLocaleString([], { month: 'short', day: 'numeric', ...time })
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', ...time })
}

/** A span in seconds, to a tenth; whole minutes past 90 s. */
export function formatSeconds(ms: number): string {
  const s = ms / 1000
  if (s < 90) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

/** 9003 reads better as 9.0K in a footer; small counts stay exact. */
const compact = (n: number): string => (n >= 10000 ? `${(n / 1000).toFixed(1)}K` : String(n))

/**
 * The cost of a reply in LM Studio's own numbers, as lm-chat shows it:
 * generation speed, what went in and came out, and how long the first
 * token took, which is prompt reading plus any wait in the queue.
 */
export function statsLine(s: ReplyStats): string {
  const thinking = s.reasoningTokens > 0 ? ` (${compact(s.reasoningTokens)} thinking)` : ''
  return `${s.tokensPerSecond} tok/s · ${compact(s.inputTokens)} in / ${compact(s.outputTokens)} out${thinking} · ${s.firstTokenSeconds}s to first token`
}
