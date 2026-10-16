/**
 * Where the page is, kept in the URL's hash: a casting is `#/c/<id>`, the
 * home screen is no hash at all. Walking it through the browser's history
 * means Back (a swipe, the Android button) goes from a casting to the
 * shortcuts instead of out of the app, and a reload reopens what was open.
 * A casting's wheel on a page of its own is `#/w/<id>`, opened in a new tab.
 */
const CASTING = /^#\/c\/([^/?#]+)$/
const WHEEL = /^#\/w\/([^/?#]+)$/

const idIn = (pattern: RegExp, hash: string): string | null => {
  const m = pattern.exec(hash)
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return null }
}

export const castingIdIn = (hash: string): string | null => idIn(CASTING, hash)
export const wheelIdIn = (hash: string): string | null => idIn(WHEEL, hash)

export const hashFor = (id: string | null): string => (id ? `#/c/${encodeURIComponent(id)}` : '')
export const wheelHashFor = (id: string): string => `#/w/${encodeURIComponent(id)}`
