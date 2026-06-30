import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [setupConfig, setSetupConfig] = useState<VariableSetupConfig>({ variables: {} })
  const [setupLoading, setSetupLoading] = useState(true)
  const [kindOverride, setKindOverride] = useState('')
  const [valueWeights, setValueWeights] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [setupNotice, setSetupNotice] = useState<string | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement | null>(null)

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
      setExpandedId(focusQuestionId)
      onFocusQuestionConsumed?.()
    }
  }, [focusQuestionId, onFocusQuestionConsumed])

  const expanded = expandedId ? varMap.get(expandedId) ?? null : null

  useEffect(() => {
    if (!expanded) {
      setKindOverride('')
      setValueWeights({})
      return
    }
    const entry = setupConfig.variables[expanded.id]
    setKindOverride(entry?.kind_override ?? '')
    const weights: Record<string, string> = {}
    const saved = entry?.value_weights ?? expanded.value_weights ?? {}
    for (const opt of optionsForWeights(expanded)) {
      const w = saved[opt.code]
      weights[opt.code] = w != null ? String(w) : ''
    }
    setValueWeights(weights)
    setSetupNotice(null)
    setSetupError(null)
  }, [expanded, setupConfig])

  useEffect(() => {
    if (!expandedId || !detailRef.current) return
    const t = window.setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [expandedId])

  const effectiveKind = kindOverride || expanded?.default_kind || expanded?.kind || ''

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
    if (!expanded) return []
    return customVariables.filter(
      (cv) =>
        cv.source_variable_id === expanded.id ||
        (cv.source_variable_ids ?? []).includes(expanded.id),
    )
  }, [customVariables, expanded])

  const weightOptions = expanded ? optionsForWeights(expanded) : []
  const showWeights = weightOptions.length > 0 && supportsValueWeights(effectiveKind)

  const hasSetupDraft = useMemo(() => {
    if (!expanded) return false
    const entry = setupConfig.variables[expanded.id]
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
  }, [expanded, setupConfig, kindOverride, valueWeights, weightOptions])

  function toggleQuestion(id: string) {
    setExpandedId((current) => (current === id ? null : id))
  }

  async function handleFillDefaultWeights() {
    if (!expanded) return
    try {
      const { value_weights } = await api.getVariableSetupDefaults(surveyId, expanded.id)
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
    if (!expanded) return
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
      const saved = await api.setVariableSetup(surveyId, expanded.id, {
        kind_override: kindOverride || null,
        value_weights: weights,
      })
      setSetupConfig((prev) => ({
        variables: { ...prev.variables, [expanded.id]: saved },
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
    if (!expanded) return
    setSaving(true)
    setSetupError(null)
    setSetupNotice(null)
    try {
      await api.clearVariableSetup(surveyId, expanded.id)
      setSetupConfig((prev) => {
        const next = { ...prev.variables }
        delete next[expanded.id]
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

  const visibleCount = filteredGroups.reduce((n, g) => n + g.variable_ids.length, 0)

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Question & variable setup</h3>
            <p className="mt-1 text-xs text-slate-500">
              Click a question to expand analysis type, weights, and derived variables below it.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
            {visibleCount} question{visibleCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="relative mt-3">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by question text or code…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
          />
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {filteredGroups.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No questions match your search.</p>
        ) : (
          filteredGroups.map((g) => (
            <div key={g.id}>
              <p className="bg-slate-50/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:px-5">
                {g.title}
              </p>
              <ul>
                {g.variable_ids.map((id) => {
                  const v = varMap.get(id)
                  if (!v) return null
                  const isOpen = expandedId === id
                  const hasSetup = Boolean(setupConfig.variables[id])
                  const derivedCount = customVariables.filter(
                    (cv) =>
                      cv.source_variable_id === id || (cv.source_variable_ids ?? []).includes(id),
                  ).length

                  return (
                    <li key={id} className="border-t border-slate-100 first:border-t-0">
                      <button
                        type="button"
                        onClick={() => toggleQuestion(id)}
                        aria-expanded={isOpen}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition sm:px-5 ${
                          isOpen
                            ? 'bg-[var(--et-teal-light)]/35'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <ChevronDown
                          size={18}
                          className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${
                            isOpen ? 'rotate-180 text-[var(--et-teal-dark)]' : ''
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug text-slate-900">
                            {v.text || v.code}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                            <span className="font-mono">{v.code}</span>
                            <span className="text-slate-300">·</span>
                            <span>{v.type_label}</span>
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
                      </button>

                      {isOpen && (
                        <div
                          ref={expandedId === id ? detailRef : undefined}
                          className="border-t border-[var(--et-teal)]/15 bg-slate-50/50 px-4 pb-5 pt-4 sm:px-5"
                        >
                          {setupLoading ? (
                            <p className="flex items-center gap-2 text-sm text-slate-500">
                              <Loader2 size={16} className="animate-spin" />
                              Loading setup…
                            </p>
                          ) : (
                            <div className="space-y-4">
                              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
                                <Layers size={18} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
                                <div className="min-w-0 text-xs text-slate-600">
                                  <p>
                                    <span className="font-medium text-slate-700">LimeSurvey:</span>{' '}
                                    {v.ls_type} · {v.type_label}
                                  </p>
                                  <p className="mt-1">
                                    <span className="font-medium text-slate-700">Metrics:</span>{' '}
                                    {v.metrics.length ? v.metrics.join(', ') : '—'}
                                  </p>
                                </div>
                              </div>

                              <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <p className="text-xs font-semibold text-slate-800">Analysis type</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Override how ET Scout treats this question in profiles, crosstabs, and
                                  charts. Does not change LimeSurvey.
                                </p>
                                <label className="mt-3 block max-w-md text-sm">
                                  <span className="mb-1 block text-xs font-medium text-slate-600">
                                    Question type
                                  </span>
                                  <select
                                    value={kindOverride}
                                    onChange={(e) => setKindOverride(e.target.value)}
                                    className="et-select w-full"
                                  >
                                    {KIND_OPTIONS.map((opt) => (
                                      <option key={opt.value || 'auto'} value={opt.value}>
                                        {opt.label}
                                        {opt.value === '' ? ` (${v.kind})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <p className="mt-2 text-xs text-slate-500">
                                  Effective: <strong className="text-slate-700">{effectiveKind}</strong>
                                  {kindOverride &&
                                    v.default_kind &&
                                    kindOverride !== v.default_kind && (
                                      <span className="text-amber-700">
                                        {' '}
                                        · overridden from {v.default_kind}
                                      </span>
                                    )}
                                </p>

                                {showWeights && (
                                  <div className="mt-4 border-t border-slate-100 pt-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-xs font-semibold text-slate-800">
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
                                              <td className="px-3 py-2 font-mono text-xs text-slate-600">
                                                {opt.code}
                                              </td>
                                              <td className="px-3 py-2 text-xs text-slate-700">
                                                {opt.label}
                                              </td>
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

                                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveSetup()}
                                    disabled={saving || !hasSetupDraft}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                                  >
                                    {saving ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <Save size={14} />
                                    )}
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
                                  {hasSetupDraft && !setupNotice && (
                                    <span className="text-[10px] text-amber-700">Unsaved changes</span>
                                  )}
                                </div>
                                {setupNotice && (
                                  <p className="mt-2 text-xs text-emerald-700">{setupNotice}</p>
                                )}
                                {setupError && (
                                  <p className="mt-2 text-xs text-rose-700">{setupError}</p>
                                )}
                              </div>

                              <div className="rounded-xl border border-slate-200 bg-white p-4">
                                <p className="text-xs font-semibold text-slate-800">Derived variables</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Create recodes, net scores, or combined nets from this question.
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onCreateVariable('recode', v)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
                                  >
                                    <Plus size={14} />
                                    Recode
                                  </button>
                                  {eligibleForNet(v) && (
                                    <button
                                      type="button"
                                      onClick={() => onCreateVariable('net_score', v)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
                                    >
                                      <Minus size={14} />
                                      Net score
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => onCreateVariable('combine', v)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
                                  >
                                    <Sparkles size={14} />
                                    Combine
                                  </button>
                                </div>

                                {derivedVars.length > 0 ? (
                                  <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                                    {derivedVars.map((cv) => (
                                      <li
                                        key={cv.id}
                                        className="flex items-center justify-between gap-2 px-3 py-2.5"
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-slate-800">
                                            {cv.name}
                                          </p>
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
                                  <p className="mt-3 text-xs text-slate-500">
                                    No custom variables from this question yet.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </div>
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
