import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MemoriesSheet from './MemoriesSheet'
import type { Memory } from '../types.ts'

function serve(initial: Memory[]) {
  let items = [...initial]
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/memories' && !init?.method) return reply(200, items)
    if (url === '/api/memories' && init?.method === 'POST') {
      const { text } = JSON.parse(init.body as string) as { text: string }
      const m: Memory = { id: `m${items.length + 1}`, text, createdAt: 2, updatedAt: 2 }
      items = [m, ...items]
      return reply(201, m)
    }
    const one = /^\/api\/memories\/(.+)$/.exec(url)
    if (one && init?.method === 'DELETE') { items = items.filter((m) => m.id !== one[1]); return reply(200, { ok: true }) }
    if (one && init?.method === 'PATCH') {
      const { text } = JSON.parse(init.body as string) as { text: string }
      const m = { ...items.find((x) => x.id === one[1])!, text, updatedAt: 3 }
      items = [m, ...items.filter((x) => x.id !== one[1])]
      return reply(200, m)
    }
    return reply(404, { error: 'Not found' })
  }))
  return { get items() { return items } }
}

describe('MemoriesSheet', () => {
  it('lists what is remembered, and adds, edits and forgets', async () => {
    const pool = serve([{ id: 'm1', text: 'The user works nights.', createdAt: 1, updatedAt: 1 }])
    const user = userEvent.setup()
    render(<MemoriesSheet onClose={() => {}} />)
    expect(await screen.findByText('The user works nights.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Memories · 1' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('New memory'), 'The user is moving on Oct 20.')
    await user.click(screen.getByRole('button', { name: 'Remember' }))
    expect(await screen.findByText('The user is moving on Oct 20.')).toBeInTheDocument()
    expect(screen.getByLabelText('New memory')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Edit: The user works nights.' }))
    const box = screen.getByLabelText('Memory text')
    await user.clear(box)
    await user.type(box, 'The user works days now.')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('The user works days now.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Forget: The user is moving on Oct 20.' }))
    await waitFor(() => expect(screen.queryByText('The user is moving on Oct 20.')).not.toBeInTheDocument())
    expect(pool.items.map((m) => m.text)).toEqual(['The user works days now.'])
  })

  it('says so when nothing is remembered yet', async () => {
    serve([])
    render(<MemoriesSheet onClose={() => {}} />)
    expect(await screen.findByText(/Nothing remembered yet/)).toBeInTheDocument()
  })
})
