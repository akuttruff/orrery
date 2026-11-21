import { memo, useMemo, useState } from 'react'

import { Brain, ListChecks, RotateCw, SlidersHorizontal, Trash2 } from 'lucide-react'
import MemoryPicker from './MemoryPicker'
import ChartWheel from './ChartWheel'
import { ActiveTransits, ForecastTransits } from './TransitTable'
import MoonView from './MoonView'
import Reading from './Reading'
import FollowUps from './FollowUps'
import TarotSpread from './TarotSpread'
import StyleChips from './StyleChips'
import ShapeOptions from './ShapeOptions'
import ThinkingChips from './ThinkingChips'
import { useReading } from '../hooks/useReading.ts'
import { parseWheel } from '../lib/chartWheel.ts'
import { parseForecast } from '../lib/forecastTable.ts'
import { parseReading } from '../lib/tarotSpread.ts'
import { tarotImage } from '../lib/tarotImage.ts'
import { castingImage } from '../lib/readingImage.ts'
import { formatWhen } from '../lib/when.ts'
import { styleOf, NOTE_MAX, type StyleId } from '../lib/styles.ts'
import { DEFAULT_SHAPE, shapeOf, shapeSummary, type ReadingShape } from '../lib/shape.ts'
import { birthLine, birthOf } from '../lib/open.ts'
import { isTarotKind } from '../types.ts'
import type { Casting } from '../types.ts'


interface CastingViewProps {
  casting: Casting
  /** Settings' default, for a casting with no switch of its own. */
  memoryDefault: boolean
  /** The thinking levels the model takes, for the shape's Thinking row; null when LM Studio can't say. */
  thinking?: string[] | null
  /** This casting's memory switch: on, off, or null to follow Settings. */
  onMemory: (memory: boolean | null) => void
  /** Which memories this casting leaves out, by id. */
  onExclude: (ids: string[]) => void
  /** The kind of reading, its shape and what it is for, changed before a Write again. */
  onFrame: (frame: { style?: StyleId; note?: string; shape?: ReadingShape }) => void
  onMemories: () => void
  onWrite: (again: boolean) => void
  onStop: () => void
  /** Cast this kind again with the same choices, or with another kind of reading. */
  onRecast: (style?: StyleId) => void
  onDelete: () => void
  /** The reading finished (or failed) on the server: the kept casting can be fetched. */
  onSettled: (id: string) => void
}

// The reading redraws this view many times a second while it streams; the chart and tables above it have not changed.
const Transits = memo(ActiveTransits)
const Forecast = memo(ForecastTransits)
const Moon = memo(MoonView)

