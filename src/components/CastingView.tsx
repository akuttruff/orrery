import { useMemo } from 'react'
import { RotateCw, Trash2 } from 'lucide-react'
import ChartWheel from './ChartWheel'
import { ActiveTransits, ForecastTransits } from './TransitTable'
import MoonView from './MoonView'
import Reading from './Reading'
import { useReading } from '../hooks/useReading.ts'
import { parseWheel } from '../lib/chartWheel.ts'
import { parseForecast } from '../lib/forecastTable.ts'
import type { Casting } from '../types.ts'

interface CastingViewProps {
  casting: Casting
  onWrite: (again: boolean) => void
  onStop: () => void
  onRecast: () => void
  onDelete: () => void
  /** The reading finished (or failed) on the server: the kept casting can be fetched. */
  onSettled: (id: string) => void
}

/** No per-aspect readings here (the reading below covers the day), so the popups show the aspect alone. */
const NO_READINGS: Record<string, string> = {}

/** One casting: its chart or tables, then the reading. */
export default function CastingView({ casting, onWrite, onStop, onRecast, onDelete, onSettled }: CastingViewProps) {
  const reading = useReading(casting, onSettled)
  const wheel = useMemo(() => (casting.kind === 'today' || casting.kind === 'natal' ? parseWheel(casting.result) : null), [casting])
  const forecast = useMemo(() => (casting.kind === 'week' || casting.kind === 'month' || casting.kind === 'year' ? parseForecast(casting.result) : null), [casting])
  const castAt = new Date(casting.createdAt)

  return (
    <article className="casting">
      <header className="casting-head">
        <h2>{casting.title}</h2>
        <p className="casting-sub">Cast {castAt.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
      </header>
      {wheel && <ChartWheel wheel={wheel} readings={NO_READINGS} />}
      {wheel?.kind === 'transit' && <ActiveTransits wheel={wheel} />}
      {forecast && <ForecastTransits table={forecast} />}
      {casting.kind === 'moon' && <MoonView result={casting.result} />}
      {!wheel && !forecast && casting.kind !== 'moon' && <p className="reading-status error">The tool's result could not be drawn.</p>}
      <Reading reading={reading} onWrite={() => onWrite(reading.state === 'done' || reading.state === 'failed')} onStop={onStop} />
      <div className="casting-actions">
        <button type="button" className="chip" onClick={onRecast}><RotateCw size={13} aria-hidden="true" /> Recast</button>
        <button type="button" className="chip danger" onClick={onDelete}><Trash2 size={13} aria-hidden="true" /> Delete</button>
      </div>
    </article>
  )
}
