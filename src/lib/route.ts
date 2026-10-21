/**
 * Where the page is, kept in the URL's hash: a casting is `#/c/<id>`, the
 * home screen is no hash at all. Walking it through the browser's history
 * means Back (a swipe, the Android button) goes from a casting to the
 * shortcuts instead of out of the app, and a reload reopens what was open.
 * A casting's wheel full size over the app is `#/w/<id>`, an entry of its own
 * so Back (or the wheel's Done) returns to the reading underneath.
 * `#/cast/<kind>` opens the home screen with that kind's popup up, for a
 * shortcut straight to casting; the address is cleared once it is open.
 */
const CASTING = /^#\/c\/([^/?#]+)$/
const WHEEL = /^#\/w\/([^/?#]+)$/
const CAST = /^#\/cast\/([a-z]+)$/

const idIn = (pattern: RegExp, hash: string): string | null => {
  const m = pattern.exec(hash)
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return null }
}

export const castingIdIn = (hash: string): string | null => idIn(CASTING, hash)
export const castKindIn = (hash: string): string | null => idIn(CAST, hash)
export const wheelIdIn = (hash: string): string | null => idIn(WHEEL, hash)

export const hashFor = (id: string | null): string => (id ? `#/c/${encodeURIComponent(id)}` : '')
export const wheelHashFor = (id: string): string => `#/w/${encodeURIComponent(id)}`

/** The history entry this page made for a wheel, so closing it can go back rather than away. */
const WHEEL_ENTRY = { orreryWheel: true }

/** Lets the page know the address changed by its own hand; the browser only says so for Back and Forward. */
const announce = (): void => { window.dispatchEvent(new PopStateEvent('popstate')) }

/** Show a casting's wheel over the app, as a history entry, so Back and Done both return to the reading. */
export function openWheel(id: string): void {
  window.history.pushState(WHEEL_ENTRY, '', wheelHashFor(id))
  announce()
}

/** Back under the wheel to its casting: through history when this page made the entry; an address someone arrived at is rewritten to the casting's. */
export function closeWheel(id: string): void {
  if ((window.history.state as typeof WHEEL_ENTRY | null)?.orreryWheel) { window.history.back(); return }
  window.history.replaceState(null, '', hashFor(id))
  announce()
}
