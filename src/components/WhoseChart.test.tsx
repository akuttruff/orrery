import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WhoseChart from './WhoseChart'

const jo = { id: 'p1', name: 'Jo', dateTime: '1960-06-08 09:45', city: 'Pleasanton', state: 'CA', country: 'USA' }

describe('WhoseChart', () => {
  it('offers you and the people saved, and shows a chosen friend\'s details to check', async () => {
    const onPick = vi.fn()
    const { rerender } = render(<WhoseChart me="Sam" people={[jo]} value="me" onPick={onPick} onAdd={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Sam (you)' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('radio', { name: 'Jo' }))
    expect(onPick).toHaveBeenCalledWith('p1')
    expect(screen.queryByText(/memories stay out/)).toBeNull()
    rerender(<WhoseChart me="Sam" people={[jo]} value="p1" onPick={onPick} onAdd={vi.fn()} />)
    expect(screen.getByText(/Born 1960-06-08 09:45 in Pleasanton, CA, USA/)).toBeInTheDocument()
    expect(screen.getByText(/memories stay out/)).toBeInTheDocument()
  })

  it('adds someone from one typed sentence, picks them, and shows what is missing when it cannot be read', async () => {
    const onPick = vi.fn()
    const onAdd = vi.fn()
      .mockRejectedValueOnce(new Error('The birth time is missing. Add it and try again.'))
      .mockResolvedValueOnce({ ...jo, id: 'p2', name: 'Ana' })
    render(<WhoseChart me="Sam" people={[]} value="me" onPick={onPick} onAdd={onAdd} />)
    await userEvent.click(screen.getByRole('button', { name: /Someone else/ }))
    const box = screen.getByLabelText('Their name and birth details')
    await userEvent.type(box, 'Ana, June 1 1990, Oakland')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText(/birth time is missing/)).toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
    await userEvent.type(box, ' at 3pm{Enter}')
    expect(onAdd).toHaveBeenLastCalledWith('Ana, June 1 1990, Oakland at 3pm')
    expect(onPick).toHaveBeenCalledWith('p2')
    expect(screen.queryByLabelText('Their name and birth details')).toBeNull()
  })
})
