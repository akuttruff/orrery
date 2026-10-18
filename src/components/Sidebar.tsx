import { PanelLeftClose, Plus, Settings as SettingsIcon } from 'lucide-react'
import { KIND_LABEL, KIND_ORDER } from '../lib/kinds.ts'
import { formatWhen } from '../lib/when.ts'
import type { CastingSummary, Kind } from '../types.ts'

interface SidebarProps {
  castings: CastingSummary[]
  activeId: string | null
  /** The kind being cast right now, if any: its + waits. */
  busy: Kind | null
  onOpen: (id: string) => void
  onCast: (kind: Kind) => void
  onSettings: () => void
  onCollapse: () => void
}

/**
 * A wide window: the castings down the side of the one open, the way the
 * chat app lists its conversations. Every kind has a section, with a + on
 * its head to cast another of it; within a section the most recently
 * changed casting is first. Settings waits at the foot.
 */
export default function Sidebar({ castings, activeId, busy, onOpen, onCast, onSettings, onCollapse }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Castings">
      <div className="side-head">
        <h2 className="side-title">Castings</h2>
        <button type="button" className="icon-btn small" aria-label="Hide the castings" onClick={onCollapse}><PanelLeftClose size={17} aria-hidden="true" /></button>
      </div>
      <div className="side-list">
        {KIND_ORDER.map((kind) => {
          const items = castings.filter((c) => c.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt)
          return (
            <section key={kind} className="side-section" aria-label={KIND_LABEL[kind]}>
              <div className="side-section-head">
                <span>{KIND_LABEL[kind]}</span>
                <button type="button" className="side-add" aria-label={`Cast ${KIND_LABEL[kind].toLowerCase()}`} title={items.length ? 'Cast another' : 'Cast'} disabled={busy !== null} onClick={() => onCast(kind)}>
                  <Plus size={15} aria-hidden="true" />
                </button>
              </div>
              {items.map((c) => <SideRow key={c.id} casting={c} active={c.id === activeId} onOpen={() => onOpen(c.id)} />)}
            </section>
          )
        })}
      </div>
      <button type="button" className="side-settings" onClick={onSettings}><SettingsIcon size={16} aria-hidden="true" /> Settings</button>
    </nav>
  )
}

const STATE_LABEL: Record<CastingSummary['readingState'], string> = { none: 'cast', writing: 'writing', done: 'read', failed: 'failed' }

function SideRow({ casting: c, active, onOpen }: { casting: CastingSummary; active: boolean; onOpen: () => void }) {
  const questions = c.questions === 1 ? '1 question' : c.questions > 1 ? `${c.questions} questions` : null
  const writing = c.readingState === 'writing'
  return (
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
  )
}
