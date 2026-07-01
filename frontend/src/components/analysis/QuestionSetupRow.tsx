import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  Layers,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react'
import {
  api,
  type CustomVariable,
  type CustomVariableType,
  type SurveyVariable,
  type VariableSetupEntry,
} from '../../api/client'

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Auto (from LimeSurvey)' },
  { value: 'single', label: 'Categorical' },
  { value: 'numeric', label: 'Scale / numeric' },
  { value: 'multi', label: 'Multi-select' },
  { value: 'array', label: 'Grid / array' },
  { value: 'rank', label: 'Ranking' },
  { value: 'text', label: 'Text only' },
]

function eligibleForNet(v: SurveyVariable): boolean {
  if (v.custom) return false
  return v.kind === 'numeric' || (v.kind === 'single' && (v.answer_options?.length ?? 0) > 0)
}

function optionsForWeights(v: SurveyVariable): { code: string; label: string }[] {
  if (v.answer_options?.length) {
    return v.answer_options.map((o) => ({ code: o.code, label: o.label || o.code }))
  }
  return []
}

function supportsValueWeights(kind: string): boolean {
  return ['single', 'numeric', 'array'].includes(kind)
}

interface Props {
  variable: SurveyVariable
  isOpen: boolean
  onToggle: () => void
  setupEntry?: VariableSetupEntry
  setupLoading: boolean
  surveyId: number
  customVariables: CustomVariable[]
  derivedCount: number
  onCreateVariable: (type: CustomVariableType, source: SurveyVariable) => void
  onEditVariable: (variable: CustomVariable) => void
  onSaved: (variableId: string, entry: VariableSetupEntry | null) => void
  /** When true, render only the setup form (no list row toggle). */
  embedded?: boolean
}

