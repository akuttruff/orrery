import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { imageFilename, imageTitle, renderReadingImage, saveImage } from '../lib/readingImage.ts'
import type { ReadingImage } from '../lib/readingImage.ts'

interface DownloadButtonProps {
  /** The reading as a picture, asked for only when tapped. */
  image: () => ReadingImage
}

const named = (e: unknown, name: string): boolean => e instanceof Error && e.name === name || (typeof e === 'object' && e !== null && (e as { name?: unknown }).name === name)

/**
 * Save a tarot reading as one image: the cards, the question and the text.
 * On a phone the share sheet opens (Save Image); elsewhere it downloads.
 */
export default function DownloadButton({ image }: DownloadButtonProps) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  // The picture last made, kept so a second tap shares at once: Safari wants the share inside the tap, and drawing can outlast it.
  const made = useRef<{ key: string; file: File; title: string } | null>(null)

  const click = async (): Promise<void> => {
    if (busy) return
    setNote(null)
    const input = image()
    const key = JSON.stringify(input)
    let ready = made.current?.key === key ? made.current : null
    try {
      if (!ready) {
        setBusy(true)
        const blob = await renderReadingImage(input)
        ready = { key, file: new File([blob], imageFilename(input), { type: 'image/png' }), title: imageTitle(input) }
        made.current = ready
      }
      await saveImage(ready.file, ready.title)
    } catch (e) {
      if (named(e, 'AbortError')) return
      if (named(e, 'NotAllowedError') && made.current) setNote({ text: 'The image is ready. Tap Download again to save it.', error: false })
      else setNote({ text: `The image could not be made: ${(e as Error).message || 'unknown error'}`, error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="chip" disabled={busy} aria-busy={busy} onClick={() => void click()}>
        <Download size={13} aria-hidden="true" /> {busy ? 'Making image…' : 'Download'}
      </button>
      {note && <span className={`download-note${note.error ? ' error' : ''}`} role={note.error ? 'alert' : 'status'}>{note.text}</span>}
    </>
  )
}
