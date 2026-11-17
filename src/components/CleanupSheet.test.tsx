import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CleanupSheet from './CleanupSheet'
import { api } from '../lib/api.ts'
import type { CastingSummary } from '../types.ts'

const NOW = Date.UTC(2026, 10, 17)
const DAY = 24 * 60 * 60 * 1000

const summary = (id: string, over: Partial<CastingSummary> = {}): CastingSummary => ({
  id, kind: 'today', title: id, readingState: 'done', questions: 0, starred: false,
  createdAt: NOW, updatedAt: NOW, ...over,
} as CastingSummary)

const castings = [
  summary('fresh'),
  summary('old', { updatedAt: NOW - 40 * DAY }),
  summary('old-starred', { updatedAt: NOW - 40 * DAY, starred: true }),
  summary('writing', { readingState: 'writing', updatedAt: NOW - 40 * DAY }),
  summary('chart', { kind: 'natal', updatedAt: NOW - 100 * DAY }),
]

afterEach(() => { vi.restoreAllMocks() })

describe('CleanupSheet', () => {
  it('ticks and unticks castings one by one and by kind, never one being written', async () => {
    const user = userEvent.setup()
    render(<CleanupSheet castings={castings} onRemoved={vi.fn()} onClose={vi.fn()} now={NOW} />)
    expect(screen.getByRole('checkbox', { name: 'writing' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'fresh' }))
    expect(screen.getByText('1 casting chosen')).toBeInTheDocument()
    const all = screen.getByRole('checkbox', { name: 'All of Today' }) as HTMLInputElement
    expect(all.indeterminate).toBe(true)
    await user.click(all)
    expect(screen.getByText('3 castings chosen')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'writing' })).not.toBeChecked()
    await user.click(all)
    expect(screen.getByText('Nothing chosen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('picks the old ones, leaving the starred out, or all, or none', async () => {
    const user = userEvent.setup()
    render(<CleanupSheet castings={castings} onRemoved={vi.fn()} onClose={vi.fn()} now={NOW} />)
    const picks = screen.getByRole('group', { name: 'Quick picks' })
    await user.click(within(picks).getByRole('button', { name: 'Older than a month · 2' }))
    expect(screen.getByRole('checkbox', { name: 'old' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'chart' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'old-starred' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'fresh' })).not.toBeChecked()
    await user.click(within(picks).getByRole('button', { name: 'Older than 3 months · 1' }))
    expect(screen.getByRole('checkbox', { name: 'old' })).not.toBeChecked()
    await user.click(within(picks).getByRole('button', { name: 'All' }))
    expect(screen.getByText('4 castings chosen')).toBeInTheDocument()
    await user.click(within(picks).getByRole('button', { name: 'None' }))
    expect(screen.getByText('Nothing chosen')).toBeInTheDocument()
  })

  it('deletes the chosen ones only after a second tap', async () => {
    const user = userEvent.setup()
    const removeMany = vi.spyOn(api, 'removeMany').mockResolvedValue({ removed: 2 })
    const onRemoved = vi.fn()
    render(<CleanupSheet castings={castings} onRemoved={onRemoved} onClose={vi.fn()} now={NOW} />)
    await user.click(screen.getByRole('checkbox', { name: 'old' }))
    await user.click(screen.getByRole('checkbox', { name: 'chart' }))
    await user.click(screen.getByRole('button', { name: 'Delete 2' }))
    expect(removeMany).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Keep them' }))
    await user.click(screen.getByRole('button', { name: 'Delete 2' }))
    await user.click(screen.getByRole('button', { name: 'Delete 2 castings' }))
    expect(removeMany).toHaveBeenCalledWith(['old', 'chart'])
    expect(onRemoved).toHaveBeenCalledWith(['old', 'chart'])
  })
})
