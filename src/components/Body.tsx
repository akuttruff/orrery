import { memo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** A reading or answer's markdown. Memoised: while the model thinks, the text does not change, and parsing it again each redraw is what made the page sluggish. */
function Body({ text, writing }: { text: string; writing: boolean }) {
  return (
    <div className={`reading-body${writing ? ' writing' : ''}`}>
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  )
}

export default memo(Body)
