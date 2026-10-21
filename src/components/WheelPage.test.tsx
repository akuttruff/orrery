import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import WheelPage from './WheelPage'
import { openWheel } from '../lib/route.ts'
import { NOT_WRITTEN } from '../types.ts'
import natal from '../test/fixtures/natal-chart.json?raw'

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const serveNatal = () => vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/castings/c1'
  ? reply(200, { id: 'c1', kind: 'natal', period: 'natal', title: 'Birth chart', result: natal, reading: '', readingState: 'done', readingError: null, createdAt: 1, updatedAt: 1, memory: null, memoriesUsed: [], memoryExcluded: [], written: NOT_WRITTEN, transitReadings: null, style: null, note: '', brief: null, starred: false })
  : reply(404, { error: 'No such casting' }))))

describe('WheelPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('draws the casting\'s wheel and a way back, and lets the page zoom until it is closed', async () => {
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">'
    serveNatal()
    const { unmount } = render(<WheelPage id="c1" />)
    expect(await screen.findByRole('img', { name: /Chart wheel for/ })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /Chart wheel for/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to the reading' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).not.toMatch(/maximum-scale/)
    expect(document.title).toMatch(/Chart wheel for .* · Orrery/)
    unmount()
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).toMatch(/maximum-scale=1/)
  })

  it('goes back through history when the page opened the wheel itself', async () => {
    serveNatal()
    window.history.replaceState({ orrery: true }, '', '/#/c/c1')
    openWheel('c1')
    expect(window.location.hash).toBe('#/w/c1')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    render(<WheelPage id="c1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the reading' }))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('rewrites an address someone arrived at to the casting\'s, and Escape closes too', async () => {
    serveNatal()
    window.history.replaceState(null, '', '/#/w/c1')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const popped = vi.fn()
    window.addEventListener('popstate', popped)
    render(<WheelPage id="c1" />)
    await screen.findByRole('img', { name: /Chart wheel for/ })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(back).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/c/c1')
    expect(popped).toHaveBeenCalledTimes(1)
    window.removeEventListener('popstate', popped)
  })

  it('says so when the casting is gone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(404, { error: 'No such casting' })))
    render(<WheelPage id="nope" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No such casting')
  })
})
