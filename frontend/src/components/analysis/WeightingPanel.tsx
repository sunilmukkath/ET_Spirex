import { useCallback, useEffect, useState } from 'react'
import { Loader2, Save, Scale } from 'lucide-react'
import { api, type SurveyVariable, type WeightConfig } from '../../api/client'

interface Props {
  surveyId: number
  variables: SurveyVariable[]
}

const EMPTY: WeightConfig = { enabled: false, variable_id: null }

export function WeightingPanel({ surveyId, variables }: Props) {
  const [config, setConfig] = useState<WeightConfig>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const numericVars = variables.filter((v) => v.kind === 'numeric' || v.metrics?.includes('mean'))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getWeightConfig(surveyId)
      setConfig({ enabled: data.enabled, variable_id: data.variable_id ?? null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load weighting')
      setConfig(EMPTY)
    } finally {
      setLoading(false)
    }
  }, [surveyId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    setSaving(true)
    setNotice(null)
    setError(null)
    try {
      const saved = await api.setWeightConfig(surveyId, config)
      setConfig({ enabled: saved.enabled, variable_id: saved.variable_id ?? null })
      setNotice('Weighting settings saved. Profile and crosstab results will use weights when enabled.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={24} />
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <Scale size={20} className="mt-0.5 text-[var(--et-teal)]" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">Survey weighting</h3>
          <p className="mt-1 text-xs text-slate-500">
            Apply a numeric weight variable to distributions, means, and crosstab counts across Profile, Crosstabs, and Charts.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-[var(--et-teal)]"
          />
          <span className="font-medium text-slate-700">Enable weighting for this survey</span>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-600">Weight variable</span>
          <select
            value={config.variable_id ?? ''}
            disabled={!config.enabled}
            onChange={(e) =>
              setConfig((c) => ({ ...c, variable_id: e.target.value || null }))
            }
            className="et-select w-full max-w-md text-sm"
          >
            <option value="">Select numeric variable…</option>
            {numericVars.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} — {(v.text || v.code).slice(0, 48)}
              </option>
            ))}
          </select>
        </label>

        {config.enabled && !config.variable_id && (
          <p className="text-xs text-amber-700">Choose a weight variable to apply weighting.</p>
        )}
        {notice && <p className="text-xs text-emerald-700">{notice}</p>}
        {error && <p className="text-xs text-rose-700">{error}</p>}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save weighting
        </button>
      </div>
    </section>
  )
}
