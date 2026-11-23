/** Formatting for tool-call cards. */
import type { Step } from '../types.ts'

/** "create_progressed_chart" -> "create progressed chart". */
export const toolLabel = (name?: string): string =>
  (name ?? 'tool').replace(/[_-]+/g, ' ').trim() || 'tool'

/** "18 KB" -- how much a tool returned, so a big result looks big. */
export function sizeLabel(chars: number): string {
  if (chars < 1000) return `${chars} chars`
  const kb = chars / 1024
  return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
}

/** JSON indented for reading; anything else as it came. */
export function prettyOutput(text: string): string {
  const t = text.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return text
  try {
    return JSON.stringify(JSON.parse(t), null, 2)
  } catch {
    return text
  }
}

/** One parameter's value for display: text as it is, anything else as compact JSON. */
export function argValue(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === undefined) return ''
  return JSON.stringify(v)
}

/** "city: New York · state: NY" -- a tool call's parameters on one line. */
export function argsSummary(args: Record<string, unknown>): string {
  return Object.entries(args).map(([k, v]) => `${k}: ${argValue(v).replace(/\s+/g, ' ')}`).join(' · ')
}

/** "create_natal_chart" -> "natal chart": what was looked at, without the verb. */
const looked = (name?: string): string => toolLabel(name).replace(/^(create|get|list|calculate|find) /, '')

/** The line a folded trail shows: the things looked at, each once, in order. */
export function trailSummary(trail: Step[]): string {
  const names = [...new Set(trail.flatMap((s) => (s.kind === 'tool' ? [looked(s.name)] : [])))]
  const failed = trail.some((s) => s.kind === 'tool' && s.ok === false)
  return `Looked at ${names.join(', ')}${failed ? ' (one failed)' : ''}`
}
