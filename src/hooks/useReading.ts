import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import { appendThinking } from '../lib/trail.ts'
import { NOT_WRITTEN } from '../types.ts'
import type { Casting, FollowUp, ReadingEvent, ReadingState, Written } from '../types.ts'

export interface LiveReading {
  text: string
  state: ReadingState
  error: string | null
  /** The model's trail so far, LM Studio's numbers once it is done, and when it started and finished. */
  written: Written
}

const NOTHING: LiveReading = { text: '', state: 'none', error: null, written: NOT_WRITTEN }

/** Text and thinking arrive many pieces a second; the page is redrawn with them this often. */
const FLUSH_MS = 120

/**
 * Text the server is writing, as it is written: a reading, or the answer
 * to a question under one. The server owns the writing; this follows it
 * over the event stream whenever it is in progress, and shows the stored
 * text otherwise. A reconnect gets the whole text so far, so nothing is
 * missed while the phone was asleep.
 */
export function useLiveText(id: string | null, stored: LiveReading, eventsUrl: (id: string) => string, onSettled?: (id: string) => void): LiveReading {
  const [live, setLive] = useState<{ id: string; reading: LiveReading } | null>(null)

  useEffect(() => {
    if (!id || stored.state !== 'writing') return undefined
    const source = new EventSource(eventsUrl(id))
    let text = ''
    let written: Written = stored.written
    let state: ReadingState = 'writing'
    let error: string | null = null
    let over = false
    // Pieces wait here and are applied together: one redraw per batch, not per piece.
    let pending: ReadingEvent[] = []
    let timer: number | null = null
    let thought = ''
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
            over = state !== 'writing'
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
            over = true
            break
          case 'error':
            written = event.written
            state = 'failed'
            error = event.message
            over = true
            break
        }
      }
      think()
      setLive({ id, reading: { text, state, error, written } })
      // Written or failed: the stream is over, and whoever holds the record can fetch the kept copy.
      if (over) { source.close(); onSettled?.(id) }
    }
    source.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as ReadingEvent
      pending.push(event)
      if (event.type === 'delta' || event.type === 'thinking') {
        if (timer === null) timer = window.setTimeout(flush, FLUSH_MS)
      } else {
        flush()
      }
    }
    // EventSource reconnects by itself after a dropped connection; the snapshot on reconnect resets `text`.
    // It gives up only when the server refuses the stream (the casting or question was deleted, say):
    // then nothing more will come, so the page stops showing it as being written and the record is fetched.
    source.onerror = () => {
      if (over || source.readyState !== EventSource.CLOSED) return
      flush()
      if (over) return
      state = 'failed'
      error = 'Lost the stream of this text. Reload to see where it got to.'
      over = true
      setLive({ id, reading: { text, state, error, written } })
      source.close()
      onSettled?.(id)
    }
    return () => { if (timer !== null) window.clearTimeout(timer); source.close() }
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
