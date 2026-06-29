import { useEffect, useMemo, useState } from 'react'
import {
  Layers,
  Minus,
  Plus,
  Scale,
  Search,
  Sparkles,
} from 'lucide-react'
import {
  type CustomVariable,
  type CustomVariableType,
  type SurveyVariable,
  type WeightConfig,
} from '../../api/client'

function eligibleForWeight(v: SurveyVariable): boolean {
  return !v.custom && v.kind === 'numeric'
}

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

interface Props {
  variables: SurveyVariable[]
  groups: { id: number; title: string; order: number; variable_ids: string[] }[]
  customVariables: CustomVariable[]
  weightConfig: WeightConfig
  onWeightConfigChange: (config: WeightConfig) => Promise<void>
  focusQuestionId?: string | null
  onFocusQuestionConsumed?: () => void
  onCreateVariable: (type: CustomVariableType, source: SurveyVariable) => void
  onEditVariable: (variable: CustomVariable) => void
}

export function QuestionSetupPanel({
  variables,
  groups,
  customVariables,
  weightConfig,
  onWeightConfigChange,
  focusQuestionId,
  onFocusQuestionConsumed,
  onCreateVariable,
  onEditVariable,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savingWeight, setSavingWeight] = useState(false)

  const surveyVars = useMemo(
    () => variables.filter((v) => !v.custom && v.group_id !== -1),
    [variables],
  )

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])

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

  const selected = selectedId ? varMap.get(selectedId) ?? null : null

  const derivedVars = useMemo(() => {
    if (!selected) return []
    return customVariables.filter(
      (cv) =>
        cv.source_variable_id === selected.id ||
        (cv.source_variable_ids ?? []).includes(selected.id),
    )
  }, [customVariables, selected])

  async function setAsWeight(enabled: boolean) {
    if (!selected) return
    setSavingWeight(true)
    try {
      await onWeightConfigChange({
        enabled,
        variable_id: enabled ? selected.id : null,
      })
    } finally {
      setSavingWeight(false)
    }
  }

  const isWeightVar =
    selected && weightConfig.enabled && weightConfig.variable_id === selected.id

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Scale size={18} className="text-[var(--et-teal)]" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-900">Survey response weight</h3>
            <p className="text-xs text-slate-500">
              Pick a numeric question whose values weight each respondent in tables and charts.
            </p>
          </div>
          <select
            value={weightConfig.enabled && weightConfig.variable_id ? weightConfig.variable_id : ''}
            disabled={savingWeight}
            onChange={async (e) => {
              const variable_id = e.target.value || null
              setSavingWeight(true)
              try {
                await onWeightConfigChange({
                  enabled: Boolean(variable_id),
                  variable_id,
                })
              } finally {
                setSavingWeight(false)
              }
            }}
            className="max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
          >
            <option value="">No weighting</option>
            {variables
              .filter(eligibleForWeight)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {(v.text || v.code).slice(0, 40)}
                </option>
              ))}
          </select>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Questions</p>
            <div className="relative mt-2">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions…"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
              />
            </div>
          </div>
          <div className="max-h-[min(52vh,520px)] overflow-y-auto p-2">
            {filteredGroups.map((g) => (
              <div key={g.id} className="mb-2">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {g.title}
                </p>
                <ul className="space-y-0.5">
                  {g.variable_ids.map((id) => {
                    const v = varMap.get(id)
                    if (!v) return null
                    const active = id === selectedId
                    const isWt = weightConfig.variable_id === id && weightConfig.enabled
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(id)}
                          className={`w-full rounded-lg px-2 py-2 text-left text-xs transition ${
                            active
                              ? 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="line-clamp-2 font-medium">{v.text || v.code}</span>
                          <span className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-slate-500">
                            <span>{v.type_label}</span>
                            {isWt && (
                              <span className="rounded bg-amber-100 px-1 text-amber-800">weight</span>
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
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selected ? (
            <p className="text-sm text-slate-500">Select a question to configure analysis.</p>
          ) : (
            <div className="space-y-5">
              <div>
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
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Analysis
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Uses <strong>{selected.kind}</strong> analysis (
                  {selected.can_banner ? 'can banner' : 'profile only'}
                  {selected.can_filter ? ', filterable' : ''}).
                </p>
              </div>

              {eligibleForWeight(selected) && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Response weight
                  </p>
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(isWeightVar)}
                      disabled={savingWeight}
                      onChange={(e) => setAsWeight(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[var(--et-teal)]"
                    />
                    Use this question to weight all respondents
                  </label>
                </div>
              )}

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
                  <p className="mt-2 text-xs text-slate-500">
                    No custom variables from this question yet.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
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
