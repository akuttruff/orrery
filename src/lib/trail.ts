import type { ReasoningStep, Step, ToolStep } from '../types.ts'

/**
 * The model's trail, as the server and the page both keep it while the
 * model works: thinking arrives in pieces and goes onto the open thinking
 * step, or opens one when the stream never announced it.
 */

/** The trail with a piece of thinking added: a new array, the step it went on a new object. */
export function appendThinking(trail: Step[], piece: string): Step[] {
  const last = trail.at(-1)
  if (last?.kind === 'reasoning' && !last.done) return [...trail.slice(0, -1), { ...last, text: last.text + piece }]
  const step: ReasoningStep = { kind: 'reasoning', text: piece, done: false }
  return [...trail, step]
}

/** Whether the model is thinking right now: the trail ends in an open thinking step. */
export function thinking(trail: Step[]): boolean {
  const last = trail.at(-1)
  return last?.kind === 'reasoning' && !last.done
}

/** The tool calls that have not returned yet. */
export const pendingTools = (trail: Step[]): ToolStep[] => trail.filter((s): s is ToolStep => s.kind === 'tool' && s.ok === null)
