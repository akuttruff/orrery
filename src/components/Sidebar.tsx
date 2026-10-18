import { useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { PanelLeftClose, Plus, Settings as SettingsIcon, Star, Trash2 } from 'lucide-react'
import { KIND_LABEL, KIND_ORDER, byPlace } from '../lib/kinds.ts'
import { formatWhen } from '../lib/when.ts'
import type { CastingSummary, Kind } from '../types.ts'

/** How wide the sidebar may be dragged, and where it starts. */
export const SIDEBAR_MIN = 220
export const SIDEBAR_MAX = 520
export const SIDEBAR_DEFAULT = 300
const WIDTH_KEY = 'orrery.sidebarWidth'

const clamp = (w: number): number => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)))

function storedWidth(): number {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY))
    return w >= SIDEBAR_MIN && w <= SIDEBAR_MAX ? w : SIDEBAR_DEFAULT
  } catch { return SIDEBAR_DEFAULT }
}

/** The sidebar's width, dragged at its edge and kept on this device; a double-click on the edge puts it back. */
function useSidebarWidth(): { width: number; onPointerDown: (e: ReactPointerEvent) => void; onKeyDown: (e: ReactKeyboardEvent) => void; reset: () => void } {
  const [width, setWidth] = useState(storedWidth)
  const keep = (w: number): void => {
    setWidth(w)
    try { localStorage.setItem(WIDTH_KEY, String(w)) } catch { /* a preference, not a record */ }
  }
  const onPointerDown = (e: ReactPointerEvent): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: PointerEvent): void => setWidth(clamp(startW + ev.clientX - startX))
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      keep(clamp(startW + ev.clientX - startX))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const onKeyDown = (e: ReactKeyboardEvent): void => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); keep(clamp(width + (e.key === 'ArrowLeft' ? -16 : 16))) }
    if (e.key === 'Home') { e.preventDefault(); keep(SIDEBAR_DEFAULT) }
  }
  return { width, onPointerDown, onKeyDown, reset: () => keep(SIDEBAR_DEFAULT) }
}

interface SidebarProps {
  castings: CastingSummary[]
  activeId: string | null
  /** The kind being cast right now, if any: its + waits. */
  busy: Kind | null
  onOpen: (id: string) => void
  onCast: (kind: Kind) => void
  /** Star a casting (kept at the top of its kind), or take the star off. */
  onStar: (id: string, starred: boolean) => void
  /** Delete a casting, with its reading and questions. */
  onRemove: (id: string) => void
  onSettings: () => void
  onCollapse: () => void
  /** Above the sections: the memory choice the + buttons cast with. */
  children?: ReactNode
}

/**
 * A wide window: the castings down the side of the one open, the way the
 * chat app lists its conversations. Every kind has a section, with a + on
 * its head to cast another of it; within a section the most recently
 * changed casting is first. Settings waits at the foot.
 */
export default function Sidebar({ castings, activeId, busy, onOpen, onCast, onStar, onRemove, onSettings, onCollapse, children }: SidebarProps) {
  const { width, onPointerDown, onKeyDown, reset } = useSidebarWidth()
  return (
    <nav className="sidebar" aria-label="Castings" style={{ flexBasis: width, width }}>
      <div className="side-head">
        <h2 className="side-title">Castings</h2>
        <button type="button" className="icon-btn small" aria-label="Hide the castings" onClick={onCollapse}><PanelLeftClose size={17} aria-hidden="true" /></button>
      </div>
      {children}
      <div className="side-list">
        {KIND_ORDER.map((kind) => {
          const items = castings.filter((c) => c.kind === kind).sort(byPlace)
          return (
            <section key={kind} className="side-section" aria-label={KIND_LABEL[kind]}>
              <div className="side-section-head">
                <span>{KIND_LABEL[kind]}</span>
                <button type="button" className="side-add" aria-label={`Cast ${KIND_LABEL[kind].toLowerCase()}`} title={items.length ? 'Cast another' : 'Cast'} disabled={busy !== null} onClick={() => onCast(kind)}>
                  <Plus size={15} aria-hidden="true" />
                </button>
              </div>
              {items.map((c) => (
                <SideRow
                  key={c.id}
                  casting={c}
                  active={c.id === activeId}
                  onOpen={() => onOpen(c.id)}
                  onStar={() => onStar(c.id, !c.starred)}
                  onRemove={() => onRemove(c.id)}
                />
              ))}
            </section>
          )
        })}
      </div>
      <button type="button" className="side-settings" onClick={onSettings}><SettingsIcon size={16} aria-hidden="true" /> Settings</button>
      <div
        className="side-resize"
        role="separator"
        aria-label="Sidebar width"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize; double-click to reset"
        onPointerDown={onPointerDown}
        onDoubleClick={reset}
        onKeyDown={onKeyDown}
      />
    </nav>
  )
}

const STATE_LABEL: Record<CastingSummary['readingState'], string> = { none: 'cast', writing: 'writing', done: 'read', failed: 'failed' }

interface SideRowProps {
  casting: CastingSummary
  active: boolean
  onOpen: () => void
  onStar: () => void
  onRemove: () => void
}

/**
 * One casting: the row opens it; a star and a bin wait at its edge for a
 * hover (the star stays once it is on). The bin takes the casting and
 * everything under it straight away.
 */
function SideRow({ casting: c, active, onOpen, onStar, onRemove }: SideRowProps) {
  const questions = c.questions === 1 ? '1 question' : c.questions > 1 ? `${c.questions} questions` : null
  const writing = c.readingState === 'writing'
  return (
    <div className={`side-row-wrap${active ? ' active' : ''}${c.starred ? ' starred' : ''}`}>
      <button type="button" className={`side-row${active ? ' active' : ''}`} aria-current={active ? 'true' : undefined} onClick={onOpen}>
        <span className="side-dot" aria-hidden="true" />
        <span className="side-main">
          <span className="side-name">{c.title}</span>
          <span className="side-time">
            {writing ? <span className="side-working"><span className="pulse" aria-hidden="true" /> Writing</span> : STATE_LABEL[c.readingState]}
            {questions ? ` · ${questions}` : ''} · {formatWhen(c.updatedAt)}
          </span>
        </span>
      </button>
      <div className="side-actions">
        <button type="button" className="icon-btn small" aria-label={c.starred ? `Unstar ${c.title}` : `Star ${c.title}`} aria-pressed={c.starred} onClick={onStar}>
          <Star size={15} aria-hidden="true" fill={c.starred ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className="icon-btn small danger" aria-label={`Delete ${c.title}`} disabled={writing} title={writing ? 'Stop the reading first' : undefined} onClick={onRemove}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
