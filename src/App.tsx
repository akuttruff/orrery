import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, CalendarRange, ChevronRight, Moon, Orbit, PanelLeftOpen, Settings as SettingsIcon, Sun, Sunrise } from 'lucide-react'
import CastingView from './components/CastingView'
import Recent from './components/Recent'
import Settings from './components/Settings'
import Sidebar from './components/Sidebar'
import MemoriesSheet from './components/MemoriesSheet'
import CastSheet from './components/CastSheet'
import useMediaQuery, { WIDE } from './hooks/useMediaQuery.ts'
import { api } from './lib/api.ts'
import type { CastOptions } from './lib/api.ts'
import { DEFAULT_STYLE, isStyleId, type StyleId } from './lib/styles.ts'
import { KIND_LABEL } from './lib/kinds.ts'
import { formatWhen } from './lib/when.ts'
import { castKindIn, castingIdIn, hashFor } from './lib/route.ts'
import { KINDS } from './types.ts'
import type { Casting, CastingSummary, Config, Kind, Profile } from './types.ts'

/** The shortcut buttons: what one tap casts, anew each time. */
const SHORTCUTS: { kind: Kind; label: string; hint: string; Icon: typeof Sun }[] = [
  { kind: 'today', label: 'Today', hint: 'Transits now, over the birth chart', Icon: Sun },
  { kind: 'week', label: 'This week', hint: 'The rest of the week, through Saturday', Icon: CalendarDays },
  { kind: 'month', label: 'This month', hint: 'Lunations, stations and ingresses', Icon: CalendarRange },
  { kind: 'year', label: 'Year ahead', hint: 'The slow planets, with their passes', Icon: Orbit },
  { kind: 'moon', label: 'Moon', hint: 'Void windows and lunations, two weeks', Icon: Moon },
  { kind: 'natal', label: 'Birth chart', hint: 'The chart itself, read', Icon: Sunrise },
]

/** How often the home screen asks after readings still being written. */
export const WRITING_POLL_MS = 3000

