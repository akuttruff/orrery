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
    // Written or failed: the stream is over, and whoever holds the record can fetch the kept copy.
    const settle = (): void => { source.close(); onSettled?.(id) }
    const show = (state: ReadingState, error: string | null = null): void => setLive({ id, reading: { text, state, error, written } })
    source.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as ReadingEvent
      switch (event.type) {
        case 'snapshot':
          text = event.reading
          written = event.written
          show(event.state, event.error)
          if (event.state !== 'writing') settle()
          break
        case 'delta':
          text += event.text
          show('writing')
          break
        case 'thinking':
          written = { ...written, trail: appendThinking(written.trail, event.text) }
          show('writing')
          break
        case 'trail':
          written = { ...written, trail: event.trail }
          show('writing')
          break
        case 'done':
          text = event.reading
          written = event.written
          show('done')
          settle()
          break
        case 'error':
          written = event.written
          show('failed', event.message)
          settle()
          break
      }
    }
    // EventSource reconnects by itself; the snapshot on reconnect resets `text`.
    return () => source.close()
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
