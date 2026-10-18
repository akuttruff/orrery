import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActiveTransits } from './TransitTable'
import { parseWheel } from '../lib/chartWheel.ts'
import { activeTransits, orbText } from '../lib/transitTable.ts'
import { sortRows } from '../lib/sortRows.ts'
import transit from '../test/fixtures/transit-chart.json?raw'

const wheel = parseWheel(transit)!
const rows = activeTransits(wheel)
const orbs = () => screen.getAllByText(/^orb /).map((el) => el.textContent)

describe('ActiveTransits', () => {
  it('sorts by a column on a click, the other way on another, and back to its own order on a third or from the caption', async () => {
    const user = userEvent.setup()
    render(<ActiveTransits wheel={wheel} />)
    const own = orbs()
    expect(own).toHaveLength(rows.length)

    const aspect = screen.getByRole('button', { name: 'Aspect' })
    await user.click(aspect)
    expect(screen.getByRole('columnheader', { name: /^Aspect/ })).toHaveAttribute('aria-sort', 'ascending')
    const up = orbs()
    expect(up).toEqual(sortRows(rows, { key: 'orb', dir: 'asc' }).map((r) => `orb ${orbText(r.orb)}`))
    expect(up).not.toEqual(own)

    await user.click(screen.getByRole('button', { name: /^Aspect/ }))
    expect(screen.getByRole('columnheader', { name: /^Aspect/ })).toHaveAttribute('aria-sort', 'descending')
    expect(orbs()).toEqual([...up].reverse())

    await user.click(screen.getByRole('button', { name: /^Aspect/ }))
    expect(screen.getByRole('columnheader', { name: /^Aspect/ })).toHaveAttribute('aria-sort', 'none')
    expect(orbs()).toEqual(own)

    await user.click(screen.getByRole('button', { name: 'Transit' }))
    const cells = within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1]!.textContent!)
    const byPlanet = sortRows(rows, { key: 'from', dir: 'asc' }).map((r) => r.from)
    cells.forEach((text, i) => expect(text).toContain(byPlanet[i]))
    await user.click(screen.getByRole('button', { name: 'default order' }))
    expect(orbs()).toEqual(own)
  })

  it('shows each transit\'s weight and sorts by it, the heaviest first on a second click', async () => {
    const user = userEvent.setup()
    render(<ActiveTransits wheel={wheel} />)
    const weights = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[4]!.childNodes[0]!.textContent!)
    expect(weights()).toEqual(rows.map((r) => (r.weight === null ? '—' : String(r.weight))))
    expect(screen.getByRole('button', { name: 'Weight' })).toHaveAccessibleDescription(/weight = slowness × aspect, doubled on a key point/)
    expect(screen.getByText('Jupiter 3 × square 0.9 × 2 on the Sun = 5.4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Weight' }))
    await user.click(screen.getByRole('button', { name: /^Weight/ }))
    expect(screen.getByRole('columnheader', { name: /Weight/ })).toHaveAttribute('aria-sort', 'descending')
    const shown = weights().filter((w) => w !== '—').map(Number)
    expect(shown).toEqual([...shown].sort((a, b) => b - a))
    expect(shown[0]).toBe(Math.max(...rows.map((r) => r.weight ?? 0)))
  })
})
