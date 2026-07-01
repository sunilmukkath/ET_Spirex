import { useCallback, useEffect, useState } from 'react'
import { Layers, Loader2, Save, Trash2, Users } from 'lucide-react'
import { api, type TeamPreset, type TeamPresetKind } from '../../api/client'

interface Props {
  surveyId: number
  kind: TeamPresetKind
  onSave: () => { name: string; config: Record<string, unknown> }
  /** Client-side apply (banner / filter). */
  onLoad?: (config: Record<string, unknown>) => void | Promise<void>
  /** Server-side apply then refresh (quota / qc). */
  onApplied?: () => void | Promise<void>
}

const KIND_LABELS: Record<TeamPresetKind, string> = {
  banner: 'banner table',
  quota: 'quota plan',
  qc: 'QC thresholds',
  filter: 'filter set',
}

export function TeamPresetsMenu({ surveyId, kind, onSave, onLoad, onApplied }: Props) {
  const [presets, setPresets] = useState<TeamPreset[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')

  const serverApply = kind === 'quota' || kind === 'qc'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { presets: rows } = await api.getTeamPresets(surveyId, kind)
      setPresets(rows)
    } catch {
      setPresets([])
    } finally {
      setLoading(false)
    }
  }, [surveyId, kind])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave() {
    const payload = onSave()
    const name = saveName.trim() || payload.name.trim()
    if (!name) return
    setSaving(true)
    try {
      await api.createTeamPreset(surveyId, { name, kind, config: payload.config })
      setSaveName('')
      setSaveOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleApply(preset: TeamPreset) {
    setApplyingId(preset.id)
    try {
      if (serverApply) {
        await api.applyTeamPreset(surveyId, preset.id)
        await onApplied?.()
      } else {
        await onLoad?.(preset.config)
      }
    } finally {
      setApplyingId(null)
    }
  }

  async function handleDelete(id: string) {
    await api.deleteTeamPreset(surveyId, id)
    await load()
  }

  return (
    <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
          <Users size={13} />
          Team presets
        </span>
        {saveOpen ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder={`${KIND_LABELS[kind]} name`}
              className="w-44 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[var(--et-teal)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
                if (e.key === 'Escape') setSaveOpen(false)
              }}
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--et-teal)] px-2.5 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setSaveOpen(false)
                setSaveName('')
              }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              const suggested = onSave().name
              setSaveName(suggested)
              setSaveOpen(true)
            }}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-indigo-800 ring-1 ring-indigo-200 hover:bg-indigo-50"
          >
            <Save size={12} />
            Save team preset
          </button>
        )}
        {loading && <Loader2 className="animate-spin text-indigo-400" size={14} />}
        {presets.map((preset) => (
          <span
            key={preset.id}
            className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-indigo-200"
          >
            <button
              type="button"
              onClick={() => void handleApply(preset)}
              disabled={applyingId === preset.id}
              className="inline-flex items-center gap-1 font-medium text-indigo-800 hover:underline disabled:opacity-50"
            >
              {applyingId === preset.id ? (
                <Loader2 className="animate-spin" size={11} />
              ) : (
                <Layers size={11} />
              )}
              {preset.name}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(preset.id)}
              className="text-indigo-400 hover:text-red-600"
            >
              <Trash2 size={11} />
            </button>
          </span>
        ))}
      </div>
      <p className="text-xs text-indigo-600/80">
        Shared with everyone on this project — save and reuse standard {KIND_LABELS[kind]} setups.
      </p>
    </div>
  )
}
