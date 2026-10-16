import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../lib/api.ts'
import type { Config, Profile } from '../types.ts'

interface SettingsProps {
  profile: Profile
  config: Config
  onSaved: (profile: Profile, config: Config) => void
  onClose: () => void
}

const REASONING = [
  { value: '', label: 'Model default' },
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
]

/** Whose chart, and which model writes about it. */
export default function Settings({ profile, config, onSaved, onClose }: SettingsProps) {
  const [p, setP] = useState(profile)
  const [c, setC] = useState({ lmStudioUrl: config.lmStudioUrl, model: config.model, reasoning: config.reasoning })
  const [token, setToken] = useState('')
  const [models, setModels] = useState<{ models: string[]; loaded: string[]; error: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    api.models().then((m) => { if (live) setModels(m) }).catch((e: Error) => { if (live) setModels({ models: [], loaded: [], error: e.message }) })
    return () => { live = false }
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const nextProfile = await api.saveProfile(p)
      const patch: Record<string, string> = { ...c }
      if (token) patch.apiToken = token
      const nextConfig = await api.saveConfig(patch)
      onSaved(nextProfile, nextConfig)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const options = models?.models.length ? models.models : c.model ? [c.model] : []

  return (
    <div className="sheet" role="dialog" aria-label="Settings">
      <header className="sheet-head">
        <h2>Settings</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="sheet-body">
        <h3 className="section-title">Whose chart</h3>
        <label className="field"><span>Name</span><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <label className="field">
          <span>Born (local time at the birthplace)</span>
          <input value={p.dateTime} placeholder="YYYY-MM-DD HH:MM" inputMode="numeric" onChange={(e) => setP({ ...p, dateTime: e.target.value })} />
        </label>
        <label className="field"><span>City</span><input value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} /></label>
        <div className="field-row">
          <label className="field"><span>State</span><input value={p.state} onChange={(e) => setP({ ...p, state: e.target.value })} /></label>
          <label className="field"><span>Country</span><input value={p.country} onChange={(e) => setP({ ...p, country: e.target.value })} /></label>
        </div>

        <h3 className="section-title">Who writes</h3>
        <label className="field"><span>LM Studio address</span><input value={c.lmStudioUrl} inputMode="url" onChange={(e) => setC({ ...c, lmStudioUrl: e.target.value })} /></label>
        <label className="field">
          <span>API token {config.hasToken ? '(set; leave blank to keep)' : ''}</span>
          <input type="password" value={token} autoComplete="off" onChange={(e) => setToken(e.target.value)} />
        </label>
        <label className="field">
          <span>Model {models?.error ? `· ${models.error}` : ''}</span>
          <select value={c.model} onChange={(e) => setC({ ...c, model: e.target.value })}>
            {!c.model && <option value="">Choose a model</option>}
            {options.map((m) => <option key={m} value={m}>{m}{models?.loaded.includes(m) ? ' · loaded' : ''}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Reasoning</span>
          <select value={c.reasoning} onChange={(e) => setC({ ...c, reasoning: e.target.value })}>
            {REASONING.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        {error && <p className="reading-status error">{error}</p>}
      </div>
      <footer className="sheet-foot">
        <button type="button" className="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
      </footer>
    </div>
  )
}
