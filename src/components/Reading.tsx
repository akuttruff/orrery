import { RefreshCw, Square } from 'lucide-react'
import Body from './Body'
import Trail from './Trail'
import WrittenMeta from './WrittenMeta'
import LiveStatus from './LiveStatus'
import DownloadButton from './DownloadButton'
import type { LiveReading } from '../hooks/useReading.ts'
import type { ReadingImage } from '../lib/readingImage.ts'
import type { Brief } from '../types.ts'

interface ReadingProps {
  reading: LiveReading
  /** The brief the reading was written with, for anyone who wants to see it. */
  brief: Brief | null
  onWrite: () => void
  onStop: () => void
  /** A tarot reading as a picture to save; offered once the reading is written. */
  image?: (text: string) => ReadingImage
  /** The section's heading: 'Reading', or 'Reply' for an open session. */
  title?: string
  /** What follows the brief's task, said under it; null says nothing. */
  briefNote?: string | null
  /**
   * A reply in an open session's conversation: no heading, the tool calls
   * folded to a line, and Stop or Write again under it rather than above.
   * Write again is offered only while it is the last reply (canRewrite).
   */
  reply?: boolean
  canRewrite?: boolean
}

/** The model's reading under the chart: its thinking first, then the text streamed in and kept, then what it cost. */
export default function Reading({ reading, brief, onWrite, onStop, image, title = 'Reading', briefNote = "The chart's data follows the task; it is what the tables above are drawn from.", reply = false, canRewrite = true }: ReadingProps) {
  const { text, state, error, written } = reading
  if (reply) {
    return (
      <section className="reading reply" aria-live="polite" aria-label="Reply">
        {state === 'writing' && <LiveStatus reading={reading} note="This carries on if you go back and cast another." />}
        <Trail trail={written.trail} folded />
        {text && <Body text={text} writing={state === 'writing'} />}
        {state === 'failed' && <p className="reading-status error">{error ?? 'The reply failed.'}</p>}
        {state === 'none' && <p className="reading-status">No reply yet.</p>}
        <div className="followup-actions">
          {state === 'writing' && <button type="button" className="chip" onClick={onStop}><Square size={13} aria-hidden="true" /> Stop</button>}
          {state !== 'writing' && (canRewrite || state !== 'done') && (
            <button type="button" className="chip" onClick={onWrite}>
              <RefreshCw size={13} aria-hidden="true" /> {state === 'done' ? 'Write again' : state === 'failed' ? 'Try again' : 'Write'}
            </button>
          )}
        </div>
        <WrittenMeta written={written} state={state} label="Written" />
        {brief && state !== 'none' && (
          <details className="brief">
            <summary>Brief</summary>
            <pre className="brief-text">{brief.system}{'\n\n'}{brief.task}</pre>
          </details>
        )}
      </section>
    )
  }
  return (
    <section className="reading" aria-live="polite">
      <div className="reading-head">
        <h3 className="section-title">{title}</h3>
        {state === 'writing' ? (
          <button type="button" className="chip" onClick={onStop}><Square size={13} aria-hidden="true" /> Stop</button>
        ) : (
          <button type="button" className="chip" onClick={onWrite}>
            <RefreshCw size={13} aria-hidden="true" /> {state === 'done' ? 'Write again' : state === 'failed' ? 'Try again' : 'Write'}
          </button>
        )}
      </div>
      {state === 'writing' && <LiveStatus reading={reading} note="This carries on if you go back and cast another." />}
      <Trail trail={written.trail} />
      {text && <Body text={text} writing={state === 'writing'} />}
      {state === 'failed' && <p className="reading-status error">{error ?? `The ${title.toLowerCase()} failed.`}</p>}
      {state === 'none' && <p className="reading-status">No {title.toLowerCase()} yet.</p>}
      {image && state === 'done' && text && (
        <div className="reading-actions">
          <DownloadButton image={() => image(text)} />
        </div>
      )}
      <WrittenMeta written={written} state={state} label="Written" />
      {brief && state !== 'none' && (
        <details className="brief">
          <summary>The brief this was written with</summary>
          <pre className="brief-text">{brief.system}{'\n\n'}{brief.task}</pre>
          {briefNote && <p className="memory-note">{briefNote}</p>}
        </details>
      )}
    </section>
  )
}
