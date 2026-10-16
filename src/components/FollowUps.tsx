import { useCallback, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { RefreshCw, SendHorizontal, Square, X } from 'lucide-react'
import { useAnswer } from '../hooks/useReading.ts'
import { api } from '../lib/api.ts'
import type { FollowUp, ReadingState } from '../types.ts'

interface FollowUpsProps {
  castingId: string
  /** The reading's state: questions wait until it is written. */
  readingState: ReadingState
  readingText: string
}

/**
 * The conversation under a reading: each question asked and the answer the
 * model wrote, then a box to ask the next. The answers are written on the
 * server like the reading, so one streams in and is kept.
 */
export default function FollowUps({ castingId, readingState, readingText }: FollowUpsProps) {
  const [items, setItems] = useState<FollowUp[]>([])
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  // Keyed by casting in CastingView, so a new casting starts this afresh.
  useEffect(() => {
    let live = true
    api.followUps(castingId).then((f) => { if (live) setItems(f) }).catch(() => { /* shown once they ask */ })
    return () => { live = false }
  }, [castingId])

  const replace = useCallback((f: FollowUp) => setItems((cur) => cur.map((x) => (x.id === f.id ? f : x))), [])
  // Answered (or failed) on the server: fetch the kept copy, so a reopen shows it without the stream.
  const settled = useCallback((id: string) => { api.followUp(id).then(replace).catch(() => { /* next open */ }) }, [replace])

  const answering = items.some((f) => f.state === 'writing')
  const ready = readingState === 'done' || (readingState === 'failed' && readingText.length > 0)
  const canAsk = ready && !answering && !sending && question.trim().length > 0

  const ask = async (): Promise<void> => {
    const q = question.trim()
    if (!q || !canAsk) return
    setSending(true)
    setError(null)
    try {
      const f = await api.ask(castingId, q)
      setItems((cur) => [...cur, f])
      setQuestion('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
      box.current?.focus()
    }
  }

  const again = async (f: FollowUp): Promise<void> => {
    try { replace(await api.askAgain(f.id)) } catch (e) { setError((e as Error).message) }
  }
  const stop = async (f: FollowUp): Promise<void> => {
    await api.stopAnswer(f.id).catch(() => { /* already finished */ })
    api.followUp(f.id).then(replace).catch(() => { /* gone */ })
  }
  const remove = async (f: FollowUp): Promise<void> => {
    await api.removeFollowUp(f.id).catch(() => { /* already gone */ })
    setItems((cur) => cur.filter((x) => x.id !== f.id))
  }

  return (
    <section className="followups" aria-label="Questions about the reading">
      {items.length > 0 && <h3 className="section-title">Questions</h3>}
      <ol className="followup-list">
        {items.map((f) => (
          <FollowUpItem key={f.id} followUp={f} onSettled={settled} onAgain={() => void again(f)} onStop={() => void stop(f)} onRemove={() => void remove(f)} />
        ))}
      </ol>
      <form
        className="ask"
        onSubmit={(e) => { e.preventDefault(); void ask() }}
      >
        <label className="ask-label" htmlFor={`ask-${castingId}`}>{items.length ? 'Ask another' : 'Ask about this reading'}</label>
        <div className="ask-row">
          <textarea
            id={`ask-${castingId}`}
            ref={box}
            className="ask-box"
            rows={2}
            value={question}
            placeholder={ready ? 'What does this mean for…' : readingState === 'writing' ? 'Questions open once the reading is written' : 'Write the reading first, then ask'}
            disabled={!ready || answering || sending}
            enterKeyHint="send"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void ask() } }}
          />
          <button type="submit" className="ask-send" aria-label="Ask" disabled={!canAsk}>
            <SendHorizontal size={18} aria-hidden="true" />
          </button>
        </div>
        {error && <p className="reading-status error" role="alert">{error}</p>}
      </form>
    </section>
  )
}

interface FollowUpItemProps {
  followUp: FollowUp
  onSettled: (id: string) => void
  onAgain: () => void
  onStop: () => void
  onRemove: () => void
}

function FollowUpItem({ followUp, onSettled, onAgain, onStop, onRemove }: FollowUpItemProps) {
  const { text, state, error } = useAnswer(followUp, onSettled)
  return (
    <li className="followup">
      <div className="followup-q">
        <p>{followUp.question}</p>
        {state !== 'writing' && (
          <button type="button" className="icon-btn small" aria-label="Remove question" onClick={onRemove}><X size={15} aria-hidden="true" /></button>
        )}
      </div>
      <div className="followup-a" aria-live="polite">
        {text && (
          <div className={`reading-body${state === 'writing' ? ' writing' : ''}`}>
            <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
          </div>
        )}
        {state === 'writing' && !text && <p className="reading-status">Thinking…</p>}
        {state === 'failed' && <p className="reading-status error">{error ?? 'The answer failed.'}</p>}
        <div className="followup-actions">
          {state === 'writing' && <button type="button" className="chip" onClick={onStop}><Square size={13} aria-hidden="true" /> Stop</button>}
          {state === 'failed' && <button type="button" className="chip" onClick={onAgain}><RefreshCw size={13} aria-hidden="true" /> Try again</button>}
        </div>
      </div>
    </li>
  )
}
