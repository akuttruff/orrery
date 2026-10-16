/**
 * Where the page is, kept in the URL's hash: a casting is `#/c/<id>`, the
 * home screen is no hash at all. Walking it through the browser's history
 * means Back (a swipe, the Android button) goes from a casting to the
 * shortcuts instead of out of the app, and a reload reopens what was open.
 */
const CASTING = /^#\/c\/([^/?#]+)$/

export const castingIdIn = (hash: string): string | null => {
  const m = CASTING.exec(hash)
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return null }
}

export const hashFor = (id: string | null): string => (id ? `#/c/${encodeURIComponent(id)}` : '')
