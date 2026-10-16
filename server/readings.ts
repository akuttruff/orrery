import type { ServerResponse } from 'node:http'
import type { ReadingEvent } from '../src/types.ts'
import type { WriteRequest } from './model.ts'
import { ModelError, writeWithModel } from './model.ts'
import type { Store } from './store.ts'

/**
 * Readings in progress. The model writes on the server, not in the browser,
 * so a phone that locks mid-sentence loses nothing: the text so far is
 * kept here, the page picks it up when it reconnects, and the finished
 * reading goes into the store either way.
 */

interface Run {
  text: string
  listeners: Set<ServerResponse>
  controller: AbortController
}

export class Readings {
  private runs = new Map<string, Run>()

  constructor(private readonly store: Store, private readonly write = writeWithModel) {}

  get busy(): number { return this.runs.size }

  /** Start writing a casting's reading, unless one is already being written. */
  start(id: string, req: WriteRequest): void {
    if (this.runs.has(id)) return
    const run: Run = { text: '', listeners: new Set(), controller: new AbortController() }
    this.runs.set(id, run)
    this.store.setReading(id, '', 'writing')
    void (async () => {
      try {
        const text = await this.write(this.store.getConfig(), req, (piece) => {
          run.text += piece
          this.broadcast(run, { type: 'delta', text: piece })
        }, run.controller.signal)
        const reading = text.trim()
        if (!reading) throw new ModelError('The model wrote nothing.')
        this.store.setReading(id, reading, 'done')
        this.broadcast(run, { type: 'done', reading })
      } catch (err) {
        const message = err instanceof ModelError ? err.message : `Could not write the reading. (${(err as Error).message})`
        this.store.setReading(id, run.text.trim(), 'failed', message)
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
   * Stream a casting's reading to a response: the snapshot first (what is
   * written so far, or the whole finished reading), then each new piece.
   * Ends with the reading.
   */
  subscribe(id: string, res: ServerResponse): boolean {
    const casting = this.store.getCasting(id)
    if (!casting) return false
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' })
    const run = this.runs.get(id)
    const snapshot: ReadingEvent = run
      ? { type: 'snapshot', reading: run.text, state: 'writing', error: null }
      : { type: 'snapshot', reading: casting.reading, state: casting.readingState, error: casting.readingError }
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
