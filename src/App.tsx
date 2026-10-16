import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, CalendarRange, ChevronRight, Moon, Orbit, Settings as SettingsIcon, Sun, Sunrise } from 'lucide-react'
import CastingView from './components/CastingView'
import Settings from './components/Settings'
import MemoriesSheet from './components/MemoriesSheet'
import { api } from './lib/api.ts'
import { castingIdIn, hashFor } from './lib/route.ts'
import type { Casting, CastingSummary, Config, Kind, Profile } from './types.ts'

/** The shortcut buttons: what one tap casts. */
const SHORTCUTS: { kind: Kind; label: string; hint: string; Icon: typeof Sun }[] = [
  { kind: 'today', label: 'Today', hint: 'Transits now, over the birth chart', Icon: Sun },
  { kind: 'week', label: 'This week', hint: 'Seven days of headline transits', Icon: CalendarDays },
  { kind: 'month', label: 'This month', hint: 'Lunations, stations and ingresses', Icon: CalendarRange },
  { kind: 'year', label: 'Year ahead', hint: 'The slow planets, with their passes', Icon: Orbit },
  { kind: 'moon', label: 'Moon', hint: 'Void windows and lunations, two weeks', Icon: Moon },
  { kind: 'natal', label: 'Birth chart', hint: 'The chart itself, read', Icon: Sunrise },
]

const KIND_LABEL: Record<Kind, string> = { today: 'Today', week: 'Week', month: 'Month', year: 'Year', moon: 'Moon', natal: 'Birth chart' }

/** How often the home screen asks after readings still being written. */
export const WRITING_POLL_MS = 3000

