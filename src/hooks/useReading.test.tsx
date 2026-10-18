import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReading } from './useReading.ts'
import { NOT_WRITTEN } from '../types.ts'
import type { Casting, ReadingEvent } from '../types.ts'

/** jsdom has no EventSource: one the test drives by hand, remembering every one opened. */
class FakeSource {
  static opened: FakeSource[] = []
  onmessage: ((e: MessageEvent<string>) => void) | null = null
  closed = false
  constructor(public url: string) { FakeSource.opened.push(this) }
  close(): void { this.closed = true }
  emit(event: ReadingEvent): void { this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>) }
}

const casting = (over: Partial<Casting>): Casting => ({
  id: 'c1', kind: 'moon', period: '2026-10-18', title: 'Moon', result: '{}', reading: '', readingState: 'writing', readingError: null,
  createdAt: 0, updatedAt: 0, memory: null, memoriesUsed: [], memoryExcluded: [], written: NOT_WRITTEN, transitReadings: null,
  style: null, note: '', brief: null, starred: false, ...over,
})

const last = (): FakeSource => FakeSource.opened.at(-1)!

beforeEach(() => {
  FakeSource.opened = []
  vi.stubGlobal('EventSource', FakeSource)
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers() })

describe('useReading', () => {
  it('shows the stored text and opens no stream when nothing is being written', () => {
    const { result } = renderHook(() => useReading(casting({ readingState: 'done', reading: 'Kept.' })))
    expect(result.current).toMatchObject({ text: 'Kept.', state: 'done' })
    expect(FakeSource.opened).toHaveLength(0)
  })

  it('follows a reading being written: the snapshot, then the pieces in batches, then done', () => {
    const settled = vi.fn()
    const { result } = renderHook(() => useReading(casting({}), settled))
    expect(last().url).toBe('/api/castings/c1/events')
    // The snapshot is what was written before this page looked, applied at once.
    act(() => last().emit({ type: 'snapshot', reading: 'So far', state: 'writing', error: null, written: { ...NOT_WRITTEN, startedAt: 5 } }))
    expect(result.current).toMatchObject({ text: 'So far', state: 'writing', written: { startedAt: 5 } })
    // Pieces wait for the flush, so a stream of words is one redraw, not one each.
    act(() => { last().emit({ type: 'delta', text: ' and' }); last().emit({ type: 'delta', text: ' more' }) })
    expect(result.current.text).toBe('So far')
    act(() => { vi.advanceTimersByTime(150) })
    expect(result.current.text).toBe('So far and more')
    // Thinking goes onto an open thinking step; a trail event replaces the trail whole.
    act(() => { last().emit({ type: 'thinking', text: 'Hmm' }); vi.advanceTimersByTime(150) })
    expect(result.current.written.trail).toEqual([{ kind: 'reasoning', text: 'Hmm', done: false }])
    act(() => last().emit({ type: 'trail', trail: [{ kind: 'reasoning', text: 'Hmm', done: true, seconds: 1.2 }] }))
    expect(result.current.written.trail).toEqual([{ kind: 'reasoning', text: 'Hmm', done: true, seconds: 1.2 }])
    expect(settled).not.toHaveBeenCalled()
    // Done: the finished text, the stream closed, and whoever holds the record told to fetch it.
    act(() => last().emit({ type: 'done', reading: 'So far and more.', written: { ...NOT_WRITTEN, startedAt: 5, finishedAt: 9 } }))
    expect(result.current).toMatchObject({ text: 'So far and more.', state: 'done', written: { finishedAt: 9 } })
    expect(last().closed).toBe(true)
    expect(settled).toHaveBeenCalledWith('c1')
  })

  it('keeps the live result over a stale stored one until the record catches up', () => {
    const settled = vi.fn()
    const { result, rerender } = renderHook(({ c }) => useReading(c, settled), { initialProps: { c: casting({}) } })
    act(() => last().emit({ type: 'done', reading: 'Finished.', written: NOT_WRITTEN }))
    expect(result.current.state).toBe('done')
    // The record is fetched after done; until it arrives the stored copy still says writing.
    rerender({ c: casting({}) })
    expect(result.current).toMatchObject({ text: 'Finished.', state: 'done' })
    rerender({ c: casting({ readingState: 'done', reading: 'Finished.' }) })
    expect(result.current).toMatchObject({ text: 'Finished.', state: 'done' })
    expect(FakeSource.opened).toHaveLength(1)
  })

  it('reports a failure, and a snapshot of a run already over', () => {
    const settled = vi.fn()
    const { result } = renderHook(() => useReading(casting({}), settled))
    act(() => last().emit({ type: 'error', message: 'Stopped before it was finished.', written: NOT_WRITTEN }))
    expect(result.current).toMatchObject({ state: 'failed', error: 'Stopped before it was finished.' })
    expect(last().closed).toBe(true)
    expect(settled).toHaveBeenCalledTimes(1)

    const { result: late } = renderHook(() => useReading(casting({ id: 'c2' }), settled))
    act(() => last().emit({ type: 'snapshot', reading: 'All of it.', state: 'done', error: null, written: NOT_WRITTEN }))
    expect(late.current).toMatchObject({ text: 'All of it.', state: 'done' })
    expect(last().closed).toBe(true)
    expect(settled).toHaveBeenLastCalledWith('c2')
  })

  it('closes the stream when the casting changes or the page leaves', () => {
    const { rerender, unmount } = renderHook(({ c }) => useReading(c), { initialProps: { c: casting({}) } })
    const first = last()
    rerender({ c: casting({ id: 'c2' }) })
    expect(first.closed).toBe(true)
    expect(FakeSource.opened).toHaveLength(2)
    unmount()
    expect(last().closed).toBe(true)
  })
})
