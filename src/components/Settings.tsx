import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../lib/api.ts'
import { HOUSE_SYSTEMS, isHouseSystem } from '../types.ts'
import type { Config, Profile } from '../types.ts'

interface SettingsProps {
  profile: Profile
  config: Config
  onSaved: (profile: Profile, config: Config) => void
  onClose: () => void
  onMemories: () => void
}

const REASONING = [
  { value: '', label: 'Model default' },
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
]

interface ModelPickerProps {
  value: string
  onChange: (model: string) => void
  /** What the empty choice says: no model yet, or none preferred. */
  empty: string
  /** Whether the empty choice stays on offer once a model is picked. */
  keepEmpty?: boolean
  models: { models: string[]; loaded: string[] } | null
}

/** LM Studio's models, loaded ones marked; the one saved is offered even when LM Studio can't be asked. */
function ModelPicker({ value, onChange, empty, keepEmpty = false, models }: ModelPickerProps) {
  const options = models?.models.length ? models.models : value ? [value] : []
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {(keepEmpty || !value) && <option value="">{empty}</option>}
      {options.map((m) => <option key={m} value={m}>{m}{models?.loaded.includes(m) ? ' · loaded' : ''}</option>)}
    </select>
  )
}

/** Whose chart, and which model writes about it. */
export default function Settings({ profile, config, onSaved, onClose, onMemories }: SettingsProps) {
  const [p, setP] = useState(profile)
  const [c, setC] = useState({ lmStudioUrl: config.lmStudioUrl, model: config.model, preferredModel: config.preferredModel, fastModel: config.fastModel ?? '', reasoning: config.reasoning, memoryDefault: config.memoryDefault })
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
        <label className="field">
          <span>Houses</span>
          <select value={p.houseSystem} onChange={(e) => { if (isHouseSystem(e.target.value)) setP({ ...p, houseSystem: e.target.value }) }}>
            {HOUSE_SYSTEMS.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
          </select>
          <span className="field-hint">Every chart, transit and forecast is cast in these houses. Readings already cast keep theirs until you recast them. Placidus can't be cast within the polar circles.</span>
        </label>

        <h3 className="section-title">Who writes</h3>
        <label className="field"><span>LM Studio address</span><input value={c.lmStudioUrl} inputMode="url" onChange={(e) => setC({ ...c, lmStudioUrl: e.target.value })} /></label>
        <label className="field">
          <span>API token {config.hasToken ? '(set; leave blank to keep, for the same URL)' : ''}</span>
          <input type="password" value={token} autoComplete="off" onChange={(e) => setToken(e.target.value)} />
        </label>
        <label className="field">
          <span>Model {models?.error ? `· ${models.error}` : ''}</span>
          <ModelPicker value={c.model} onChange={(model) => setC({ ...c, model })} empty="Choose a model" models={models} />
        </label>
        <label className="field">
          <span>Use when loaded</span>
          <ModelPicker value={c.preferredModel} onChange={(preferredModel) => setC({ ...c, preferredModel })} empty="None" keepEmpty models={models} />
          <span className="field-hint">When this model is loaded in LM Studio, Orrery uses it instead and leaves the other alone.</span>
        </label>
        <label className="field">
          <span>Quick jobs</span>
          <ModelPicker value={c.fastModel} onChange={(fastModel) => setC({ ...c, fastModel })} empty="None (use the main model)" keepEmpty models={models} />
          <span className="field-hint">Short jobs, like the transit table's notes, go to this model so the main one stays free.</span>
        </label>
        <label className="field">
          <span>Reasoning</span>
          <select value={c.reasoning} onChange={(e) => setC({ ...c, reasoning: e.target.value })}>
            {REASONING.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>

        <h3 className="section-title">Memory</h3>
        <label className="toggle">
          <input type="checkbox" checked={c.memoryDefault === 'on'} onChange={(e) => setC({ ...c, memoryDefault: e.target.checked ? 'on' : 'off' })} />
          <span>
            <span className="toggle-label">Read with memories by default</span>
            <span className="toggle-hint">What Orrery has learned about you from your questions goes into readings and answers where the chart touches it. Each casting can switch this on or off for itself.</span>
          </span>
        </label>
        <button type="button" className="chip" onClick={onMemories}>Manage memories</button>
        {error && <p className="reading-status error">{error}</p>}
      </div>
      <footer className="sheet-foot">
        <button type="button" className="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
      </footer>
    </div>
  )
}