/** One casting: its chart or tables, the reading, then the questions asked about it. */
export default function CastingView({ casting, memoryDefault, thinking = null, onMemory, onExclude, onFrame, onMemories, onWrite, onStop, onRecast, onDelete, onSettled }: CastingViewProps) {
  const memoryOn = casting.memory ?? memoryDefault
  const [picking, setPicking] = useState(false)
  const [framing, setFraming] = useState(false)
  const [noteDraft, setNoteDraft] = useState(casting.note)
  const style = styleOf(casting.style)
  const shaped = shapeSummary(casting.shape, casting.kind)
  const reading = useReading(casting, onSettled)
  const wheel = useMemo(() => (casting.kind === 'today' || casting.kind === 'natal' ? parseWheel(casting.result) : null), [casting])
  const forecast = useMemo(() => (casting.kind === 'week' || casting.kind === 'month' || casting.kind === 'year' ? parseForecast(casting.result) : null), [casting])
  const cards = useMemo(() => (isTarotKind(casting.kind) ? parseReading(casting.result) : null), [casting])
  /** What the reading is written from, when memory is off. */
  const source = isTarotKind(casting.kind) ? 'the cards' : 'the chart'
  if (casting.kind === 'open') return <OpenView casting={casting} reading={reading} thinking={thinking} onFrame={onFrame} onWrite={onWrite} onStop={onStop} onDelete={onDelete} />

  return (
    <article className="casting">
      <header className="casting-head">
        <h2>{casting.title}</h2>
        <p className="casting-sub">Cast {formatWhen(casting.createdAt)} · {style.label}{shaped ? ` · ${shaped}` : ''}{casting.note ? <> · <q className="casting-note">{casting.note}</q></> : ''}</p>
      </header>
      {wheel && <ChartWheel wheel={wheel} castingId={casting.id} readings={casting.transitReadings ?? undefined} />}
      {wheel?.kind === 'transit' && <Transits wheel={wheel} weights sortable />}
      {forecast && <Forecast table={forecast} weights sortable />}
      {casting.kind === 'moon' && <Moon result={casting.result} />}
      {cards && <TarotSpread reading={cards} image={tarotImage} />}
      {!wheel && !forecast && !cards && casting.kind !== 'moon' && <p className="reading-status error">The tool's result could not be drawn.</p>}
      <div className="memory-switch">
        <button type="button" className={`chip${framing ? ' on' : ''}`} aria-expanded={framing} onClick={() => setFraming((f) => !f)}>
          <SlidersHorizontal size={13} aria-hidden="true" /> {style.label}{shaped ? ' · shaped' : ''}{casting.note ? ' · framed' : ''}
        </button>
        <span className="memory-note">{reading.state === 'none' ? 'The kind of reading, its shape, what it is for, and memory; set them before it is written.' : 'The kind of reading, its shape, what it is for, and memory. Change them, then Write again.'}</span>
      </div>
      {framing && (
        <div className="frame" role="group" aria-label="Frame of the reading">
          <label className="ask-label" htmlFor={`note-${casting.id}`}>What you want from it, in your words</label>
          <textarea id={`note-${casting.id}`} className="ask-box frame-box" rows={2} maxLength={NOTE_MAX} value={noteDraft} placeholder="Optional. Context helps: “I'm going through some anxiety today”" onChange={(e) => setNoteDraft(e.target.value)} onBlur={() => { if (noteDraft.trim() !== casting.note) onFrame({ note: noteDraft.trim() }) }} />
          <StyleChips value={style.id} as="radio" onPick={(id) => onFrame({ style: id })} />
          <ShapeOptions kind={casting.kind} value={casting.shape} onChange={(shape) => onFrame({ shape })} thinking={thinking} disabled={reading.state === 'writing'} />
        </div>
      )}
      {!casting.subject && (
      <div className="memory-switch">
        <button
          type="button"
          role="switch"
          aria-checked={memoryOn}
          className={`chip${memoryOn ? ' on' : ''}`}
          onClick={() => onMemory(!memoryOn)}
          title={casting.memory === null ? 'Following Settings' : 'Set for this casting'}
        >
          <Brain size={13} aria-hidden="true" /> Memory {memoryOn ? 'on' : 'off'}
        </button>
        {memoryOn && (
          <button type="button" className={`chip${picking ? ' on' : ''}`} aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
            <ListChecks size={13} aria-hidden="true" /> Choose{casting.memoryExcluded.length ? ` · ${casting.memoryExcluded.length} out` : ''}
          </button>
        )}
        <span className="memory-note">
          {reading.state === 'none'
            ? memoryOn ? 'The reading will draw on what the model knows about you.' : `The reading will be written from ${source} alone.`
            : casting.memoriesUsed.length
              ? <>Written with <button type="button" className="link" onClick={() => setPicking(true)}>{casting.memoriesUsed.length} {casting.memoriesUsed.length === 1 ? 'memory' : 'memories'}</button>{memoryOn ? '' : '. Write again to leave them out.'}</>
              : <>Written from {source} alone{memoryOn ? '. Write again to bring memories in.' : ''}</>}
        </span>
      </div>
      )}
      {memoryOn && picking && <MemoryPicker excluded={casting.memoryExcluded} used={casting.memoriesUsed} onChange={onExclude} onManage={onMemories} />}
      <Reading reading={reading} brief={casting.brief} image={cards ? (text) => castingImage(casting, cards, text) : undefined} onWrite={() => onWrite(reading.state === 'done' || reading.state === 'failed')} onStop={onStop} />
      <FollowUps key={casting.id} castingId={casting.id} castingTitle={casting.title} kind={casting.kind} readingState={reading.state} readingText={reading.text} />
      {reading.state !== 'none' && (
        <div className="retone" role="group" aria-label="Read it again as">
          <span className="ask-label">Read it again as</span>
          <StyleChips value={style.id} as="button" disabled={reading.state === 'writing'} onPick={onRecast} chosenNote="How this one was read" />
          <span className="memory-note">A new casting of the same kind, read that way; this one stays.</span>
        </div>
      )}
      <div className="casting-actions">
        <button type="button" className="chip" onClick={() => onRecast()}><RotateCw size={13} aria-hidden="true" /> Recast</button>
        <button type="button" className="chip danger" onClick={onDelete}><Trash2 size={13} aria-hidden="true" /> Delete</button>
      </div>
    </article>
  )
}

interface OpenViewProps extends Pick<CastingViewProps, 'casting' | 'onFrame' | 'onWrite' | 'onStop' | 'onDelete'> {
  reading: ReturnType<typeof useReading>
  thinking: string[] | null
}

/**
 * An open session: whose birth details it was given, the first message,
 * the model's reply with the tools it called, then the conversation. No
 * chart is drawn up front, no tone or shape, no memory: only how hard the
 * model thinks, for a Write again.
 */
function OpenView({ casting, reading, thinking, onFrame, onWrite, onStop, onDelete }: OpenViewProps) {
  const birth = birthOf(casting.result)
  const whose = casting.subject ? `${casting.subject.name}, born` : 'Born'
  return (
    <article className="casting">
      <header className="casting-head">
        <h2>{casting.title}</h2>
        <p className="casting-sub">Started {formatWhen(casting.createdAt)}{birth ? ` · ${whose} ${birthLine(birth)}` : ''}</p>
      </header>
      <blockquote className="open-message">{casting.note}</blockquote>
      {reading.state !== 'writing' && (
        <ThinkingChips value={shapeOf(casting.shape).thinking} thinking={thinking} onPick={(id) => onFrame({ shape: { ...DEFAULT_SHAPE, parts: [...DEFAULT_SHAPE.parts], thinking: id } })} />
      )}
      <Reading reading={reading} brief={casting.brief} title="Reply" briefNote={null} onWrite={() => onWrite(reading.state === 'done' || reading.state === 'failed')} onStop={onStop} />
      <FollowUps key={casting.id} castingId={casting.id} castingTitle={casting.title} kind="open" readingState={reading.state} readingText={reading.text} />
      <div className="casting-actions">
        <button type="button" className="chip danger" onClick={onDelete}><Trash2 size={13} aria-hidden="true" /> Delete</button>
      </div>
    </article>
  )
}
