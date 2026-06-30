import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Layers,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
} from 'lucide-react'
import {
  api,
  type CustomVariable,
  type CustomVariableType,
  type SurveyVariable,
  type VariableSetupConfig,
} from '../../api/client'
import { CollapsibleSection } from '../CollapsibleSection'

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

function defaultNetCodes(v: SurveyVariable): { top: string[]; bottom: string[] } {
  const opts = v.answer_options ?? []
  if (opts.length >= 2) {
    const codes = opts.map((o) => o.code)
    return { top: codes.slice(-2), bottom: codes.slice(0, 2) }
  }
  return { top: ['4', '5'], bottom: ['1', '2'] }
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
  surveyId: number
  variables: SurveyVariable[]
  groups: { id: number; title: string; order: number; variable_ids: string[] }[]
  customVariables: CustomVariable[]
  focusQuestionId?: string | null
  onFocusQuestionConsumed?: () => void
  onCreateVariable: (type: CustomVariableType, source: SurveyVariable) => void
  onEditVariable: (variable: CustomVariable) => void
  onChanged?: () => void
}

export function QuestionSetupPanel({
  surveyId,
  variables,
  groups,
  customVariables,
  focusQuestionId,
  onFocusQuestionConsumed,
  onCreateVariable,
  onEditVariable,
  onChanged,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [browseOpen, setBrowseOpen] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [setupConfig, setSetupConfig] = useState<VariableSetupConfig>({ variables: {} })
  const [setupLoading, setSetupLoading] = useState(true)
  const [kindOverride, setKindOverride] = useState('')
  const [valueWeights, setValueWeights] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [setupNotice, setSetupNotice] = useState<string | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)

  const surveyVars = useMemo(
    () => variables.filter((v) => !v.custom && v.group_id !== -1),
    [variables],
  )

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])

  const loadSetup = useCallback(async () => {
    setSetupLoading(true)
    try {
      const config = await api.getVariableSetup(surveyId)
      setSetupConfig(config)
    } catch {
      setSetupConfig({ variables: {} })
    } finally {
      setSetupLoading(false)
    }
  }, [surveyId])

  useEffect(() => {
    void loadSetup()
  }, [loadSetup])

  useEffect(() => {
    if (focusQuestionId) {
      setSelectedId(focusQuestionId)
      onFocusQuestionConsumed?.()
    }
  }, [focusQuestionId, onFocusQuestionConsumed])

  useEffect(() => {
    if (!selectedId && surveyVars.length > 0) {
      setSelectedId(surveyVars[0].id)
    }
  }, [selectedId, surveyVars])

  const selected = selectedId ? varMap.get(selectedId) ?? null : null

  useEffect(() => {
    if (!selected) {
      setKindOverride('')
      setValueWeights({})
      return
    }
    const entry = setupConfig.variables[selected.id]
    setKindOverride(entry?.kind_override ?? '')
    const weights: Record<string, string> = {}
    const saved = entry?.value_weights ?? selected.value_weights ?? {}
    for (const opt of optionsForWeights(selected)) {
      const w = saved[opt.code]
      weights[opt.code] = w != null ? String(w) : ''
    }
    setValueWeights(weights)
    setSetupNotice(null)
    setSetupError(null)
  }, [selected, setupConfig])

  const effectiveKind = kindOverride || selected?.default_kind || selected?.kind || ''

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups
      .map((g) => ({
        ...g,
        variable_ids: g.variable_ids.filter((id) => {
          const v = varMap.get(id)
          if (!v || v.custom) return false
          if (!q) return true
          return (
            `${v.text ?? ''}`.toLowerCase().includes(q) ||
            `${v.code ?? ''}`.toLowerCase().includes(q)
          )
        }),
      }))
      .filter((g) => g.variable_ids.length > 0)
  }, [groups, varMap, search])

  const derivedVars = useMemo(() => {
    if (!selected) return []
    return customVariables.filter(
      (cv) =>
        cv.source_variable_id === selected.id ||
        (cv.source_variable_ids ?? []).includes(selected.id),
    )
  }, [customVariables, selected])

  const weightOptions = selected ? optionsForWeights(selected) : []
  const showWeights = weightOptions.length > 0 && supportsValueWeights(effectiveKind)

  const hasSetupDraft = useMemo(() => {
    if (!selected) return false
    const entry = setupConfig.variables[selected.id]
    const savedKind = entry?.kind_override ?? ''
    if (kindOverride !== savedKind) return true
    const savedWeights = entry?.value_weights ?? {}
    for (const opt of weightOptions) {
      const draft = valueWeights[opt.code]?.trim()
      const saved = savedWeights[opt.code]
      const draftNum = draft === '' ? undefined : Number(draft)
      if (draftNum !== saved && !(draftNum == null && saved == null)) return true
    }
    return false
  }, [selected, setupConfig, kindOverride, valueWeights, weightOptions])

  async function handleFillDefaultWeights() {
    if (!selected) return
    try {
      const { value_weights } = await api.getVariableSetupDefaults(surveyId, selected.id)
      const next: Record<string, string> = { ...valueWeights }
      for (const opt of weightOptions) {
        const w = value_weights[opt.code]
        if (w != null) next[opt.code] = String(w)
      }
      setValueWeights(next)
    } catch {
      setSetupError('Could not load default weights')
    }
  }

  async function handleSaveSetup() {
    if (!selected) return
    setSaving(true)
    setSetupError(null)
    setSetupNotice(null)
    try {
      const weights: Record<string, number> = {}
      for (const [code, raw] of Object.entries(valueWeights)) {
        const trimmed = raw.trim()
        if (!trimmed) continue
        const num = Number(trimmed)
        if (!Number.isFinite(num)) {
          setSetupError(`Invalid weight for code ${code}`)
          setSaving(false)
          return
        }
        weights[code] = num
      }
      const saved = await api.setVariableSetup(surveyId, selected.id, {
        kind_override: kindOverride || null,
        value_weights: weights,
      })
      setSetupConfig((prev) => ({
        variables: { ...prev.variables, [selected.id]: saved },
      }))
      setSetupNotice('Question setup saved.')
      onChanged?.()
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Failed to save setup')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetSetup() {
    if (!selected) return
    setSaving(true)
    setSetupError(null)
    setSetupNotice(null)
    try {
      await api.clearVariableSetup(surveyId, selected.id)
      setSetupConfig((prev) => {
        const next = { ...prev.variables }
        delete next[selected.id]
        return { variables: next }
      })
      setKindOverride('')
      setValueWeights(Object.fromEntries(weightOptions.map((o) => [o.code, ''])))
      setSetupNotice('Reset to LimeSurvey defaults.')
      onChanged?.()
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Failed to reset setup')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CollapsibleSection
        title="Browse questions"
        summary={
          selected
            ? `${selected.code} — ${(selected.text || selected.code).slice(0, 48)}`
            : `${surveyVars.length} questions`
        }
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        className="border-b border-slate-200"
      >
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
          />
        </div>
        <div className="mt-3 space-y-2">
          {filteredGroups.map((g) => (
            <div key={g.id}>
              <p className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {g.title}
              </p>
              <ul className="space-y-0.5">
                {g.variable_ids.map((id) => {
                  const v = varMap.get(id)
                  if (!v) return null
                  const active = id === selectedId
                  const hasSetup = Boolean(setupConfig.variables[id])
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(id)
                          setDetailsOpen(true)
                        }}
                        className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition ${
                          active
                            ? 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="line-clamp-2 font-medium">{v.text || v.code}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                          {v.type_label}
                          {hasSetup && (
                            <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-800">
                              customized
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Question details"
        summary={
          selected
            ? `${selected.type_label} · ${derivedVars.length} derived variable${derivedVars.length === 1 ? '' : 's'}`
            : 'Select a question'
        }
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        className="border-b-0"
      >
        {!selected ? (
          <p className="text-sm text-slate-500">Select a question above to configure analysis.</p>
        ) : setupLoading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Loading setup…
          </p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-2">
              <Layers size={18} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{selected.text || selected.code}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {selected.code} · LimeSurvey {selected.ls_type} · {selected.type_label}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  <span className="font-medium">Metrics:</span>{' '}
                  {selected.metrics.length ? selected.metrics.join(', ') : '—'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Analysis type
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Override how ET Scout analyzes this question (means, banners, charts). Does not change
                LimeSurvey.
              </p>
              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Question type</span>
                <select
                  value={kindOverride}
                  onChange={(e) => setKindOverride(e.target.value)}
                  className="et-select w-full max-w-md"
                >
                  {KIND_OPTIONS.map((opt) => (
                    <option key={opt.value || 'auto'} value={opt.value}>
                      {opt.label}
                      {opt.value === '' ? ` (${selected.kind})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-xs text-slate-500">
                Effective analysis: <strong>{effectiveKind}</strong>
                {kindOverride && selected.default_kind && kindOverride !== selected.default_kind && (
                  <span className="text-amber-700"> · overridden from {selected.default_kind}</span>
                )}
              </p>

              {showWeights && (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Answer weights
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleFillDefaultWeights()}
                      className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                    >
                      Fill from codes
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Assign numeric weights for means, top/bottom box, and scale charts.
                  </p>
                  <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
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
                                  setValueWeights((prev) => ({
                                    ...prev,
                                    [opt.code]: e.target.value,
                                  }))
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

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveSetup()}
                  disabled={saving || !hasSetupDraft}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save setup
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetSetup()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
              </div>
              {setupNotice && <p className="mt-2 text-xs text-emerald-700">{setupNotice}</p>}
              {setupError && <p className="mt-2 text-xs text-rose-700">{setupError}</p>}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Derived variables
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onCreateVariable('recode', selected)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
                >
                  <Plus size={14} />
                  Recode
                </button>
                {eligibleForNet(selected) && (
                  <button
                    type="button"
                    onClick={() => onCreateVariable('net_score', selected)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
                  >
                    <Minus size={14} />
                    Net score
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onCreateVariable('combine', selected)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
                >
                  <Sparkles size={14} />
                  Combine / net questions
                </button>
              </div>

              {derivedVars.length > 0 ? (
                <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {derivedVars.map((cv) => (
                    <li key={cv.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{cv.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {cv.code} · {cv.variable_type.replace('_', ' ')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onEditVariable(cv)}
                        className="shrink-0 text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                      >
                        Edit
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No custom variables from this question yet.</p>
              )}
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}

export function buildVariableFormFromSource(
  type: CustomVariableType,
  source: SurveyVariable,
): Partial<import('../../api/client').CustomVariableInput> {
  const base = {
    variable_type: type,
    name: '',
    code: '',
  }
  if (type === 'recode') {
    return {
      ...base,
      source_variable_id: source.id,
      name: `Recode: ${(source.text || source.code).slice(0, 40)}`,
      code: `${source.code}_RC`.slice(0, 24),
      categories: [{ label: 'Category 1', source_values: [] }],
    }
  }
  if (type === 'net_score') {
    const { top, bottom } = defaultNetCodes(source)
    return {
      ...base,
      source_variable_id: source.id,
      name: `Net: ${(source.text || source.code).slice(0, 36)}`,
      code: `${source.code}_NET`.slice(0, 24),
      top_codes: top,
      bottom_codes: bottom,
    }
  }
  return {
    ...base,
    source_variable_ids: [source.id],
    name: `Combined: ${(source.text || source.code).slice(0, 36)}`,
    code: `${source.code}_COMB`.slice(0, 24),
    tracked_codes: [],
  }
}