export function QuestionSetupRow({
  variable,
  isOpen,
  onToggle,
  setupEntry,
  setupLoading,
  surveyId,
  customVariables,
  derivedCount,
  onCreateVariable,
  onEditVariable,
  onSaved,
  embedded = false,
}: Props) {
  const [kindOverride, setKindOverride] = useState('')
  const [valueWeights, setValueWeights] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasSetup = Boolean(setupEntry)

  useEffect(() => {
    if (!isOpen) return
    setKindOverride(setupEntry?.kind_override ?? '')
    const weights: Record<string, string> = {}
    const saved = setupEntry?.value_weights ?? variable.value_weights ?? {}
    for (const opt of optionsForWeights(variable)) {
      const w = saved[opt.code]
      weights[opt.code] = w != null ? String(w) : ''
    }
    setValueWeights(weights)
    setNotice(null)
    setError(null)
  }, [isOpen, variable, setupEntry])

  const effectiveKind = kindOverride || variable.default_kind || variable.kind || ''
  const weightOptions = optionsForWeights(variable)
  const showWeights = weightOptions.length > 0 && supportsValueWeights(effectiveKind)

  const derivedVars = useMemo(
    () =>
      customVariables.filter(
        (cv) =>
          cv.source_variable_id === variable.id ||
          (cv.source_variable_ids ?? []).includes(variable.id),
      ),
    [customVariables, variable.id],
  )

  const hasDraft = useMemo(() => {
    const savedKind = setupEntry?.kind_override ?? ''
    if (kindOverride !== savedKind) return true
    const savedWeights = setupEntry?.value_weights ?? {}
    for (const opt of weightOptions) {
      const draft = valueWeights[opt.code]?.trim()
      const saved = savedWeights[opt.code]
      const draftNum = draft === '' ? undefined : Number(draft)
      if (draftNum !== saved && !(draftNum == null && saved == null)) return true
    }
    return false
  }, [setupEntry, kindOverride, valueWeights, weightOptions])

  async function handleFillDefaultWeights() {
    try {
      const { value_weights } = await api.getVariableSetupDefaults(surveyId, variable.id)
      const next: Record<string, string> = { ...valueWeights }
      for (const opt of weightOptions) {
        const w = value_weights[opt.code]
        if (w != null) next[opt.code] = String(w)
      }
      setValueWeights(next)
    } catch {
      setError('Could not load default weights')
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const weights: Record<string, number> = {}
      for (const [code, raw] of Object.entries(valueWeights)) {
        const trimmed = raw.trim()
        if (!trimmed) continue
        const num = Number(trimmed)
        if (!Number.isFinite(num)) {
          setError(`Invalid weight for code ${code}`)
          setSaving(false)
          return
        }
        weights[code] = num
      }
      const saved = await api.setVariableSetup(surveyId, variable.id, {
        kind_override: kindOverride || null,
        value_weights: weights,
      })
      onSaved(variable.id, saved)
      setNotice('Saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await api.clearVariableSetup(surveyId, variable.id)
      onSaved(variable.id, null)
      setKindOverride('')
      setValueWeights(Object.fromEntries(weightOptions.map((o) => [o.code, ''])))
      setNotice('Reset to LimeSurvey defaults.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setSaving(false)
    }
  }

  const setupBody = (isOpen || embedded) && (
        <div
          className={
            embedded
              ? ''
              : 'border-t border-[var(--et-teal)]/20 bg-white px-4 pb-5 pt-4 sm:px-5 sm:pl-12'
          }
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {setupLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              Loading setup…
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-xs text-slate-600">
                <Layers size={16} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
                <div>
                  <p>
                    <span className="font-medium text-slate-700">LimeSurvey:</span> {variable.ls_type} ·{' '}
                    {variable.type_label}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium text-slate-700">Metrics:</span>{' '}
                    {variable.metrics.length ? variable.metrics.join(', ') : '—'}
                  </p>
                </div>
              </div>

              <section className="rounded-lg border border-slate-200 p-4">
                <h4 className="text-xs font-semibold text-slate-800">Analysis type</h4>
                <p className="mt-1 text-xs text-slate-500">
                  How this question is treated in profiles, crosstabs, and charts.
                </p>
                <label className="mt-3 block max-w-md text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Question type</span>
                  <select
                    value={kindOverride}
                    onChange={(e) => setKindOverride(e.target.value)}
                    className="et-select w-full"
                  >
                    {KIND_OPTIONS.map((opt) => (
                      <option key={opt.value || 'auto'} value={opt.value}>
                        {opt.label}
                        {opt.value === '' ? ` (${variable.kind})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-xs text-slate-500">
                  Effective: <strong className="text-slate-700">{effectiveKind}</strong>
                </p>

                {showWeights && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800">Answer weights</p>
                      <button
                        type="button"
                        onClick={() => void handleFillDefaultWeights()}
                        className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                      >
                        Fill from codes
                      </button>
                    </div>
                    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100">
                      <table className="w-full min-w-[280px] text-sm">
                        <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Code</th>
                            <th className="px-3 py-2 font-semibold">Label</th>
                            <th className="w-24 px-3 py-2 font-semibold">Weight</th>
                          </tr>
                        </thead>
                        <tbody>
                          {weightOptions.map((opt) => (
                            <tr key={opt.code} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-mono text-xs text-slate-600">{opt.code}</td>
                              <td className="px-3 py-2 text-xs text-slate-700">{opt.label}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  step="any"
                                  value={valueWeights[opt.code] ?? ''}
                                  onChange={(e) =>
                                    setValueWeights((prev) => ({ ...prev, [opt.code]: e.target.value }))
                                  }
                                  className="et-input w-full py-1.5 text-xs tabular-nums"
                                  placeholder="—"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || !hasDraft}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReset()}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                    Reset
                  </button>
                  {hasDraft && !notice && (
                    <span className="text-[10px] text-amber-700">Unsaved changes</span>
                  )}
                </div>
                {notice && <p className="mt-2 text-xs text-emerald-700">{notice}</p>}
                {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h4 className="text-xs font-semibold text-slate-800">Derived variables</h4>
                <p className="mt-1 text-xs text-slate-500">Recode, net score, or combine from this question.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onCreateVariable('recode', variable)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
                  >
                    <Plus size={14} />
                    Recode
                  </button>
                  {eligibleForNet(variable) && (
                    <button
                      type="button"
                      onClick={() => onCreateVariable('net_score', variable)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal)]/10"
                    >
                      <Minus size={14} />
                      Net score
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onCreateVariable('combine', variable)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
                  >
                    <Sparkles size={14} />
                    Combine
                  </button>
                </div>
                {derivedVars.length > 0 ? (
                  <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                    {derivedVars.map((cv) => (
                      <li key={cv.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{cv.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {cv.code} · {cv.variable_type.replace('_', ' ')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onEditVariable(cv)}
                          className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-[var(--et-teal-dark)] hover:bg-slate-50"
                        >
                          Edit
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">No derived variables yet.</p>
                )}
              </section>
            </div>
          )}
        </div>
  )

  if (embedded) {
    return <div className="question-setup-embedded">{setupBody}</div>
  }

  return (
    <li
      className={`border-t border-slate-100 first:border-t-0 ${
        isOpen ? 'bg-[var(--et-teal-light)]/20 ring-1 ring-inset ring-[var(--et-teal)]/25' : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition sm:px-5 ${
          isOpen ? 'bg-[var(--et-teal-light)]/30' : 'hover:bg-slate-50'
        }`}
      >
        <ChevronRight
          size={18}
          className={`mt-0.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-90 text-[var(--et-teal-dark)]' : ''
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-slate-900">{variable.text || variable.code}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
            <span className="font-mono">{variable.code}</span>
            <span className="text-slate-300">·</span>
            <span>{variable.type_label}</span>
            {hasSetup && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold uppercase text-amber-800">
                customized
              </span>
            )}
            {derivedCount > 0 && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                {derivedCount} derived
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {isOpen ? 'Close' : 'Setup'}
        </span>
      </button>
      {setupBody}
    </li>
  )
}
