import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Reading from './Reading'
import CastingView from './CastingView'
import { liveLabel } from '../lib/liveLabel.ts'
import { NOT_WRITTEN } from '../types.ts'
import type { Casting, ReadingState } from '../types.ts'
import type { ReadingImage } from '../lib/readingImage.ts'
import single from '../test/fixtures/tarot-card.json?raw'

const image = (text: string): ReadingImage => ({ kind: 'daily-card', heading: 'Daily card', date: 0, cards: [], question: null, text })
const live = (state: ReadingState, text = 'The **Star**.') => ({ text, state, error: state === 'failed' ? 'LM Studio went away' : null, written: NOT_WRITTEN })
const download = () => screen.queryByRole('button', { name: /Download/ })

describe('Reading: Download', () => {
  it('is offered once a tarot reading has been written', () => {
    render(<Reading reading={live('done')} brief={null} image={image} onWrite={() => {}} onStop={() => {}} />)
    expect(download()).toBeEnabled()
  })

  it('is not offered while it is written, when it failed, or for a chart', () => {
    const { rerender } = render(<Reading reading={live('writing')} brief={null} image={image} onWrite={() => {}} onStop={() => {}} />)
    expect(download()).toBeNull()
    rerender(<Reading reading={live('failed')} brief={null} image={image} onWrite={() => {}} onStop={() => {}} />)
    expect(download()).toBeNull()
    rerender(<Reading reading={live('none', '')} brief={null} image={image} onWrite={() => {}} onStop={() => {}} />)
    expect(download()).toBeNull()
    rerender(<Reading reading={live('done')} brief={null} onWrite={() => {}} onStop={() => {}} />)
    expect(download()).toBeNull()
  })
})

describe('CastingView: Download', () => {
  const casting = (over: Partial<Casting>): Casting => ({
    id: 'c1', kind: 'card', period: '2026-10-14', title: 'Card · Oct 14', result: single, reading: 'The Five of Pentacles, reversed.', readingState: 'done', readingError: null,
    createdAt: 1, updatedAt: 1, memory: false, memoriesUsed: [], memoryExcluded: [], written: NOT_WRITTEN, transitReadings: null, style: null, note: '', brief: null, starred: false, ...over,
  })
  const view = (c: Casting) => render(<CastingView casting={c} memoryDefault={false} onMemory={() => {}} onExclude={() => {}} onFrame={() => {}} onMemories={() => {}} onWrite={() => {}} onStop={() => {}} onRecast={() => {}} onDelete={() => {}} onSettled={() => {}} />)

  it('offers the finished daily card, but not a chart reading', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const { unmount } = view(casting({}))
    expect(download()).toBeInTheDocument()
    unmount()
    view(casting({ kind: 'today', result: '{}', title: 'Today · Oct 14' }))
    expect(download()).toBeNull()
  })
})

describe('Reading: while it is written', () => {
  it('shows LM Studio\'s step and the seconds since it started', () => {
    vi.useFakeTimers({ now: 100_000 })
    try {
      const reading = { ...live('writing', ''), written: { ...NOT_WRITTEN, startedAt: 88_000 }, status: 'Reading the prompt 63%' }
      render(<Reading reading={reading} brief={null} onWrite={() => {}} onStop={() => {}} />)
      expect(screen.getByText(/Reading the prompt 63%… · 12s/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reads a tool call still out as what it looks up, and falls back without a status', () => {
    const tool = { kind: 'tool' as const, name: 'forecast_week', ok: null }
    expect(liveLabel({ text: '', written: { ...NOT_WRITTEN, trail: [tool] }, status: 'Using forecast_week' })).toMatch(/^Looking up /)
    expect(liveLabel({ text: '', written: NOT_WRITTEN, status: 'Thinking' })).toBe('Thinking')
    expect(liveLabel({ text: '', written: NOT_WRITTEN })).toBe('Starting')
    expect(liveLabel({ text: 'Some', written: NOT_WRITTEN, status: null })).toBe('Writing')
  })
})
