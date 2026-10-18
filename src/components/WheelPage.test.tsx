import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import WheelPage from './WheelPage'
import { NOT_WRITTEN } from '../types.ts'
import natal from '../test/fixtures/natal-chart.json?raw'

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('WheelPage', () => {
  it('draws the casting\'s wheel and nothing else, and lets the page zoom', async () => {
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/castings/c1'
      ? reply(200, { id: 'c1', kind: 'natal', period: 'natal', title: 'Birth chart', result: natal, reading: '', readingState: 'done', readingError: null, createdAt: 1, updatedAt: 1, memory: null, memoriesUsed: [], memoryExcluded: [], written: NOT_WRITTEN, transitReadings: null })
      : reply(404, { error: 'No such casting' }))))
    render(<WheelPage id="c1" />)
    expect(await screen.findByRole('img', { name: /Chart wheel for/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).not.toMatch(/maximum-scale/)
    expect(document.title).toMatch(/Chart wheel for .* · Orrery/)
  })

  it('says so when the casting is gone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(404, { error: 'No such casting' })))
    render(<WheelPage id="nope" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No such casting')
  })
})
