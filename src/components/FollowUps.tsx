import { useCallback, useEffect, useRef, useState } from 'react'
import { Brain, RefreshCw, SendHorizontal, Sparkles, Square, X } from 'lucide-react'
import Body from './Body'
import Trail from './Trail'
import WrittenMeta from './WrittenMeta'
import { useAnswer } from '../hooks/useReading.ts'
import { api } from '../lib/api.ts'
import { toolLabel } from '../lib/toolFormat.ts'
import { pendingTools, thinking } from '../lib/trail.ts'
import { formatWhen } from '../lib/when.ts'
import { imageFor } from '../lib/tarotSpread.ts'
import { isTarotKind } from '../types.ts'
import type { FollowUp, Kind, ReadingState } from '../types.ts'

/** The note-taking beside an answer is a model call of its own; look for its result this often, this many times. */
const REMEMBER_POLL_MS = 5000
const REMEMBER_POLLS = 24

interface FollowUpsProps {
  castingId: string
  /** What was cast: a chart can have a card pulled beside it. */
  kind?: Kind
  /** The reading's state: questions wait until it is written. */
  readingState: ReadingState
  readingText: string
}

/**
 * The conversation under a reading: each question asked and the answer the
 * model wrote, then a box to ask the next. The answers are written on the
 * server like the reading, so one streams in and is kept.
 */
export default function FollowUps({ castingId, kind = 'today', readingState, readingText }: FollowUpsProps) {
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
  // What the question revealed is worked out beside the answer and can take a while longer; keep looking until it is in.
  const settled = useCallback((id: string) => {
    const look = (left: number): void => {
      api.followUp(id).then((f) => {
        replace(f)
        if (f.remembered === null && left > 0) setTimeout(() => look(left - 1), REMEMBER_POLL_MS)
      }).catch(() => { /* next open */ })
    }
    look(REMEMBER_POLLS)
  }, [replace])

  const forget = async (f: FollowUp, memoryId: string): Promise<void> => {
    await api.forget(memoryId).catch(() => { /* already gone */ })
    replace({ ...f, remembered: (f.remembered ?? []).filter((m) => m.id !== memoryId) })
  }

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
      // The question may have reached the server even though the reply did not come back: show what it has.
      api.followUps(castingId).then(setItems).catch(() => { /* shown on the next open */ })
    } finally {
      setSending(false)
      box.current?.focus()
    }
  }

  /** A card dealt beside the reading, read against it by the model. */
  const pull = async (): Promise<void> => {
    if (!ready || answering || sending) return
    setSending(true)
    setError(null)
    try {
      const f = await api.pullCard(castingId)
      setItems((cur) => [...cur, f])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
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
          <FollowUpItem key={f.id} followUp={f} onSettled={settled} onAgain={() => void again(f)} onStop={() => void stop(f)} onRemove={() => void remove(f)} onForget={(id) => void forget(f, id)} />
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
            // Enter asks, as in LM Chat; Shift+Enter makes a new line.
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask() } }}
          />
          <button type="submit" className="ask-send" aria-label="Ask" disabled={!canAsk}>
            <SendHorizontal size={18} aria-hidden="true" />
          </button>
        </div>
        {!isTarotKind(kind) && (
          <div className="pull-row">
            <button type="button" className="chip" disabled={!ready || answering || sending} onClick={() => void pull()}><Sparkles size={13} aria-hidden="true" /> Pull a card</button>
            <span className="memory-note">One tarot card, dealt now and read against this reading.</span>
          </div>
        )}
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
  onForget: (memoryId: string) => void
}

function FollowUpItem({ followUp, onSettled, onAgain, onStop, onRemove, onForget }: FollowUpItemProps) {
  const { text, state, error, written } = useAnswer(followUp, onSettled)
  const pending = pendingTools(written.trail)
  const status = thinking(written.trail) ? 'Thinking…' : pending.length ? `Looking up ${pending.map((t) => toolLabel(t.name)).join(', ')}…` : written.trail.length ? 'Writing…' : 'Starting…'
  return (
    <li className="followup">
      <div className="followup-q">
        {followUp.card ? (
          <div className="followup-card">
            <img src={imageFor(followUp.card.card.id)} alt={`${followUp.card.card.name}${followUp.card.reversed ? ', reversed' : ''}`} style={{ transform: followUp.card.reversed ? 'rotate(180deg)' : undefined }} loading="lazy" />
            <div className="followup-card-text">
              <p>Pulled a card: <b>{followUp.card.card.name}{followUp.card.reversed ? ', reversed' : ''}</b></p>
              <span className="followup-card-keys">{followUp.card.keywords.join(' · ')}</span>
            </div>
          </div>
        ) : <p>{followUp.question}</p>}
        <span className="followup-when">{formatWhen(followUp.createdAt)}</span>
        {state !== 'writing' && (
          <button type="button" className="icon-btn small" aria-label="Remove question" onClick={onRemove}><X size={15} aria-hidden="true" /></button>
        )}
      </div>
      <div className="followup-a" aria-live="polite">
        <Trail trail={written.trail} />
        {text && <Body text={text} writing={state === 'writing'} />}
        {state === 'writing' && !text && <p className="reading-status">{status}</p>}
        {state === 'failed' && <p className="reading-status error">{error ?? 'The answer failed.'}</p>}
        <div className="followup-actions">
          {state === 'writing' && <button type="button" className="chip" onClick={onStop}><Square size={13} aria-hidden="true" /> Stop</button>}
          {state === 'failed' && <button type="button" className="chip" onClick={onAgain}><RefreshCw size={13} aria-hidden="true" /> Try again</button>}
        </div>
        <WrittenMeta written={written} state={state} label="Answered" />
        {(state === 'done' || state === 'failed') && (
          <p className="followup-memory">
            {followUp.memoriesUsed.length
              ? `Answered with ${followUp.memoriesUsed.length} ${followUp.memoriesUsed.length === 1 ? 'memory' : 'memories'}`
              : 'Answered without memories'}
            {followUp.remembered === null && ' · noting what this reveals…'}
            {followUp.remembered?.length === 0 && followUp.memoriesUsed.length > 0 && ' · nothing new to remember'}
          </p>
        )}
        {followUp.remembered && followUp.remembered.length > 0 && (
          <ul className="remembered" aria-label="Remembered from this question">
            {followUp.remembered.map((m) => (
              <li key={m.id}>
                <Brain size={13} aria-hidden="true" />
                <span>{m.text}</span>
                <button type="button" className="link" onClick={() => onForget(m.id)}>Forget</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}
