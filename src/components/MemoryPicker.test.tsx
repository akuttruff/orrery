import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MemoryPicker from './MemoryPicker'

const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

describe('MemoryPicker', () => {
  it('ticks every memory but the excluded, and hands back the new exclusions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([
      { id: 'a', text: 'Works nights.', createdAt: 1, updatedAt: 1 },
      { id: 'b', text: 'Has a cat.', createdAt: 1, updatedAt: 1 },
      { id: 'c', text: 'Moving house.', createdAt: 1, updatedAt: 1 },
    ])))
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MemoryPicker excluded={['b']} used={['a']} onChange={onChange} onManage={() => {}} />)
    expect(await screen.findByText('2 of 3 go to the model with the next reading or answer.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Works nights/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Has a cat/ })).not.toBeChecked()
    expect(screen.getByText('in the reading')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Moving house/ }))
    expect(onChange).toHaveBeenLastCalledWith(['b', 'c'])
    await user.click(screen.getByRole('checkbox', { name: /Has a cat/ }))
    expect(onChange).toHaveBeenLastCalledWith([])
    await user.click(screen.getByRole('button', { name: 'None' }))
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b', 'c'])
  })
})
