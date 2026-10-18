import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App, { WRITING_POLL_MS } from './App'
import { NOT_WRITTEN } from './types.ts'
import type { Casting, CastingSummary } from './types.ts'

const casting = (id: string, over: Partial<Casting> = {}): Casting => ({
  id, kind: 'today', period: '2026-10-16', title: `Casting ${id}`, result: '{}', reading: '', readingState: 'writing', readingError: null,
  createdAt: 1, updatedAt: 1, memory: null, memoriesUsed: [], memoryExcluded: [], written: NOT_WRITTEN, ...over,
})
const summary = ({ result: _r, reading: _g, ...rest }: Casting): CastingSummary => ({ ...rest, questions: 0 })

/** A fetch that serves the app's routes from a list of castings the test can change. */
function serve(castings: Casting[]) {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    // A tap casts anew: the new casting joins the list, and its reading is started.
    if (url === '/api/castings' && init?.method === 'POST') {
      const { kind } = JSON.parse(String(init.body)) as { kind: Casting['kind'] }
      const c = casting(`new${castings.length + 1}`, { kind, readingState: 'none', createdAt: 100, updatedAt: 100 })
      castings.push(c)
      return reply(201, c)
    }
    const reading = /^\/api\/castings\/([^/]+)\/reading$/.exec(url)
    if (reading && init?.method === 'POST') {
      const c = castings.find((x) => x.id === reading[1])!
      Object.assign(c, { readingState: 'writing' })
      return reply(202, c)
    }
    if (url === '/api/profile') return reply(200, { name: 'Sam', dateTime: '1990-06-15 14:30', city: 'New York', state: 'CA', country: 'US' })
    if (url === '/api/config') return reply(200, { lmStudioUrl: '', model: 'm', reasoning: 'low', hasToken: false, memoryDefault: 'off' })
    if (url === '/api/castings') return reply(200, castings.map(summary))
    const one = /^\/api\/castings\/([^/]+)$/.exec(url)
    if (one) {
      const c = castings.find((x) => x.id === one[1])
      return c ? reply(200, c) : reply(404, { error: 'No such casting' })
    }
    if (url.endsWith('/followups')) return reply(200, [])
    return reply(404, { error: `unexpected ${url}` })
  }))
  // jsdom has no EventSource; the reading in view would follow the stream with one.
  vi.stubGlobal('EventSource', class { onmessage: unknown = null; close() {} })
}

afterEach(() => { window.history.replaceState(null, '', '/') })

describe('App', () => {
  it('lists the readings being written above the shortcuts, and opens one with a history entry', async () => {
    serve([casting('c1'), casting('c2', { readingState: 'done', reading: 'Done.' })])
    const user = userEvent.setup()
    render(<App />)
    const row = await screen.findByRole('button', { name: /Today · Casting c1/ })
    expect(row).toHaveTextContent('Writing…')
    // The one still being written is not listed twice.
    expect(screen.getByRole('button', { name: /Casting c2/ })).toHaveTextContent('read')
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()

    await user.click(row)
    expect(await screen.findByRole('heading', { name: 'Casting c1' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/c/c1')
    expect(screen.getByText(/carries on if you go back/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Transits now, over the birth chart')).toBeInTheDocument()
    await waitFor(() => expect(window.location.hash).toBe(''))
  })

  it('opens the casting a reload lands on, and comes home on the browser\'s Back', async () => {
    serve([casting('c1')])
    window.history.replaceState(null, '', '/#/c/c1')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Casting c1' })).toBeInTheDocument()

    window.history.replaceState(null, '', '/')
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
    expect(await screen.findByText('Transits now, over the birth chart')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Casting c1' })).not.toBeInTheDocument()
  })

  it('forgets an address that names no casting', async () => {
    serve([])
    window.history.replaceState(null, '', '/#/c/gone')
    render(<App />)
    expect(await screen.findByText('Transits now, over the birth chart')).toBeInTheDocument()
    await waitFor(() => expect(window.location.hash).toBe(''))
  })

  it('groups the recent castings by kind, newest change first, and a tap casts another', async () => {
    const castings = [
      casting('t1', { readingState: 'done', updatedAt: 10, title: 'Thu 16 Oct' }),
      casting('n1', { kind: 'natal', period: 'natal', readingState: 'done', updatedAt: 5, title: 'Birth chart' }),
      casting('t2', { readingState: 'failed', updatedAt: 20, title: 'Thu 16 Oct' }),
    ]
    serve(castings)
    const user = userEvent.setup()
    render(<App />)
    const today = await screen.findByRole('region', { name: 'Today' })
    const rows = Array.from(today.querySelectorAll('li')).map((li) => li.textContent)
    expect(rows).toEqual([expect.stringMatching(/^Thu 16 Octfailed · /), expect.stringMatching(/^Thu 16 Octread · /)])
    expect(screen.getByRole('region', { name: 'Birth chart' })).toHaveTextContent('Birth chart')
    expect(screen.queryByRole('region', { name: 'Week' })).not.toBeInTheDocument()

    await user.click(screen.getByText('Transits now, over the birth chart').closest('button')!)
    expect(await screen.findByRole('heading', { name: 'Casting new4' })).toBeInTheDocument()
    expect(castings).toHaveLength(4)
    expect(castings[3]!.readingState).toBe('writing')
  })

  it('shows a long group in part, and the rest on request', async () => {
    const castings = Array.from({ length: 6 }, (_, i) => casting(`m${i}`, { kind: 'moon', readingState: 'done', updatedAt: i, title: `Moon ${i}` }))
    serve(castings)
    const user = userEvent.setup()
    render(<App />)
    const moon = await screen.findByRole('region', { name: 'Moon' })
    expect(moon.querySelectorAll('li')).toHaveLength(4)
    expect(moon.querySelector('li')).toHaveTextContent('Moon 5')
    await user.click(screen.getByRole('button', { name: 'Show all 6' }))
    expect(moon.querySelectorAll('li')).toHaveLength(6)
  })

  it('keeps asking after a reading in progress until it is written', async () => {
    const castings = [casting('c1')]
    serve(castings)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<App />)
    expect(await screen.findByText('Writing…')).toBeInTheDocument()
    castings[0] = casting('c1', { readingState: 'done', reading: 'Done.' })
    await act(async () => { await vi.advanceTimersByTimeAsync(WRITING_POLL_MS + 50) })
    expect(await screen.findByText(/^read · /)).toBeInTheDocument()
    expect(screen.queryByText('Writing…')).not.toBeInTheDocument()
  })
})
