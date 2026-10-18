import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App, { WRITING_POLL_MS } from './App'
import { NOT_WRITTEN } from './types.ts'
import type { Casting, CastingSummary } from './types.ts'

const casting = (id: string, over: Partial<Casting> = {}): Casting => ({
  id, kind: 'today', period: '2026-10-16', title: `Casting ${id}`, result: '{}', reading: '', readingState: 'writing', readingError: null,
  createdAt: 1, updatedAt: 1, memory: null, memoriesUsed: [], memoryExcluded: [], written: NOT_WRITTEN, transitReadings: {}, style: null, note: '', brief: null, starred: false, ...over,
})
const summary = ({ result: _r, reading: _g, transitReadings: _t, brief: _b, ...rest }: Casting): CastingSummary => ({ ...rest, questions: 0 })

/** A fetch that serves the app's routes from a list of castings the test can change. */
function serve(castings: Casting[]) {
  const config = { lmStudioUrl: '', model: 'm', reasoning: 'low', hasToken: false, memoryDefault: 'off' }
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    // A tap casts anew: the new casting joins the list, and its reading is started.
    if (url === '/api/castings' && init?.method === 'POST') {
      const { kind, memory = null, memoryExcluded = [], style = null, note = '' } = JSON.parse(String(init.body)) as Pick<Casting, 'kind'> & Partial<Casting>
      const c = casting(`new${castings.length + 1}`, { kind, memory, memoryExcluded, style, note, readingState: 'none', createdAt: 100, updatedAt: 100 })
      castings.push(c)
      return reply(201, c)
    }
    const one = /^\/api\/castings\/([^/]+)$/.exec(url)
    if (one && init?.method === 'PATCH') {
      const c = castings.find((x) => x.id === one[1])
      if (!c) return reply(404, { error: 'No such casting' })
      Object.assign(c, JSON.parse(String(init.body)) as Partial<Casting>)
      return reply(200, c)
    }
    if (one && init?.method === 'DELETE') {
      const i = castings.findIndex((x) => x.id === one[1])
      if (i >= 0) castings.splice(i, 1)
      return reply(200, { ok: true })
    }
    const reading = /^\/api\/castings\/([^/]+)\/reading$/.exec(url)
    if (reading && init?.method === 'POST') {
      const c = castings.find((x) => x.id === reading[1])!
      Object.assign(c, { readingState: 'writing' })
      return reply(202, c)
    }
    if (url === '/api/profile') return reply(200, { name: 'Sam', dateTime: '1990-06-15 14:30', city: 'New York', state: 'CA', country: 'US' })
    if (url === '/api/config' && init?.method === 'PUT') {
      Object.assign(config, JSON.parse(String(init.body)) as Partial<typeof config>)
      return reply(200, config)
    }
    if (url === '/api/config') return reply(200, config)
    if (url === '/api/memories') return reply(200, [{ id: 'm1', text: 'Works nights.', createdAt: 1, updatedAt: 1 }, { id: 'm2', text: 'Has a cat.', createdAt: 1, updatedAt: 1 }])
    if (url === '/api/castings') return reply(200, castings.map(summary))
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

    // A tile opens the popup; nothing is cast until its button.
    await user.click(screen.getByText('Transits now, over the birth chart').closest('button')!)
    const sheet = await screen.findByRole('dialog', { name: 'Cast Today' })
    expect(castings).toHaveLength(3)
    await user.click(within(sheet).getByRole('button', { name: 'Cast today' }))
    expect(await screen.findByRole('heading', { name: 'Casting new4' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Cast Today' })).not.toBeInTheDocument()
    expect(castings).toHaveLength(4)
    expect(castings[3]!.readingState).toBe('writing')
  })

  it('on a wide window lists the castings in a sidebar, where + casts another of a kind', async () => {
    const castings = [casting('t1', { readingState: 'done', title: 'Thu 16 Oct' }), casting('n1', { kind: 'natal', readingState: 'done', title: 'Birth chart' })]
    serve(castings)
    const wide = window.matchMedia
    vi.stubGlobal('matchMedia', (q: string) => ({ ...wide(q), matches: q.includes('900') }))
    const user = userEvent.setup()
    render(<App />)
    const side = await screen.findByRole('navigation', { name: 'Castings' })
    expect(await within(side).findByRole('button', { name: /^Thu 16 Oct/ })).toHaveTextContent('read')
    // Every kind has a section, with or without castings; the home screen's own list stays out of the way.
    expect(within(side).getAllByRole('region')).toHaveLength(6)
    expect(screen.queryByRole('region', { name: 'Recent castings' })).not.toBeInTheDocument()
    expect(screen.getByText('Transits now, over the birth chart')).toBeInTheDocument()

    await user.click(within(side).getByRole('button', { name: 'Cast week' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Cast Week' })).getByRole('button', { name: 'Cast week' }))
    expect(await screen.findByRole('heading', { name: 'Casting new3' })).toBeInTheDocument()
    expect(castings[2]).toMatchObject({ kind: 'week', readingState: 'writing' })
    expect(within(side).getByRole('button', { name: /^Casting new3/ })).toHaveAttribute('aria-current', 'true')

    // Its edge drags it wider, and the width is kept.
    const edge = within(side).getByRole('separator', { name: 'Sidebar width' })
    fireEvent.pointerDown(edge, { button: 0, clientX: 300 })
    fireEvent.pointerMove(window, { clientX: 380 })
    fireEvent.pointerUp(window, { clientX: 380 })
    expect(side).toHaveStyle({ width: '380px' })
    expect(localStorage.getItem('orrery.sidebarWidth')).toBe('380')
    fireEvent.doubleClick(edge)
    expect(side).toHaveStyle({ width: '300px' })

    // Tucked away, the list comes back from the header.
    await user.click(within(side).getByRole('button', { name: 'Hide the castings' }))
    expect(screen.queryByRole('navigation', { name: 'Castings' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show the castings' }))
    expect(screen.getByRole('navigation', { name: 'Castings' })).toBeInTheDocument()
  })

  it('opens a popup from a tile where memory, the memories, the kind and a note are chosen, then casts with them', async () => {
    const castings: Casting[] = []
    serve(castings)
    const user = userEvent.setup()
    render(<App />)
    await user.click((await screen.findByText('Void windows and lunations, two weeks')).closest('button')!)
    const sheet = await screen.findByRole('dialog', { name: 'Cast Moon' })
    await user.click(within(sheet).getByRole('switch', { name: 'Memory off' }))
    // Settings' default changed with it, so the choice stays.
    expect(await within(sheet).findByRole('switch', { name: 'Memory on' })).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Choose' }))
    await user.click(await within(sheet).findByRole('checkbox', { name: /Has a cat/ }))
    expect(within(sheet).getByRole('button', { name: 'Choose · 1 out' })).toBeInTheDocument()
    await user.type(within(sheet).getByLabelText('What do you want from this reading?'), "I'm going through some anxiety today")
    await user.click(within(sheet).getByRole('radio', { name: 'Gentle' }))
    expect(localStorage.getItem('orrery.style')).toBe('gentle')

    await user.click(within(sheet).getByRole('button', { name: 'Cast moon' }))
    expect(await screen.findByRole('heading', { name: 'Casting new1' })).toBeInTheDocument()
    expect(castings[0]).toMatchObject({ kind: 'moon', memory: true, memoryExcluded: ['m2'], style: 'gentle', note: "I'm going through some anxiety today" })
    expect(JSON.parse(localStorage.getItem('orrery.memoryExcluded')!)).toEqual(['m2'])
    expect(screen.getByText(/^Cast /)).toHaveTextContent("· Gentle · I'm going through some anxiety today")
  })

  it('stars a casting from the sidebar, which keeps it at the top of its kind, and deletes one after a second word', async () => {
    const castings = [
      casting('t1', { readingState: 'done', title: 'Thu 16 Oct', updatedAt: 30 }),
      casting('t2', { readingState: 'done', title: 'Wed 15 Oct', updatedAt: 20 }),
      casting('t3', { readingState: 'done', title: 'Tue 14 Oct', updatedAt: 10 }),
    ]
    serve(castings)
    const wide = window.matchMedia
    vi.stubGlobal('matchMedia', (q: string) => ({ ...wide(q), matches: q.includes('900') }))
    const user = userEvent.setup()
    render(<App />)
    const side = await screen.findByRole('navigation', { name: 'Castings' })
    const names = () => Array.from(side.querySelectorAll('.side-name')).map((el) => el.textContent)
    await within(side).findByRole('button', { name: 'Star Tue 14 Oct' })
    await user.click(within(side).getByRole('button', { name: 'Star Tue 14 Oct' }))
    expect(await within(side).findByRole('button', { name: 'Unstar Tue 14 Oct' })).toHaveAttribute('aria-pressed', 'true')
    expect(castings.find((c) => c.id === 't3')!.starred).toBe(true)
    await waitFor(() => expect(names()[0]).toMatch(/^Tue 14 Oct/))

    // The bin takes it straight away, questions and all.
    await user.click(within(side).getByRole('button', { name: 'Delete Wed 15 Oct' }))
    await waitFor(() => expect(within(side).queryByRole('button', { name: /Wed 15 Oct/ })).not.toBeInTheDocument())
    expect(castings.map((c) => c.id)).toEqual(['t1', 't3'])
  })

  it('casts the same kind again in another tone from under the questions', async () => {
    const castings = [casting('t1', { readingState: 'done', reading: 'Done.', style: 'balanced', note: 'a note', memory: true, memoryExcluded: ['m1'] })]
    serve(castings)
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /Casting t1/ }))
    const again = await screen.findByRole('group', { name: 'Read it again as' })
    expect(within(again).getByRole('button', { name: 'Balanced' })).toHaveClass('on')
    await user.click(within(again).getByRole('button', { name: 'Coach' }))
    expect(await screen.findByRole('heading', { name: 'Casting new2' })).toBeInTheDocument()
    expect(castings).toHaveLength(2)
    expect(castings[1]).toMatchObject({ kind: 'today', style: 'coach', note: 'a note', memory: true, memoryExcluded: ['m1'] })
    // The tone chips wait while the new reading is written.
    expect(within(screen.getByRole('group', { name: 'Read it again as' })).getByRole('button', { name: 'Gentle' })).toBeDisabled()
  })

  it('opens the popup straight from a cast address, then clears the address', async () => {
    serve([])
    window.history.replaceState(null, '', '/#/cast/week')
    render(<App />)
    expect(await screen.findByRole('dialog', { name: 'Cast Week' })).toBeInTheDocument()
    await waitFor(() => expect(window.location.hash).toBe(''))
  })

  it('puts the tile back untouched when the popup is closed', async () => {
    const castings: Casting[] = []
    serve(castings)
    const user = userEvent.setup()
    render(<App />)
    await user.click((await screen.findByText('Transits now, over the birth chart')).closest('button')!)
    await user.click(within(screen.getByRole('dialog', { name: 'Cast Today' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(castings).toHaveLength(0)
  })

  it('shows a long group in part, and the rest on request', async () => {
    const castings = Array.from({ length: 6 }, (_, i) => casting(`m${i}`, { kind: 'moon', readingState: 'done', updatedAt: i, title: `Moon ${i}` }))
    serve(castings)
    const user = userEvent.setup()
    render(<App />)
    const moon = await screen.findByRole('region', { name: 'Moon' })
    expect(moon.querySelectorAll('li')).toHaveLength(4)
    expect(moon.querySelector('li')).toHaveTextContent('Moon 5')
    await user.click(screen.getByRole('button', { name: 'Show 2 more' }))
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
