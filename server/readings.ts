import type { ServerResponse } from 'node:http'
import type { Brief, ReadingEvent, ReadingState, Step, Written } from '../src/types.ts'
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
  /** The writing starts now, from this request: nothing written, nothing on the trail. */
  begin(req: WriteRequest): void
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
  begin: (req) => store.beginReading(id, briefOf(req)),
  trail: (steps) => store.setReadingTrail(id, steps),
  finish: (text, state, error, written) => store.finishReading(id, text, state, error, written),
})

/** The prompt as the person may read it: the system part and the task, without the data under it. */
export const briefOf = (req: WriteRequest): Brief => ({ system: req.system, task: req.input.split('\n\nDATA:\n')[0]! })

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

/** Thinking arrives many pieces a second; the page gets them joined, this often. */
const THINKING_FLUSH_MS = 150

/**
 * How long the model may go quiet before a reading or answer is given up
 * on. Quiet means nothing at all: no text, no thinking, no tool event. A
 * reading itself may take as long as it needs; on this machine a day's
 * reading thinks for ten to fifteen minutes before it is done, and a cap on
 * the whole run cut those off mid-sentence. The longest normal silence is
 * the wait for the first token while a long prompt is read in (under a
 * minute, a few with a cold model), so this is well above that. Without it
 * a model that hangs leaves the casting writing forever, refusing questions
 * and holding up a deploy, until someone presses Stop.
 */
export const STALL_TIMEOUT_MS = 5 * 60_000

interface Run {
  text: string
  trail: Step[]
  /** LM Studio's step now, for a listener who joins mid-run. */
  status: string | null
  startedAt: number
  listeners: Set<ServerResponse>
  controller: AbortController
  /** Thinking not yet sent to the listeners, and the timer that will send it. */
  thought: string
  thoughtTimer: NodeJS.Timeout | null
}

export class Readings {
  private runs = new Map<string, Run>()

  constructor(private readonly store: Store, private readonly write = writeWithModel, private readonly stallMs = STALL_TIMEOUT_MS) {}

  get busy(): number { return this.runs.size }

  writing(id: string): boolean { return this.runs.has(id) }

  /** Start writing into a target, unless it is already being written. */
  start(id: string, req: WriteRequest, target: Target = readingOf(this.store, id)): void {
    if (this.runs.has(id)) return
    const run: Run = { text: '', trail: [], status: null, startedAt: Date.now(), listeners: new Set(), controller: new AbortController(), thought: '', thoughtTimer: null }
    this.runs.set(id, run)
    target.begin(req)
    // The stall clock: wound back by every piece the model sends, it fires only when the model has gone quiet for too long.
    const stall = new AbortController()
    let stallTimer: NodeJS.Timeout | null = null
    const heard = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => stall.abort(), this.stallMs)
    }
    heard()
    void (async () => {
      try {
        const reply = await this.write(this.store.getConfig(), req, (piece) => {
          heard()
          run.text += piece
          this.broadcast(run, { type: 'delta', text: piece })
        }, {
          signal: AbortSignal.any([run.controller.signal, stall.signal]),
          onTrail: (trail) => {
            heard()
            run.trail = trail
            target.trail(trail)
            this.broadcast(run, { type: 'trail', trail })
          },
          onStatus: (status) => {
            heard()
            run.status = status
            this.broadcast(run, { type: 'status', text: status })
          },
          onThinking: (piece) => {
            heard()
            run.trail = appendThinking(run.trail, piece)
            run.thought += piece
            if (!run.thoughtTimer) run.thoughtTimer = setTimeout(() => this.flushThinking(run), THINKING_FLUSH_MS)
          },
        })
        const reading = stripLeakedThinking(reply.text).trim()
        if (!reading) throw new ModelError('The model wrote nothing.')
        const written: Written = { trail: reply.trail, stats: reply.stats, startedAt: run.startedAt, finishedAt: Date.now() }
        target.finish(reading, 'done', null, written)
        this.broadcast(run, { type: 'done', reading, written })
      } catch (err) {
        // Stopped by the person, or given up on, before any other reading of the error: the model client wraps an abort as its own failure.
        const message = run.controller.signal.aborted ? 'Stopped before it was finished.'
          : stall.signal.aborted ? `Given up after ${Math.round(this.stallMs / 60_000)} minutes without a word from the model.`
          : err instanceof ModelError ? err.message : `Could not write the reading. (${(err as Error).message})`
        // Thinking cut short (stopped, or the model gave out) is over all the same: the page must not show it as still going.
        const trail = run.trail.map((s) => (s.kind === 'reasoning' && !s.done ? { ...s, done: true } : s))
        const written: Written = { trail, stats: null, startedAt: run.startedAt, finishedAt: Date.now() }
        // A store already closed (shutdown) has nowhere to keep the failure; the listeners still hear it.
        try { target.finish(run.text.trim(), 'failed', message, written) } catch (e) { console.error(`[orrery] could not keep the failed run ${id}: ${(e as Error).message}`) }
        this.broadcast(run, { type: 'error', message, written })
      } finally {
        if (stallTimer) clearTimeout(stallTimer)
        this.flushThinking(run)
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
    // The snapshot carries the thinking so far; what is waiting to go out goes out first, so this listener does not get it twice.
    if (run) this.flushThinking(run)
    const snapshot: ReadingEvent = run
      ? { type: 'snapshot', reading: run.text, state: 'writing', error: null, written: { trail: run.trail, stats: null, startedAt: run.startedAt, finishedAt: null }, status: run.status }
      : { type: 'snapshot', reading: kept.text, state: kept.state, error: kept.error, written: kept.written }
    res.write(frame(snapshot))
    if (!run) { res.end(); return true }
    run.listeners.add(res)
    res.on('close', () => run.listeners.delete(res))
    return true
  }

  /** The thinking waiting to go out, sent as one piece, ahead of anything else. */
  private flushThinking(run: Run): void {
    if (run.thoughtTimer) { clearTimeout(run.thoughtTimer); run.thoughtTimer = null }
    if (!run.thought) return
    const text = run.thought
    run.thought = ''
    this.send(run, { type: 'thinking', text })
  }

  private broadcast(run: Run, event: ReadingEvent): void {
    this.flushThinking(run)
    this.send(run, event)
  }

  private send(run: Run, event: ReadingEvent): void {
    const data = frame(event)
    for (const res of run.listeners) {
      try { res.write(data) } catch { run.listeners.delete(res) }
    }
  }
}

const frame = (event: ReadingEvent): string => `data: ${JSON.stringify(event)}\n\n`
