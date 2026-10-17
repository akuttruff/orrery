import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import type { Casting, FollowUp, ReadingEvent, ReadingState, ToolUse } from '../types.ts'

export interface LiveReading {
  text: string
  state: ReadingState
  error: string | null
  /** The tools called so far, for an answer. */
  tools: ToolUse[]
}

const NOTHING: LiveReading = { text: '', state: 'none', error: null, tools: [] }

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
    let tools: ToolUse[] = stored.tools
    // Written or failed: the stream is over, and whoever holds the record can fetch the kept copy.
    const settle = (): void => { source.close(); onSettled?.(id) }
    source.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as ReadingEvent
      switch (event.type) {
        case 'snapshot':
          text = event.reading
          tools = event.tools ?? tools
          setLive({ id, reading: { text, state: event.state, error: event.error, tools } })
          if (event.state !== 'writing') settle()
          break
        case 'delta':
          text += event.text
          setLive({ id, reading: { text, state: 'writing', error: null, tools } })
          break
        case 'tools':
          tools = event.tools
          setLive({ id, reading: { text, state: 'writing', error: null, tools } })
          break
        case 'done':
          setLive({ id, reading: { text: event.reading, state: 'done', error: null, tools } })
          settle()
          break
        case 'error':
          setLive({ id, reading: { text, state: 'failed', error: event.message, tools } })
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
  const stored: LiveReading = casting ? { text: casting.reading, state: casting.readingState, error: casting.readingError, tools: [] } : NOTHING
  return useLiveText(casting?.id ?? null, stored, api.eventsUrl, onSettled)
}

/** A follow-up's answer as it is written. */
export function useAnswer(followUp: FollowUp, onSettled?: (id: string) => void): LiveReading {
  const stored: LiveReading = { text: followUp.answer, state: followUp.state, error: followUp.error, tools: followUp.tools }
  return useLiveText(followUp.id, stored, api.followUpEventsUrl, onSettled)
}