/** The history entry this page made for a casting, so Back can be told from an address someone arrived at. */
const ENTRY = { orrery: true }

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [recent, setRecent] = useState<CastingSummary[]>([])
  const [current, setCurrent] = useState<Casting | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [memoriesOpen, setMemoriesOpen] = useState(false)
  const [busy, setBusy] = useState<Kind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshRecent = useCallback(() => { api.castings().then(setRecent).catch(() => { /* the list is a convenience */ }) }, [])

  /** Show a casting, with a history entry so Back comes home; from a casting (a recast) the entry is rewritten instead. */
  const show = useCallback((casting: Casting) => {
    setCurrent(casting)
    const target = hashFor(casting.id)
    if (window.location.hash === target) return
    if (castingIdIn(window.location.hash)) window.history.replaceState(ENTRY, '', target)
    else window.history.pushState(ENTRY, '', target)
  }, [])

  /** Back to the shortcuts: through history when this page made the entry, so the arrow and the browser's Back agree. */
  const home = useCallback(() => {
    if ((window.history.state as typeof ENTRY | null)?.orrery) { window.history.back(); return }
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setCurrent(null)
    refreshRecent()
  }, [refreshRecent])

  /** Open the casting the address names, if any; an address for one that is gone is cleared. */
  const openAddressed = useCallback(() => {
    const id = castingIdIn(window.location.hash)
    if (!id) return
    api.casting(id).then(setCurrent).catch(() => {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      setCurrent(null)
    })
  }, [])

  useEffect(() => {
    api.profile().then(setProfile).catch((e: Error) => setError(e.message))
    api.config().then(setConfig).catch((e: Error) => setError(e.message))
    refreshRecent()
    openAddressed()
    // The browser's Back or Forward: go where the address now says.
    const onPop = () => {
      if (castingIdIn(window.location.hash)) openAddressed()
      else { setCurrent(null); refreshRecent() }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [openAddressed, refreshRecent])

  // Readings go on being written on the server after a Back; the home screen keeps their state fresh while any are.
  const writing = recent.filter((c) => c.readingState === 'writing')
  useEffect(() => {
    if (current || writing.length === 0) return undefined
    const timer = window.setInterval(refreshRecent, WRITING_POLL_MS)
    return () => window.clearInterval(timer)
  }, [current, writing.length, refreshRecent])

  // Cast on a tap; when the result has no reading yet, ask for one straight away.
  const cast = useCallback(async (kind: Kind, fresh = false) => {
    setBusy(kind)
    setError(null)
    try {
      let casting = await api.cast(kind, fresh)
      if (casting.readingState === 'none') casting = await api.startReading(casting.id)
      show(casting)
      refreshRecent()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }, [refreshRecent, show])

  const open = async (id: string): Promise<void> => {
    try { show(await api.casting(id)) } catch (e) { setError((e as Error).message) }
  }

  const write = async (again: boolean): Promise<void> => {
    if (!current) return
    try { setCurrent(await api.startReading(current.id, again)); refreshRecent() } catch (e) { setError((e as Error).message) }
  }

  const stop = async (): Promise<void> => {
    if (!current) return
    await api.stopReading(current.id).catch(() => { /* already finished */ })
    setCurrent(await api.casting(current.id).catch(() => current))
    refreshRecent()
  }

  const updateCasting = async (patch: { memory?: boolean | null; memoryExcluded?: string[] }): Promise<void> => {
    if (!current) return
    try { setCurrent(await api.updateCasting(current.id, patch)) } catch (e) { setError((e as Error).message) }
  }

  const remove = async (): Promise<void> => {
    if (!current) return
    await api.remove(current.id).catch(() => { /* already gone */ })
    home()
  }

  // The reading was written (or failed) on the server: fetch the kept copy, so a reopen shows it without the stream.
  const settled = useCallback((id: string) => {
    api.casting(id).then((c) => { setCurrent((cur) => (cur?.id === c.id ? c : cur)); refreshRecent() }).catch(() => { /* next open */ })
  }, [refreshRecent])

  return (
    <div className="app">
      <header className="app-header">
        {current ? (
          <button type="button" className="icon-btn" aria-label="Back" onClick={home}><ArrowLeft size={20} aria-hidden="true" /></button>
        ) : <span className="icon-btn" aria-hidden="true" />}
        <div className="app-title">
          <h1>Orrery</h1>
          {profile && <span className="app-sub">{profile.name} · {profile.dateTime.slice(0, 10)} · {profile.city}</span>}
        </div>
        <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}><SettingsIcon size={19} aria-hidden="true" /></button>
      </header>

      <main className="scroll">
        {error && <p className="error-card" role="alert">{error}</p>}
        {current ? (
          <CastingView
            casting={current}
            memoryDefault={config?.memoryDefault === 'on'}
            onMemory={(m) => void updateCasting({ memory: m })}
            onExclude={(ids) => void updateCasting({ memoryExcluded: ids })}
            onMemories={() => setMemoriesOpen(true)}
            onWrite={(again) => void write(again)}
            onStop={() => void stop()}
            onRecast={() => void cast(current.kind, true)}
            onDelete={() => void remove()}
            onSettled={settled}
          />
        ) : (
          <>
            {config && !config.model && (
              <p className="error-card">No model chosen yet. <button type="button" className="link" onClick={() => setSettingsOpen(true)}>Pick one in Settings</button> so readings can be written.</p>
            )}
            {writing.length > 0 && (
              <section className="writing-now" aria-label="Readings being written">
                {writing.map((c) => (
                  <button key={c.id} type="button" className="writing-row" onClick={() => void open(c.id)}>
                    <span className="pulse" aria-hidden="true" />
                    <span className="writing-text"><b>{KIND_LABEL[c.kind]}</b> · {c.title}</span>
                    <span className="writing-state">Writing…</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ))}
              </section>
            )}
            <div className="shortcuts" role="list">
              {SHORTCUTS.map(({ kind, label, hint, Icon }) => (
                <button key={kind} type="button" role="listitem" className={`shortcut${busy === kind ? ' busy' : ''}`} disabled={busy !== null} onClick={() => void cast(kind)}>
                  <Icon size={22} aria-hidden="true" />
                  <span className="shortcut-label">{busy === kind ? 'Casting…' : label}</span>
                  <span className="shortcut-hint">{hint}</span>
                </button>
              ))}
            </div>
            {recent.length > writing.length && (
              <section className="recent">
                <h3 className="section-title">Recent</h3>
                <ul className="recent-list">
                  {recent.filter((c) => c.readingState !== 'writing').map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => void open(c.id)}>
                        <span className="recent-kind">{KIND_LABEL[c.kind]}</span>
                        <span className="recent-title">{c.title}</span>
                        <span className="recent-state">{c.readingState === 'done' ? 'read' : c.readingState === 'failed' ? 'failed' : 'cast'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      {settingsOpen && profile && config && (
        <Settings
          profile={profile}
          config={config}
          onSaved={(p, c) => { setProfile(p); setConfig(c); setSettingsOpen(false) }}
          onClose={() => setSettingsOpen(false)}
          onMemories={() => setMemoriesOpen(true)}
        />
      )}
      {memoriesOpen && <MemoriesSheet onClose={() => setMemoriesOpen(false)} />}
    </div>
  )
}
