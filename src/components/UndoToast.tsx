import { useEffect } from 'react'

export interface Undo {
  /** Tells one toast from the next, so a second delete starts its own count. */
  id: number
  text: string
  undo: () => unknown
}

/** How long the Undo waits, as lm-chat's does after deleting a selection. */
export const UNDO_SHOWN_MS = 10_000

/** A note at the foot of the window after a delete, with an Undo, gone after a while. */
export default function UndoToast({ undo, onDone }: { undo: Undo; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, UNDO_SHOWN_MS)
    return () => window.clearTimeout(t)
  }, [undo.id, onDone])
  return (
    <div className="undo-toast" role="status">
      <span>{undo.text}</span>
      <button type="button" className="link" onClick={() => { undo.undo(); onDone() }}>Undo</button>
    </div>
  )
}
