import { useMemo, useState } from 'react'
import { Brain, ListChecks, RotateCw, Trash2 } from 'lucide-react'
import MemoryPicker from './MemoryPicker'
import ChartWheel from './ChartWheel'
import { ActiveTransits, ForecastTransits } from './TransitTable'
import MoonView from './MoonView'
import Reading from './Reading'
import FollowUps from './FollowUps'
import { useReading } from '../hooks/useReading.ts'
import { parseWheel } from '../lib/chartWheel.ts'
import { parseForecast } from '../lib/forecastTable.ts'
import { formatWhen } from '../lib/when.ts'
import type { Casting } from '../types.ts'

interface CastingViewProps {
  casting: Casting
  /** Settings' default, for a casting with no switch of its own. */
  memoryDefault: boolean
  /** This casting's memory switch: on, off, or null to follow Settings. */
  onMemory: (memory: boolean | null) => void
  /** Which memories this casting leaves out, by id. */
  onExclude: (ids: string[]) => void
  onMemories: () => void
  onWrite: (again: boolean) => void
  onStop: () => void
  onRecast: () => void
  onDelete: () => void
  /** The reading finished (or failed) on the server: the kept casting can be fetched. */
  onSettled: (id: string) => void
}

/** No per-aspect readings here (the reading below covers the day), so the popups show the aspect alone. */
const NO_READINGS: Record<string, string> = {}

/** One casting: its chart or tables, the reading, then the questions asked about it. */
export default function CastingView({ casting, memoryDefault, onMemory, onExclude, onMemories, onWrite, onStop, onRecast, onDelete, onSettled }: CastingViewProps) {
  const memoryOn = casting.memory ?? memoryDefault
  const [picking, setPicking] = useState(false)
  const reading = useReading(casting, onSettled)
  const wheel = useMemo(() => (casting.kind === 'today' || casting.kind === 'natal' ? parseWheel(casting.result) : null), [casting])
  const forecast = useMemo(() => (casting.kind === 'week' || casting.kind === 'month' || casting.kind === 'year' ? parseForecast(casting.result) : null), [casting])

  return (
    <article className="casting">
      <header className="casting-head">
        <h2>{casting.title}</h2>
        <p className="casting-sub">Cast {formatWhen(casting.createdAt)}</p>
      </header>
      {wheel && <ChartWheel wheel={wheel} castingId={casting.id} readings={NO_READINGS} />}
      {wheel?.kind === 'transit' && <ActiveTransits wheel={wheel} />}
      {forecast && <ForecastTransits table={forecast} />}
      {casting.kind === 'moon' && <MoonView result={casting.result} />}
      {!wheel && !forecast && casting.kind !== 'moon' && <p className="reading-status error">The tool's result could not be drawn.</p>}
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
            ? memoryOn ? 'The reading will draw on what the model knows about you.' : 'The reading will be written from the chart alone.'
            : casting.memoriesUsed.length
              ? <>Written with <button type="button" className="link" onClick={() => setPicking(true)}>{casting.memoriesUsed.length} {casting.memoriesUsed.length === 1 ? 'memory' : 'memories'}</button>{memoryOn ? '' : '. Write again to leave them out.'}</>
              : <>Written from the chart alone{memoryOn ? '. Write again to bring memories in.' : ''}</>}
        </span>
      </div>
      {memoryOn && picking && <MemoryPicker excluded={casting.memoryExcluded} used={casting.memoriesUsed} onChange={onExclude} onManage={onMemories} />}
      <Reading reading={reading} onWrite={() => onWrite(reading.state === 'done' || reading.state === 'failed')} onStop={onStop} />
      <FollowUps key={casting.id} castingId={casting.id} readingState={reading.state} readingText={reading.text} />
      <div className="casting-actions">
        <button type="button" className="chip" onClick={onRecast}><RotateCw size={13} aria-hidden="true" /> Recast</button>
        <button type="button" className="chip danger" onClick={onDelete}><Trash2 size={13} aria-hidden="true" /> Delete</button>
      </div>
    </article>
  )
}
