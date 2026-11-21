import { describe, expect, it, vi } from 'vitest'
import { useState, type ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CastSheet from './CastSheet'
import { DEFAULT_SHAPE } from '../lib/shape.ts'
import type { Birth } from './BirthFields'
import type { Kind } from '../types.ts'

// Stable across renders, as App's are: the popup refocuses its box whenever onClose changes.
const close = vi.fn()
const noop = vi.fn()

const sam: Birth = { dateTime: '1990-06-15 14:30', city: 'New York', state: 'NY', country: 'USA' }

/** The popup with its choices held as App holds them. */
function Sheet({ kind, initialNote = '', ...over }: { kind: Kind; initialNote?: string } & Partial<ComponentProps<typeof CastSheet>>) {
  const [note, setNote] = useState(initialNote)
  const [birth, setBirth] = useState<Birth | null>(null)
  return (
    <CastSheet
      kind={kind} note={note} style="balanced" shape={DEFAULT_SHAPE} thinking={['off', 'low', 'high']} spread="three"
      me="Sam" people={[]} who="me" onWho={noop} onAddPerson={noop} memoryOn={false} excluded={[]} busy={false}
      onNote={setNote} onStyle={noop} onShape={noop} onSpread={noop} onMemory={noop} onExclude={noop} onManage={noop}
      onCast={noop} onClose={close} birthBase={sam} birth={birth} onBirth={setBirth} onSaveBirth={noop}
      {...over}
    />
  )
}

describe('CastSheet', () => {
  it('folds a guided reading\'s shape under its summary until asked, beside the tone', async () => {
    render(<Sheet kind="today" />)
    expect(screen.getByRole('radiogroup', { name: 'Kind of reading' })).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /Shape\s*Usual/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('radiogroup', { name: 'Length' })).toBeNull()
    await userEvent.click(toggle)
    expect(screen.getByRole('radiogroup', { name: 'Length' })).toBeInTheDocument()
  })

  it('opens the shape at once when it already asks for something unusual, and says what', () => {
    render(<Sheet kind="today" shape={{ ...DEFAULT_SHAPE, length: 'short', organise: 'house' }} />)
    expect(screen.getByRole('button', { name: /Shape\s*Short · by house/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('for an open session asks only whose details, the message and the thinking, and waits for a message', async () => {
    const onCast = vi.fn()
    render(<Sheet kind="open" onCast={onCast} />)
    expect(screen.queryByRole('radiogroup', { name: 'Kind of reading' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Shape/ })).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Thinking' })).toBeInTheDocument()
    expect(screen.getByText(/Born 1990-06-15 14:30 in New York, NY, USA/)).toBeInTheDocument()
    const start = screen.getByRole('button', { name: 'Start' })
    expect(start).toBeDisabled()
    await userEvent.type(screen.getByLabelText('What do you want to ask or explore?'), 'pull a card')
    expect(start).toBeEnabled()
    await userEvent.click(start)
    expect(onCast).toHaveBeenCalledOnce()
  })

  it('changes the birth details for the session alone, with Reset and Save as a person', async () => {
    const onSaveBirth = vi.fn(async () => {})
    render(<Sheet kind="open" onSaveBirth={onSaveBirth} />)
    await userEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.queryByText('Changed for this session only.')).toBeNull()
    const city = screen.getByLabelText('City')
    await userEvent.clear(city)
    await userEvent.type(city, 'Austin')
    expect(screen.getByText('Changed for this session only.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save as a person' }))
    await userEvent.type(screen.getByLabelText('Their name'), 'Sam at Austin')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSaveBirth).toHaveBeenCalledWith('Sam at Austin', { ...sam, city: 'Austin' })
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.queryByText('Changed for this session only.')).toBeNull()
    expect(screen.getByLabelText('City')).toHaveValue('New York')
  })
})
