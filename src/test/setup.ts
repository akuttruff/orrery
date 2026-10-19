import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { REACH } from '../lib/reach.ts'

// The waits around a server that gives no reply, cut to a few ticks: a test
// that sits through eight seconds of silence learns nothing from the wait.
REACH.readTimeoutMs = 200
REACH.retryWaitsMs = [10, 20, 30]
REACH.unreachableAfterMs = 40
REACH.probeMs = 40

// Server tests run in node (`@vitest-environment node`), where there is no
// window to patch and fetch must reach the test's own socket.
if (typeof window !== 'undefined') {
  // jsdom implements neither of these, and animation code calls them while
  // measuring. Without the stubs every animated test logs a "Not implemented"
  // stack that buries real failures.
  window.scrollTo = (() => {}) as typeof window.scrollTo
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.hasPointerCapture = () => false
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
  }
  // jsdom does no layout, so it has no scrollIntoView; components call it on focus.
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

  beforeEach(() => {
    localStorage.clear()
    // Every suite opts in to the fetch behaviour it wants; an un-stubbed call
    // should fail loudly rather than hit the network.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('unstubbed fetch'))))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllTimers()
    vi.useRealTimers()
  })
}
