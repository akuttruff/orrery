import { useEffect, useState } from 'react'
import type { LiveReading } from '../hooks/useReading.ts'
import { liveLabel } from '../lib/liveLabel.ts'

/** Whole seconds since `startedAt`, ticking once a second. */
function useElapsed(startedAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : null
}

interface LiveStatusProps {
  reading: Pick<LiveReading, 'text' | 'written' | 'status'>
  /** A sentence after the status, such as that the writing carries on elsewhere. */
  note?: string
}

/** While a reading or answer is written: LM Studio's step and the seconds since it started, as lm-chat's header shows them. */
export default function LiveStatus({ reading, note }: LiveStatusProps) {
  const elapsed = useElapsed(reading.written.startedAt)
  return (
    <p className="reading-status">
      {liveLabel(reading)}…{elapsed !== null ? ` · ${elapsed}s` : ''}
      {note ? ` ${note}` : ''}
    </p>
  )
}
