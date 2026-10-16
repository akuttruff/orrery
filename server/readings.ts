import type { ServerResponse } from 'node:http'
import type { ReadingEvent, ReadingState } from '../src/types.ts'
import type { WriteRequest } from './model.ts'
import { ModelError, writeWithModel } from './model.ts'
import type { Store } from './store.ts'

/**
 * Text the model is writing: a casting's reading, or the answer to a
 * question asked under one. The model writes on the server, not in the
 * browser, so a phone that locks mid-sentence loses nothing: the text so
 * far is kept here, the page picks it up when it reconnects, and the
 * finished text goes into the store either way.
 */

/** Where a run's text lives when it is not being written: the casting's reading, or a follow-up's answer. */
export interface Kept {
  text: string
  state: ReadingState
  error: string | null
}

export interface Target {
  get(): Kept | undefined
  set(text: string, state: ReadingState, error?: string | null): void
}

/** A casting's reading as a target. */
export const readingOf = (store: Store, id: string): Target => ({
  get: () => {
    const c = store.getCasting(id)
    return c ? { text: c.reading, state: c.readingState, error: c.readingError } : undefined
  },
  set: (text, state, error) => store.setReading(id, text, state, error),
})

/** A follow-up's answer as a target. */
export const answerOf = (store: Store, id: string): Target => ({
  get: () => {
    const f = store.getFollowUp(id)
    return f ? { text: f.answer, state: f.state, error: f.error } : undefined
  },
  set: (text, state, error) => store.setAnswer(id, text, state, error),
})

interface Run {
  text: string
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
    const run: Run = { text: '', listeners: new Set(), controller: new AbortController() }
    this.runs.set(id, run)
    target.set('', 'writing')
    void (async () => {
      try {
        const text = await this.write(this.store.getConfig(), req, (piece) => {
          run.text += piece
          this.broadcast(run, { type: 'delta', text: piece })
        }, run.controller.signal)
        const reading = text.trim()
        if (!reading) throw new ModelError('The model wrote nothing.')
        target.set(reading, 'done')
        this.broadcast(run, { type: 'done', reading })
      } catch (err) {
        const message = err instanceof ModelError ? err.message : `Could not write the reading. (${(err as Error).message})`
        // A store already closed (shutdown) has nowhere to keep the failure; the listeners still hear it.
        try { target.set(run.text.trim(), 'failed', message) } catch (e) { console.error(`[orrery] could not keep the failed run ${id}: ${(e as Error).message}`) }
        this.broadcast(run, { type: 'error', message })
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
      ? { type: 'snapshot', reading: run.text, state: 'writing', error: null }
      : { type: 'snapshot', reading: kept.text, state: kept.state, error: kept.error }
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
