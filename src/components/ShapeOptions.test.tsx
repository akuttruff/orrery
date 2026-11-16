import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ShapeOptions from './ShapeOptions'
import { DEFAULT_SHAPE, shapeOf } from '../lib/shape.ts'

describe('ShapeOptions', () => {
  it('lays every choice out in a labelled row, nothing folded away', () => {
    render(<ShapeOptions kind="today" value={null} onChange={vi.fn()} thinking={null} />)
    const shape = screen.getByRole('group', { name: 'Shape of the reading' })
    for (const name of ['Length', 'Organise', 'Writing', 'Thinking']) expect(within(shape).getByRole('radiogroup', { name })).toBeInTheDocument()
    for (const name of ['Include', 'Lead with', 'Life areas']) expect(within(shape).getByRole('group', { name })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Shape' })).not.toBeInTheDocument()
  })

  it('picks one length, organisation, writing and thinking level, and toggles any mix of parts and focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ShapeOptions kind="week" value={null} onChange={onChange} thinking={null} />)
    await user.click(within(screen.getByRole('radiogroup', { name: 'Length' })).getByRole('radio', { name: 'Short' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SHAPE, length: 'short' })
    await user.click(within(screen.getByRole('radiogroup', { name: 'Organise' })).getByRole('radio', { name: 'By time' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ organise: 'time' }))
    await user.click(within(screen.getByRole('radiogroup', { name: 'Writing' })).getByRole('radio', { name: 'Mixed' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ writing: 'mixed' }))
    await user.click(within(screen.getByRole('radiogroup', { name: 'Thinking' })).getByRole('radio', { name: 'High' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ thinking: 'high' }))

    const include = screen.getByRole('group', { name: 'Include' })
    expect(within(include).getByRole('button', { name: 'At a Glance' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(include).getByRole('button', { name: 'At a Glance' }))
    expect(onChange.mock.lastCall![0].parts).not.toContain('glance')
    await user.click(within(include).getByRole('button', { name: 'Summary first' }))
    expect(onChange.mock.lastCall![0].parts).toContain('summary')
    await user.click(within(screen.getByRole('group', { name: 'Lead with' })).getByRole('button', { name: 'Challenges' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ focus: ['challenges'] }))
    await user.click(within(screen.getByRole('group', { name: 'Life areas' })).getByRole('button', { name: 'Love' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ areas: ['love'] }))
  })

  it('offers each kind only what it can take, and keeps the choices another kind takes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // A week's 'by time' is not a card's to offer, nor to lose.
    render(<ShapeOptions kind="card" value={shapeOf({ organise: 'time' })} onChange={onChange} thinking={null} />)
    expect(screen.queryByRole('radiogroup', { name: 'Organise' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Lead with' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Life areas' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Include' })).queryByRole('button', { name: 'At a Glance' })).not.toBeInTheDocument()
    await user.click(within(screen.getByRole('radiogroup', { name: 'Length' })).getByRole('radio', { name: 'Deep' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ length: 'deep', organise: 'time' }))
  })

  it('offers the thinking levels the model takes, and none when it takes none', () => {
    const { rerender } = render(<ShapeOptions kind="today" value={null} onChange={vi.fn()} thinking={['off', 'on']} />)
    expect(within(screen.getByRole('radiogroup', { name: 'Thinking' })).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Settings', 'Off', 'On'])
    rerender(<ShapeOptions kind="today" value={null} onChange={vi.fn()} thinking={[]} />)
    expect(screen.queryByRole('radiogroup', { name: 'Thinking' })).not.toBeInTheDocument()
  })

  it('goes back to the usual shape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<ShapeOptions kind="today" value={null} onChange={onChange} thinking={null} />)
    expect(screen.queryByRole('button', { name: 'Back to the usual shape' })).not.toBeInTheDocument()
    rerender(<ShapeOptions kind="today" value={shapeOf({ length: 'deep' })} onChange={onChange} thinking={null} />)
    await user.click(screen.getByRole('button', { name: 'Back to the usual shape' }))
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_SHAPE)
  })
})
