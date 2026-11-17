import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'
import Recent from './Recent'
import UndoToast, { UNDO_SHOWN_MS } from './UndoToast'
import type { CastingSummary } from '../types.ts'

const summary = (id: string, over: Partial<CastingSummary> = {}): CastingSummary => ({
  id, kind: 'today', title: id, readingState: 'done', questions: 0, starred: false, createdAt: 1, updatedAt: 1, ...over,
} as CastingSummary)

const castings = [
  summary('a'), summary('b'), summary('busy', { readingState: 'writing' }),
  summary('chart', { kind: 'natal' }),
]

const sidebar = (onDeleteMany = vi.fn(async () => {})) => render(
  <Sidebar castings={castings} activeId={null} busy={null} onOpen={vi.fn()} onCast={vi.fn()} onStar={vi.fn()} onRemove={vi.fn()} onDeleteMany={onDeleteMany} onSettings={vi.fn()} onCollapse={vi.fn()} />,
)

describe('select mode', () => {
  it('turns the rows into boxes, a kind at a time or one by one, never one being written', async () => {
    const user = userEvent.setup()
    sidebar()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Select' }))
    const bar = screen.getByRole('toolbar', { name: 'Selected castings' })
    expect(within(bar).getByText('0 selected')).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'busy' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'a' }))
    const today = screen.getByRole('checkbox', { name: 'Select every casting in Today' }) as HTMLInputElement
    expect(today.indeterminate).toBe(true)
    await user.click(today)
    expect(within(bar).getByText('2 selected')).toBeInTheDocument()
    await user.click(today)
    expect(within(bar).getByText('0 selected')).toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: 'Select all' }))
    expect(within(bar).getByText('3 selected')).toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: 'Deselect all' }))
    expect(within(bar).getByText('0 selected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })

  it('deletes the chosen ones in one go and leaves select mode', async () => {
    const user = userEvent.setup()
    const onDeleteMany = vi.fn(async () => {})
    sidebar(onDeleteMany)
    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByRole('checkbox', { name: 'a' }))
    await user.click(screen.getByRole('checkbox', { name: 'chart' }))
    await user.click(screen.getByRole('button', { name: 'Delete 2' }))
    expect(onDeleteMany).toHaveBeenCalledWith(['a', 'chart'])
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })

  it('shows every casting in the home list while selecting, the folded ones too', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 6 }, (_, i) => summary(`t${i}`))
    render(<Recent castings={many} onOpen={vi.fn()} onDeleteMany={vi.fn(async () => {})} />)
    expect(screen.queryByText('t5')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByRole('checkbox', { name: 't5' })).toBeInTheDocument()
  })
})

describe('UndoToast', () => {
  it('undoes once, or goes by itself after a while', async () => {
    vi.useFakeTimers()
    const undo = vi.fn()
    const onDone = vi.fn()
    render(<UndoToast undo={{ id: 1, text: '2 castings deleted', undo }} onDone={onDone} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 castings deleted')
    act(() => { screen.getByRole('button', { name: 'Undo' }).click() })
    expect(undo).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(UNDO_SHOWN_MS) })
    expect(onDone).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
