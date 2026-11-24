import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import { openLive } from '../lib/live.ts'
import { appendThinking } from '../lib/trail.ts'
import { NOT_WRITTEN } from '../types.ts'
import type { Casting, FollowUp, ReadingEvent, ReadingState, Written } from '../types.ts'

export interface LiveReading {
  text: string
  state: ReadingState
  error: string | null
  /** The model's trail so far, LM Studio's numbers once it is done, and when it started and finished. */
  written: Written
  /** While it is being written, what LM Studio is doing: "Reading the prompt 63%", "Thinking". */
  status?: string | null
}

const NOTHING: LiveReading = { text: '', state: 'none', error: null, written: NOT_WRITTEN }

/** Text and thinking arrive many pieces a second; the page is redrawn with them this often. */
const FLUSH_MS = 120

/**
 * Text the server is writing, as it is written: a reading, or the answer
 * to a question under one. The server owns the writing; this follows it
 * over the event stream whenever it is in progress, and shows the stored
 * text otherwise. A reconnect gets the whole text so far, so nothing is
 * missed while the phone was asleep. The stream is kept open by
 * lib/live.ts: one that drops or goes quiet is opened again, and a drop is
 * never taken to mean the writing failed, since it goes on on the server.
 */
export function useLiveText(id: string | null, stored: LiveReading, eventsUrl: (id: string) => string, onSettled?: (id: string) => void): LiveReading {
  const [live, setLive] = useState<{ id: string; reading: LiveReading } | null>(null)

  useEffect(() => {
    if (!id || stored.state !== 'writing') return undefined
    let text = ''
    let written: Written = stored.written
    let state: ReadingState = 'writing'
    let error: string | null = null
    let status: string | null = null
    let over = false
    // Pieces wait here and are applied together: one redraw per batch, not per piece.
    let pending: ReadingEvent[] = []
    let timer: number | null = null
    let thought = ''
    /** The stream has been out for more than a moment (lib/live.ts waits before saying). */
    let away = false
    const think = (): void => {
      if (!thought) return
      written = { ...written, trail: appendThinking(written.trail, thought) }
      thought = ''
    }
    const flush = (): void => {
      if (timer !== null) { window.clearTimeout(timer); timer = null }
      const batch = pending
      pending = []
      for (const event of batch) {
        if (event.type !== 'thinking') think()
        switch (event.type) {
          case 'snapshot':
            text = event.reading
            written = event.written
            state = event.state
            error = event.error
            status = event.status ?? null
            over = state !== 'writing'
            break
          case 'status':
            status = event.text
            break
          case 'delta':
            text += event.text
            break
          case 'thinking':
            thought += event.text
            break
          case 'trail':
            written = { ...written, trail: event.trail }
            break
          case 'done':
            text = event.reading
            written = event.written
            state = 'done'
            status = null
            over = true
            break
          case 'error':
            written = event.written
            state = 'failed'
            error = event.message
            status = null
            over = true
            break
        }
      }
      think()
      setLive({ id, reading: { text, state, error, written, status: away && !over ? 'Reconnecting — it carries on writing meanwhile' : status } })
      // Written or failed: the stream is over, and whoever holds the record can fetch the kept copy.
      if (over) { stream.close(); onSettled?.(id) }
    }
    const stream = openLive({
      url: eventsUrl(id),
      onMessage: (data) => {
        const event = JSON.parse(data) as ReadingEvent
        pending.push(event)
        if (event.type === 'delta' || event.type === 'thinking') {
          if (timer === null) timer = window.setTimeout(flush, FLUSH_MS)
        } else {
          flush()
        }
      },
      onState: (link) => {
        away = link === 'down'
        if (!over) flush()
      },
      // A stream being replaced: look at the record too. If the text was finished, or the
      // casting or question deleted, meanwhile, the stored copy says so and this stream is
      // closed (the effect runs again); while it is still being written, nothing changes.
      onRetry: () => { if (!over) onSettled?.(id) },
    })
    return () => { if (timer !== null) window.clearTimeout(timer); stream.close() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSettled and eventsUrl are stable
  }, [id, stored.state])

  return live && live.id === id && (stored.state === 'writing' || live.reading.state !== 'writing') ? live.reading : stored
}

/** A casting's reading as it is written. */
export function useReading(casting: Casting | null, onSettled?: (id: string) => void): LiveReading {
  const stored: LiveReading = casting ? { text: casting.reading, state: casting.readingState, error: casting.readingError, written: casting.written } : NOTHING
  return useLiveText(casting?.id ?? null, stored, api.eventsUrl, onSettled)
}

/** A follow-up's answer as it is written. */
export function useAnswer(followUp: FollowUp, onSettled?: (id: string) => void): LiveReading {
  const stored: LiveReading = { text: followUp.answer, state: followUp.state, error: followUp.error, written: followUp.written }
  return useLiveText(followUp.id, stored, api.followUpEventsUrl, onSettled)
}
