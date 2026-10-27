import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WhoseChart from './WhoseChart'

const jo = { id: 'p1', name: 'Jo', dateTime: '1960-06-08 09:45', city: 'Pleasanton', state: 'CA', country: 'USA' }

describe('WhoseChart', () => {
  it('offers you and the people saved, and says a friend reading leaves your memories out', async () => {
    const onPick = vi.fn()
    const { rerender } = render(<WhoseChart me="Sam" people={[jo]} value="me" onPick={onPick} onAdd={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Sam (you)' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('radio', { name: 'Jo' }))
    expect(onPick).toHaveBeenCalledWith('p1')
    expect(screen.queryByText(/memories stay out/)).toBeNull()
    rerender(<WhoseChart me="Sam" people={[jo]} value="p1" onPick={onPick} onAdd={vi.fn()} />)
    expect(screen.getByText(/memories stay out/)).toBeInTheDocument()
  })

  it('adds someone new, picks them, and shows what to fix when the details are refused', async () => {
    const onPick = vi.fn()
    const onAdd = vi.fn()
      .mockRejectedValueOnce(new Error("Birth date and time must be 'YYYY-MM-DD HH:MM'"))
      .mockResolvedValueOnce({ ...jo, id: 'p2', name: 'Ana' })
    render(<WhoseChart me="Sam" people={[]} value="me" onPick={onPick} onAdd={onAdd} />)
    await userEvent.click(screen.getByRole('button', { name: /Someone else/ }))
    await userEvent.type(screen.getByLabelText('Name'), 'Ana')
    await userEvent.type(screen.getByLabelText(/Born/), 'June 1')
    await userEvent.type(screen.getByLabelText('City'), 'Oakland')
    await userEvent.click(screen.getByRole('button', { name: 'Save and choose' }))
    expect(await screen.findByText(/YYYY-MM-DD HH:MM'/)).toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save and choose' }))
    expect(onAdd).toHaveBeenLastCalledWith({ name: 'Ana', dateTime: 'June 1', city: 'Oakland', state: '', country: '' })
    expect(onPick).toHaveBeenCalledWith('p2')
    expect(screen.queryByLabelText('Name')).toBeNull()
  })
})
