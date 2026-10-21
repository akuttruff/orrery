import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import Root from './Root'
import { closeWheel, openWheel } from './lib/route.ts'

vi.mock('./App.tsx', () => ({ default: () => <main>the app</main> }))
vi.mock('./components/WheelPage.tsx', () => ({ default: ({ id }: { id: string }) => <div role="dialog">wheel {id}</div> }))

describe('Root', () => {
  afterEach(() => { window.history.replaceState(null, '', '/') })

  it('lays the wheel the address names over the app, and takes it away when the address changes back', () => {
    window.history.replaceState({ orrery: true }, '', '/#/c/c1')
    render(<Root />)
    expect(screen.getByText('the app')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    act(() => openWheel('c1'))
    expect(screen.getByRole('dialog')).toHaveTextContent('wheel c1')
    expect(screen.getByText('the app')).toBeInTheDocument()

    // The browser's Back, or Done: the address is the casting's again and the wheel is gone.
    act(() => {
      window.history.replaceState({ orrery: true }, '', '/#/c/c1')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens straight onto a wheel someone arrived at, and closing it opens its casting', () => {
    window.history.replaceState(null, '', '/#/w/c2')
    render(<Root />)
    expect(screen.getByRole('dialog')).toHaveTextContent('wheel c2')
    act(() => closeWheel('c2'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#/c/c2')
  })
})
