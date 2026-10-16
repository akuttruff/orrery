import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { RefreshCw, Square } from 'lucide-react'
import type { LiveReading } from '../hooks/useReading.ts'

interface ReadingProps {
  reading: LiveReading
  onWrite: () => void
  onStop: () => void
}

/** The model's reading under the chart: streamed in, then kept. */
export default function Reading({ reading, onWrite, onStop }: ReadingProps) {
  const { text, state, error } = reading
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
      {text && (
        <div className={`reading-body${state === 'writing' ? ' writing' : ''}`}>
          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
        </div>
      )}
      {state === 'writing' && <p className="reading-status">{text ? 'Writing' : 'Thinking'}… This carries on if you go back and cast another.</p>}
      {state === 'failed' && <p className="reading-status error">{error ?? 'The reading failed.'}</p>}
      {state === 'none' && <p className="reading-status">No reading yet.</p>}
    </section>
  )
}
