import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import type { Casting, ReadingEvent, ReadingState } from '../types.ts'

export interface LiveReading {
  text: string
  state: ReadingState
  error: string | null
}

/**
 * A casting's reading as it is written. The server owns the writing; this
 * follows it over the event stream whenever it is in progress, and shows
 * the stored reading otherwise. A reconnect gets the whole text so far, so
 * nothing is missed while the phone was asleep.
 */
export function useReading(casting: Casting | null, onSettled?: (id: string) => void): LiveReading {
  const id = casting?.id ?? null
  const stored: LiveReading = casting
    ? { text: casting.reading, state: casting.readingState, error: casting.readingError }
    : { text: '', state: 'none', error: null }
  const [live, setLive] = useState<{ id: string; reading: LiveReading } | null>(null)

  useEffect(() => {
    if (!id || casting?.readingState !== 'writing') return undefined
    const source = new EventSource(api.eventsUrl(id))
    let text = ''
    // Written or failed: the stream is over, and whoever holds the casting can fetch the kept copy.
    const settle = (): void => { source.close(); onSettled?.(id) }
    source.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as ReadingEvent
      switch (event.type) {
        case 'snapshot':
          text = event.reading
          setLive({ id, reading: { text, state: event.state, error: event.error } })
          if (event.state !== 'writing') settle()
          break
        case 'delta':
          text += event.text
          setLive({ id, reading: { text, state: 'writing', error: null } })
          break
        case 'done':
          setLive({ id, reading: { text: event.reading, state: 'done', error: null } })
          settle()
          break
        case 'error':
          setLive({ id, reading: { text, state: 'failed', error: event.message } })
          settle()
          break
      }
    }
    // EventSource reconnects by itself; the snapshot on reconnect resets `text`.
    return () => source.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSettled is a stable callback from App
  }, [id, casting?.readingState])

  return live && live.id === id && (casting?.readingState === 'writing' || live.reading.state !== 'writing') ? live.reading : stored
}
