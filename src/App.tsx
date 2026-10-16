import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, CalendarRange, Moon, Orbit, Settings as SettingsIcon, Sun, Sunrise } from 'lucide-react'
import CastingView from './components/CastingView'
import Settings from './components/Settings'
import { api } from './lib/api.ts'
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

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [recent, setRecent] = useState<CastingSummary[]>([])
  const [current, setCurrent] = useState<Casting | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState<Kind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshRecent = useCallback(() => { api.castings().then(setRecent).catch(() => { /* the list is a convenience */ }) }, [])

  useEffect(() => {
    api.profile().then(setProfile).catch((e: Error) => setError(e.message))
    api.config().then(setConfig).catch((e: Error) => setError(e.message))
    refreshRecent()
  }, [refreshRecent])

  // Cast on a tap; when the result has no reading yet, ask for one straight away.
  const cast = useCallback(async (kind: Kind, fresh = false) => {
    setBusy(kind)
    setError(null)
    try {
      let casting = await api.cast(kind, fresh)
      if (casting.readingState === 'none') casting = await api.startReading(casting.id)
      setCurrent(casting)
      refreshRecent()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }, [refreshRecent])

  const open = async (id: string): Promise<void> => {
    try { setCurrent(await api.casting(id)) } catch (e) { setError((e as Error).message) }
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

  const remove = async (): Promise<void> => {
    if (!current) return
    await api.remove(current.id).catch(() => { /* already gone */ })
    setCurrent(null)
    refreshRecent()
  }

  // The reading was written (or failed) on the server: fetch the kept copy, so a reopen shows it without the stream.
  const settled = useCallback((id: string) => {
    api.casting(id).then((c) => { setCurrent((cur) => (cur?.id === c.id ? c : cur)); refreshRecent() }).catch(() => { /* next open */ })
  }, [refreshRecent])

  return (
    <div className="app">
      <header className="app-header">
        {current ? (
          <button type="button" className="icon-btn" aria-label="Back" onClick={() => setCurrent(null)}><ArrowLeft size={20} aria-hidden="true" /></button>
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
            <div className="shortcuts" role="list">
              {SHORTCUTS.map(({ kind, label, hint, Icon }) => (
                <button key={kind} type="button" role="listitem" className={`shortcut${busy === kind ? ' busy' : ''}`} disabled={busy !== null} onClick={() => void cast(kind)}>
                  <Icon size={22} aria-hidden="true" />
                  <span className="shortcut-label">{busy === kind ? 'Casting…' : label}</span>
                  <span className="shortcut-hint">{hint}</span>
                </button>
              ))}
            </div>
            {recent.length > 0 && (
              <section className="recent">
                <h3 className="section-title">Recent</h3>
                <ul className="recent-list">
                  {recent.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => void open(c.id)}>
                        <span className="recent-kind">{KIND_LABEL[c.kind]}</span>
                        <span className="recent-title">{c.title}</span>
                        <span className="recent-state">{c.readingState === 'done' ? 'read' : c.readingState === 'writing' ? 'writing…' : c.readingState === 'failed' ? 'failed' : 'cast'}</span>
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
        />
      )}
    </div>
  )
}
