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
    expect(screen.getByRole('columnheader', { name: /Aspect/ })).toHaveAttribute('aria-sort', 'ascending')
    const up = orbs()
    expect(up).toEqual(sortRows(rows, { key: 'orb', dir: 'asc' }).map((r) => `orb ${orbText(r.orb)}`))
    expect(up).not.toEqual(own)

    await user.click(screen.getByRole('button', { name: /^Aspect/ }))
    expect(screen.getByRole('columnheader', { name: /Aspect/ })).toHaveAttribute('aria-sort', 'descending')
    expect(orbs()).toEqual([...up].reverse())

    await user.click(screen.getByRole('button', { name: /^Aspect/ }))
    expect(screen.getByRole('columnheader', { name: /Aspect/ })).toHaveAttribute('aria-sort', 'none')
    expect(orbs()).toEqual(own)

    await user.click(screen.getByRole('button', { name: 'Transit' }))
    const cells = within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1]!.textContent!)
    const byPlanet = sortRows(rows, { key: 'from', dir: 'asc' }).map((r) => r.from)
    cells.forEach((text, i) => expect(text).toContain(byPlanet[i]))
    await user.click(screen.getByRole('button', { name: 'default order' }))
    expect(orbs()).toEqual(own)
  })
})
