import type { ServerResponse } from 'node:http'
import type { ReadingEvent, ReadingState, Step, Written } from '../src/types.ts'
import { appendThinking } from '../src/lib/trail.ts'
import type { WriteRequest } from './model.ts'
import { ModelError, stripLeakedThinking, writeWithModel } from './model.ts'
import type { Store } from './store.ts'

/**
 * Text the model is writing: a casting's reading, or the answer to a
 * question asked under one. The model writes on the server, not in the
 * browser, so a phone that locks mid-sentence loses nothing: the text so
 * far is kept here, the page picks it up when it reconnects, and the
 * finished text goes into the store either way. The model's trail (its
 * thinking, the tools it called) and LM Studio's numbers for the turn are
 * kept alongside, with when the writing started and finished.
 */

/** Where a run's text lives when it is not being written: the casting's reading, or a follow-up's answer. */
export interface Kept {
  text: string
  state: ReadingState
  error: string | null
  written: Written
}

export interface Target {
  get(): Kept | undefined
  /** The writing starts now: nothing written, nothing on the trail. */
  begin(): void
  /** The trail so far, each time its shape changes. */
  trail(steps: Step[]): void
  /** The writing is over, well or badly: the text, the whole trail, and the turn's numbers. */
  finish(text: string, state: 'done' | 'failed', error: string | null, written: Pick<Written, 'trail' | 'stats'>): void
}

/** A casting's reading as a target. */
export const readingOf = (store: Store, id: string): Target => ({
  get: () => {
    const c = store.getCasting(id)
    return c ? { text: c.reading, state: c.readingState, error: c.readingError, written: c.written } : undefined
  },
  begin: () => store.beginReading(id),
  trail: (steps) => store.setReadingTrail(id, steps),
  finish: (text, state, error, written) => store.finishReading(id, text, state, error, written),
})

/** A follow-up's answer as a target. */
export const answerOf = (store: Store, id: string): Target => ({
  get: () => {
    const f = store.getFollowUp(id)
    return f ? { text: f.answer, state: f.state, error: f.error, written: f.written } : undefined
  },
  begin: () => store.beginAnswer(id),
  trail: (steps) => store.setAnswerTrail(id, steps),
  finish: (text, state, error, written) => store.finishAnswer(id, text, state, error, written),
})

interface Run {
  text: string
  trail: Step[]
  startedAt: number
  listeners: Set<ServerResponse>
  controller: AbortController
}

export class Readings {
  private runs = new Map<string, Run>()

  constructor(private readonly store: Store, private readonly write = writeWithModel) {}

  get busy(): number { return this.runs.size }

  writing(id: string): boolean { return this.runs.has(id) }

  /** Start writing into a target, unless it is already being written. */
  start(id: string, req: WriteRequest, target: Target = readingOf(this.store, id)): void {
    if (this.runs.has(id)) return
    const run: Run = { text: '', trail: [], startedAt: Date.now(), listeners: new Set(), controller: new AbortController() }
    this.runs.set(id, run)
    target.begin()
    void (async () => {
      try {
        const reply = await this.write(this.store.getConfig(), req, (piece) => {
          run.text += piece
          this.broadcast(run, { type: 'delta', text: piece })
        }, {
          signal: run.controller.signal,
          onTrail: (trail) => {
            run.trail = trail
            target.trail(trail)
            this.broadcast(run, { type: 'trail', trail })
          },
          onThinking: (piece) => {
            run.trail = appendThinking(run.trail, piece)
            this.broadcast(run, { type: 'thinking', text: piece })
          },
        })
        const reading = stripLeakedThinking(reply.text).trim()
        if (!reading) throw new ModelError('The model wrote nothing.')
        const written: Written = { trail: reply.trail, stats: reply.stats, startedAt: run.startedAt, finishedAt: Date.now() }
        target.finish(reading, 'done', null, written)
        this.broadcast(run, { type: 'done', reading, written })
      } catch (err) {
        const message = err instanceof ModelError ? err.message : `Could not write the reading. (${(err as Error).message})`
        const written: Written = { trail: run.trail, stats: null, startedAt: run.startedAt, finishedAt: Date.now() }
        // A store already closed (shutdown) has nowhere to keep the failure; the listeners still hear it.
        try { target.finish(run.text.trim(), 'failed', message, written) } catch (e) { console.error(`[orrery] could not keep the failed run ${id}: ${(e as Error).message}`) }
        this.broadcast(run, { type: 'error', message, written })
      } finally {
        this.runs.delete(id)
        for (const res of run.listeners) res.end()
      }
    })()
  }

  stop(id: string): boolean {
    const run = this.runs.get(id)
    if (!run) return false
    run.controller.abort()
    return true
  }

  /**
   * Stream a target's text to a response: the snapshot first (what is
   * written so far, or the whole finished text), then each new piece.
   * Ends with the text.
   */
  subscribe(id: string, res: ServerResponse, target: Target = readingOf(this.store, id)): boolean {
    const kept = target.get()
    if (!kept) return false
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' })
    const run = this.runs.get(id)
    const snapshot: ReadingEvent = run
      ? { type: 'snapshot', reading: run.text, state: 'writing', error: null, written: { trail: run.trail, stats: null, startedAt: run.startedAt, finishedAt: null } }
      : { type: 'snapshot', reading: kept.text, state: kept.state, error: kept.error, written: kept.written }
    res.write(frame(snapshot))
    if (!run) { res.end(); return true }
    run.listeners.add(res)
    res.on('close', () => run.listeners.delete(res))
    return true
  }

  private broadcast(run: Run, event: ReadingEvent): void {
    const data = frame(event)
    for (const res of run.listeners) {
      try { res.write(data) } catch { run.listeners.delete(res) }
    }
  }
}

const frame = (event: ReadingEvent): string => `data: ${JSON.stringify(event)}\n\n`
