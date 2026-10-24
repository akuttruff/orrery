import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { WheelSvg } from './WheelSvg'
import { api } from '../lib/api.ts'
import { parseWheel, wheelTitle } from '../lib/chartWheel.ts'
import { closeWheel } from '../lib/route.ts'
import type { Casting } from '../types.ts'

const VIEWPORT = 'meta[name="viewport"]'

/**
 * A casting's wheel full size over the app (`#/w/<id>`): the browser's
 * pinch and zoom do the rest, so while it is up the app's pin to scale 1 is
 * lifted. Done, Escape and the browser's Back all return to the reading.
 */
export default function WheelPage({ id }: { id: string }) {
  const [casting, setCasting] = useState<Casting | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const meta = document.querySelector(VIEWPORT)
    const pinned = meta?.getAttribute('content')
    meta?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover')
    const was = document.title
    return () => {
      if (pinned) meta?.setAttribute('content', pinned)
      document.title = was
    }
  }, [])

  useEffect(() => {
    api.casting(id).then(setCasting).catch((e: Error) => setError(e.message))
  }, [id])

  const close = () => closeWheel(id)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const wheel = useMemo(() => (casting ? parseWheel(casting.result) : null), [casting])
  const title = wheel ? wheelTitle(wheel) : null
  useEffect(() => { if (title) document.title = `${title} · Orrery` }, [title])

  return (
    <div className="wheel-page" role="dialog" aria-modal="true" aria-label={title ?? 'Chart wheel'}>
      <button type="button" className="icon-btn wheel-page-close" aria-label="Back to the reading" title="Done" onClick={close}><X size={22} aria-hidden="true" /></button>
      {error && <p className="error-card" role="alert">{error}</p>}
      {casting && (!wheel || !title) && <p className="error-card">This casting has no wheel to draw.</p>}
      {wheel && title && (
        <>
          <WheelSvg wheel={wheel} title={title} readings={casting?.transitReadings ?? undefined} degrees={false} />
          <p className="wheel-page-title">{title}</p>
        </>
      )}
    </div>
  )
}
