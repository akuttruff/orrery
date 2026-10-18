import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import StyleChips from './StyleChips'
import { READING_STYLES } from '../lib/styles.ts'

describe('StyleChips', () => {
  it('names each kind of reading, with a popup over it saying what it is like and what the model is told', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<StyleChips value="gentle" as="radio" onPick={onPick} />)
    const group = screen.getByRole('radiogroup', { name: 'Kind of reading' })
    expect(within(group).getAllByRole('radio')).toHaveLength(READING_STYLES.length)
    const gentle = within(group).getByRole('radio', { name: 'Gentle' })
    expect(gentle).toBeChecked()
    // The popup is the chip's description, not part of its name, so the chip still reads as "Gentle".
    const tip = document.getElementById(gentle.getAttribute('aria-describedby')!)!
    expect(tip).toHaveAttribute('role', 'tooltip')
    expect(tip).toHaveTextContent('Assumes you may be raw; leads with safety and choice.')
    expect(tip).toHaveTextContent('The model is told: “Assume they may be raw today.')
    await user.click(within(group).getByRole('radio', { name: 'Coach' }))
    expect(onPick).toHaveBeenCalledWith('coach')
    // Under the row, for a phone with nothing to hover: the chosen one's line.
    expect(screen.getByText(/leads with safety and choice/, { selector: '.style-hint' })).toBeInTheDocument()
  })

  it('as buttons, marks the one this reading was written as and waits when told to', () => {
    render(<StyleChips value="plain" as="button" disabled onPick={() => {}} chosenNote="How this one was read" />)
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    const plain = screen.getByRole('button', { name: 'Plain' })
    expect(plain).toBeDisabled()
    expect(plain).toHaveClass('on')
    expect(document.getElementById(plain.getAttribute('aria-describedby')!)).toHaveTextContent('Plain · How this one was read')
    expect(document.getElementById(screen.getByRole('button', { name: 'Coach' }).getAttribute('aria-describedby')!)).not.toHaveTextContent('How this one was read')
  })
})