/** The popup sentences for a transit wheel are written beside the reading; the open casting looks for them this often, this many times. */
export const TRANSIT_POLL_MS = 4000
const TRANSIT_POLLS = 45

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
  // A wide window lists the castings beside the one open; the list can be tucked away, and stays so across visits.
  const wide = useMediaQuery(WIDE)
  const [sidebarOpen, setSidebarOpen] = useState(() => { try { return localStorage.getItem('orrery.sidebar') !== 'closed' } catch { return true } })
  const setSidebar = (open: boolean): void => {
    setSidebarOpen(open)
    try { localStorage.setItem('orrery.sidebar', open ? 'open' : 'closed') } catch { /* a preference, not a record */ }
  }
  const sidebar = wide && sidebarOpen
  // The memory choice a tap casts with: the switch is Settings' default; the memories left out are kept on this device.
  const memoryOn = config?.memoryDefault === 'on'
  const [excluded, setExcluded] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('orrery.memoryExcluded') ?? '[]') as string[] } catch { return [] } })
  const setMemoryOn = async (on: boolean): Promise<void> => {
    try { setConfig(await api.saveConfig({ memoryDefault: on ? 'on' : 'off' })) } catch (e) { setError((e as Error).message) }
  }
  const exclude = (ids: string[]): void => {
    setExcluded(ids)
    try { localStorage.setItem('orrery.memoryExcluded', JSON.stringify(ids)) } catch { /* a preference, not a record */ }
  }
  // What the next reading is for, in their words (this visit only), and the kind of reading (kept on this device).
  const [note, setNote] = useState('')
  const [style, setStyleState] = useState<StyleId>(() => { try { const s = localStorage.getItem('orrery.style'); return isStyleId(s) ? s : DEFAULT_STYLE } catch { return DEFAULT_STYLE } })
  const setStyle = (s: StyleId): void => {
    setStyleState(s)
    try { localStorage.setItem('orrery.style', s) } catch { /* a preference, not a record */ }
  }
  const choice: CastOptions = { memory: memoryOn, memoryExcluded: memoryOn ? excluded : [], style, note: note.trim() }
  // A tile opens the popup for these choices; the cast waits for its button.
  const [pending, setPending] = useState<Kind | null>(null)
  const closeSheet = useCallback(() => setPending(null), [])

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
    // A shortcut straight to casting: the popup opens, and the address is cleared so a reload does not reopen it.
    const kind = castKindIn(window.location.hash)
    if (kind && (KINDS as string[]).includes(kind)) {
      setPending(kind as Kind)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
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

  // A tap casts anew, with the memory choice made beforehand, and starts its reading straight away; the earlier castings of the kind stay.
  const cast = useCallback(async (kind: Kind, options: CastOptions) => {
    setBusy(kind)
    setError(null)
    try {
      let casting = await api.cast(kind, options)
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

  const updateCasting = async (patch: CastOptions): Promise<void> => {
    if (!current) return
    try { setCurrent(await api.updateCasting(current.id, patch)) } catch (e) { setError((e as Error).message) }
  }

  const remove = async (): Promise<void> => {
    if (!current) return
    await api.remove(current.id).catch(() => { /* already gone */ })
    home()
  }

  /** From the sidebar: a casting goes, and the view with it when it was the one open. */
  const removeOne = async (id: string): Promise<void> => {
    await api.remove(id).catch(() => { /* already gone */ })
    if (current?.id === id) home(); else refreshRecent()
  }

  const star = async (id: string, starred: boolean): Promise<void> => {
    try {
      const c = await api.updateCasting(id, { starred })
      setCurrent((cur) => (cur?.id === id ? { ...cur, starred: c.starred } : cur))
      refreshRecent()
    } catch (e) { setError((e as Error).message) }
  }

  // A transit wheel's popups arrive a little after the cast: look for them, and keep only them, so a reading mid-stream is not disturbed.
  const transitId = current?.kind === 'today' && current.transitReadings === null ? current.id : null
  useEffect(() => {
    if (!transitId) return undefined
    let left = TRANSIT_POLLS
    const timer = window.setInterval(() => {
      api.casting(transitId).then((c) => {
        if (c.transitReadings !== null || --left <= 0) window.clearInterval(timer)
        if (c.transitReadings !== null) setCurrent((cur) => (cur?.id === c.id ? { ...cur, transitReadings: c.transitReadings } : cur))
      }).catch(() => { /* next look */ })
    }, TRANSIT_POLL_MS)
    return () => window.clearInterval(timer)
  }, [transitId])

  // The reading was written (or failed) on the server: fetch the kept copy, so a reopen shows it without the stream.
  const settled = useCallback((id: string) => {
    api.casting(id).then((c) => { setCurrent((cur) => (cur?.id === c.id ? c : cur)); refreshRecent() }).catch(() => { /* next open */ })
  }, [refreshRecent])

  return (
    <div className={`app${sidebar ? ' with-sidebar' : ''}`}>
      {sidebar && (
        <Sidebar
          castings={recent}
          activeId={current?.id ?? null}
          busy={busy}
          onOpen={(id) => void open(id)}
          onCast={setPending}
          onStar={(id, starred) => void star(id, starred)}
          onRemove={(id) => void removeOne(id)}
          onSettings={() => setSettingsOpen(true)}
          onCollapse={() => setSidebar(false)}
        />
      )}
      <div className="main">
      <header className="app-header">
        <span className="app-header-side">
          {wide && !sidebarOpen && (
            <button type="button" className="icon-btn" aria-label="Show the castings" onClick={() => setSidebar(true)}><PanelLeftOpen size={20} aria-hidden="true" /></button>
          )}
          {current && <button type="button" className="icon-btn" aria-label="Back" onClick={home}><ArrowLeft size={20} aria-hidden="true" /></button>}
        </span>
        <div className="app-title">
          <h1>Orrery</h1>
          {profile && <span className="app-sub">{profile.name} · {profile.dateTime.slice(0, 10)} · {profile.city}</span>}
        </div>
        <span className="app-header-side end">
          {!sidebar && <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}><SettingsIcon size={19} aria-hidden="true" /></button>}
        </span>
      </header>

      <main className="scroll">
        {error && <p className="error-card" role="alert">{error}</p>}
        {current ? (
          <CastingView
            casting={current}
            memoryDefault={config?.memoryDefault === 'on'}
            onMemory={(m) => void updateCasting({ memory: m })}
            onExclude={(ids) => void updateCasting({ memoryExcluded: ids })}
            onFrame={(frame) => void updateCasting(frame)}
            onMemories={() => setMemoriesOpen(true)}
            onWrite={(again) => void write(again)}
            onStop={() => void stop()}
            onRecast={() => void cast(current.kind, { memory: current.memory, memoryExcluded: current.memoryExcluded, style: current.style, note: current.note })}
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
                    <span className="writing-state">Writing{c.written.startedAt ? ` since ${formatWhen(c.written.startedAt)}` : ''}…</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ))}
              </section>
            )}
            <div className="shortcuts" role="list">
              {SHORTCUTS.map(({ kind, label, hint, Icon }) => (
                <button key={kind} type="button" role="listitem" className={`shortcut${busy === kind ? ' busy' : ''}`} disabled={busy !== null} onClick={() => setPending(kind)}>
                  <Icon size={22} aria-hidden="true" />
                  <span className="shortcut-label">{busy === kind ? 'Casting…' : label}</span>
                  <span className="shortcut-hint">{hint}</span>
                </button>
              ))}
            </div>
            {!sidebar && <Recent castings={recent.filter((c) => c.readingState !== 'writing')} onOpen={(id) => void open(id)} />}
          </>
        )}
      </main>
      </div>

      {pending && config && (
        <CastSheet
          kind={pending}
          note={note}
          style={style}
          memoryOn={memoryOn}
          excluded={excluded}
          busy={busy !== null}
          onNote={setNote}
          onStyle={setStyle}
          onMemory={(on) => void setMemoryOn(on)}
          onExclude={exclude}
          onManage={() => setMemoriesOpen(true)}
          onCast={() => { const kind = pending; setPending(null); void cast(kind, choice) }}
          onClose={closeSheet}
        />
      )}
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
