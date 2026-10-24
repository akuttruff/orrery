import { memo } from 'react'
import { WheelCaption, WheelSvg } from './WheelSvg'
import { type Wheel, wheelTitle } from '../lib/chartWheel.ts'
import { openWheel, wheelHashFor } from '../lib/route.ts'

/**
 * A casting's wheel on its card (the picture is WheelSvg.tsx, shared with
 * lm-chat). A tap opens it full size over the app (WheelPage), where the
 * browser's own pinch and zoom apply. The degrees are left to the popup.
 */
function ChartWheel({ wheel, castingId, readings }: { wheel: Wheel; castingId?: string; readings?: Record<string, string> }) {
  const title = wheelTitle(wheel)

  return (
    <figure className="wheel">
      {castingId ? (
        <a className="wheel-open" href={wheelHashFor(castingId)} onClick={(e) => { e.preventDefault(); openWheel(castingId) }} aria-label="Open the wheel full size" title="Open full size">
          <WheelSvg wheel={wheel} title={title} readings={readings} degrees={false} />
        </a>
      ) : <WheelSvg wheel={wheel} title={title} readings={readings} degrees={false} />}
      <WheelCaption wheel={wheel} title={title} />
    </figure>
  )
}

export default memo(ChartWheel)
