import { useEffect, useMemo, useState } from 'react'
import { WheelSvg } from './ChartWheel'
import { api } from '../lib/api.ts'
import { parseWheel, wheelTitle } from '../lib/chartWheel.ts'
import type { Casting } from '../types.ts'

/**
 * A casting's wheel filling a tab of its own (`#/w/<id>`): the browser's
 * pinch and zoom do the rest, so the page lifts the app's pin to scale 1.
 */
export default function WheelPage({ id }: { id: string }) {
  const [casting, setCasting] = useState<Casting | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover')
    api.casting(id).then(setCasting).catch((e: Error) => setError(e.message))
  }, [id])

  const wheel = useMemo(() => (casting ? parseWheel(casting.result) : null), [casting])
  const title = wheel ? wheelTitle(wheel) : null
  useEffect(() => { if (title) document.title = `${title} · Orrery` }, [title])

  if (error) return <p className="error-card" role="alert">{error}</p>
  if (!casting) return null
  if (!wheel || !title) return <p className="error-card">This casting has no wheel to draw.</p>
  return (
    <main className="wheel-page">
      <WheelSvg wheel={wheel} title={title} readings={casting.transitReadings ?? undefined} />
      <p className="wheel-page-title">{title}</p>
    </main>
  )
}
