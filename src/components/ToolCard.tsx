import { memo, useMemo, useState } from 'react'
import { ChevronRight, Loader, TriangleAlert, Wrench } from 'lucide-react'
import ChartWheel from './ChartWheel'
import { ActiveTransits, ForecastTransits } from './TransitTable'
import { looksLikeChart, parseWheel } from '../lib/chartWheel.ts'
import { looksLikeForecast, parseForecast } from '../lib/forecastTable.ts'
import { argValue, argsSummary, prettyOutput, sizeLabel, toolLabel } from '../lib/toolFormat.ts'
import type { ToolUse } from '../types.ts'

/** Output this short is shown whole; anything longer collapses to one line. */
const SHORT = 120

/**
 * One tool call the model made for an answer, as lm-chat shows them.
 * Collapsed, a single row: what ran, from where, how much it returned,
 * with its parameters on one line and one line of the result. Expanded,
 * each parameter in full, then the whole result in a scrolling panel,
 * JSON indented. A chart or forecast the astrology server returned is
 * drawn as a wheel or table either way.
 */
function ToolCard({ use }: { use: ToolUse }) {
  const [open, setOpen] = useState(false)
  const { name, plugin, args, ok } = use
  const text = use.output ?? ''
  const failed = ok === false
  const pending = ok === null
  const short = text.length > 0 && text.length <= SHORT
  const params = args && Object.keys(args).length ? Object.entries(args) : []
  const expandable = text.length > SHORT || params.length > 0
  const full = useMemo(() => (open ? prettyOutput(text) : ''), [open, text])
  const wheel = useMemo(() => (ok && looksLikeChart(text) ? parseWheel(text) : null), [ok, text])
  const forecast = useMemo(() => (ok && looksLikeForecast(text) ? parseForecast(text) : null), [ok, text])
  const meta = [plugin?.replace(/^mcp\//, ''), text.length > SHORT ? sizeLabel(text.length) : null, failed ? 'failed' : pending ? 'running…' : null]
    .filter(Boolean).join(' · ')

  return (
    <div className={`tool-card${failed ? ' failed' : ''}${open ? ' open' : ''}`}>
      <button
        type="button"
        className="tool-head"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        title={name}
      >
        <span className="tc-icon" aria-hidden="true">
          {failed ? <TriangleAlert size={14} /> : pending ? <Loader size={14} className="spin" /> : <Wrench size={14} />}
        </span>
        <span className="tc-title">
          <span className="tc-name">{toolLabel(name)}</span>
          {meta && <span className="tc-meta">{meta}</span>}
        </span>
        {expandable && (
          <span className="tc-chevron" data-open={open || undefined}>
            <ChevronRight size={16} aria-hidden="true" />
          </span>
        )}
      </button>
      {params.length > 0 && !open && <div className="tc-args" title={argsSummary(args!)}>{argsSummary(args!)}</div>}
      {params.length > 0 && open && (
        <dl className="tc-params" aria-label="Parameters">
          {params.map(([k, v]) => (
            <div key={k} className="tc-param">
              <dt>{k}</dt>
              <dd>{argValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {wheel && <ChartWheel wheel={wheel} />}
      {wheel?.kind === 'transit' && <ActiveTransits wheel={wheel} weights sortable />}
      {forecast && <ForecastTransits table={forecast} weights sortable />}
      {short && <div className="tc-short">{text}</div>}
      {text.length > SHORT && !open && <div className="tc-preview">{text.replace(/\s+/g, ' ').slice(0, 300)}</div>}
      {text.length > SHORT && open && <pre className="tc-output">{full}</pre>}
    </div>
  )
}

export default memo(ToolCard)
