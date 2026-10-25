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
}

/** The model's reading under the chart: its thinking first, then the text streamed in and kept, then what it cost. */
export default function Reading({ reading, brief, onWrite, onStop, image }: ReadingProps) {
  const { text, state, error, written } = reading
  return (
    <section className="reading" aria-live="polite">
      <div className="reading-head">
        <h3 className="section-title">Reading</h3>
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
      {state === 'failed' && <p className="reading-status error">{error ?? 'The reading failed.'}</p>}
      {state === 'none' && <p className="reading-status">No reading yet.</p>}
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
          <p className="memory-note">The chart's data follows the task; it is what the tables above are drawn from.</p>
        </details>
      )}
    </section>
  )
}
