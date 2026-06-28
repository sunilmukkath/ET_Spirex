import { useCallback, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart2,
  GitCompare,
  Loader2,
  Play,
  Sigma,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import {
  api,
  type AdvancedAnalysisResult,
  type FilterSpec,
  type SurveyVariable,
} from '../../api/client'
import { filterPayload, type FilterGroup } from '../../lib/filterTree'
import { canRunAnalysis } from '../../lib/multivariateHelpers'
import { ErrorState } from '../States'
import { FilterEditor } from './FilterEditor'
import {
  MultivariateVariablePicker,
  VariableSlotSelect,
} from './MultivariateVariablePicker'
import { MultivariateResults } from './MultivariateResults'

type AnalysisType =
  | 'correlation'
  | 'regression'
  | 'chi_square'
  | 'ttest'
  | 'anova'
  | 'describe'

const ANALYSIS_TYPES: {
  id: AnalysisType
  label: string
  description: string
  when: string
  icon: typeof Sigma
  color: string
}[] = [
  {
    id: 'correlation',
    label: 'Correlation',
    description: 'How strongly numeric variables move together',
    when: 'Explore relationships between scales & ratings',
    icon: GitCompare,
    color: 'from-teal-500/10 to-cyan-500/10 border-teal-200',
  },
  {
    id: 'regression',
    label: 'Regression',
    description: 'Predict an outcome from one or more drivers',
    when: 'Identify what drives satisfaction, NPS, spend, etc.',
    icon: TrendingUp,
    color: 'from-indigo-500/10 to-violet-500/10 border-indigo-200',
  },
  {
    id: 'chi_square',
    label: 'Chi-square',
    description: 'Test if two categorical variables are linked',
    when: 'Brand × region, gender × product choice',
    icon: Activity,
    color: 'from-amber-500/10 to-orange-500/10 border-amber-200',
  },
  {
    id: 'ttest',
    label: 'T-test',
    description: 'Compare averages between two groups',
    when: 'Male vs female, test vs control',
    icon: Sigma,
    color: 'from-rose-500/10 to-pink-500/10 border-rose-200',
  },
  {
    id: 'anova',
    label: 'ANOVA',
    description: 'Compare averages across multiple groups',
    when: 'Age bands, regions, segments (3+ groups)',
    icon: BarChart2,
    color: 'from-emerald-500/10 to-teal-500/10 border-emerald-200',
  },
  {
    id: 'describe',
    label: 'Descriptives',
    description: 'Mean, median, spread for numeric variables',
    when: 'Quick summary stats for scales & numeric fields',
    icon: Sparkles,
    color: 'from-slate-500/10 to-slate-400/10 border-slate-200',
  },
]

interface Props {
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  filters: FilterSpec[]
  filterTree: FilterGroup | null
  onFiltersChange: (filters: FilterSpec[]) => void
  onFilterTreeChange: (tree: FilterGroup | null) => void
}

export function AdvancedAnalysisPanel({
  surveyId,
  completionStatus,
  variables,
  filters,
  filterTree,
  onFiltersChange,
  onFilterTreeChange,
}: Props) {
  const [analysisType, setAnalysisType] = useState<AnalysisType>('correlation')
  const [variableIds, setVariableIds] = useState<string[]>([])
  const [dependentId, setDependentId] = useState('')
  const [independentIds, setIndependentIds] = useState<string[]>([])
  const [groupVariableId, setGroupVariableId] = useState('')
  const [numericVariableId, setNumericVariableId] = useState('')
  const [method, setMethod] = useState<'pearson' | 'spearman' | 'kendall'>('pearson')
  const [result, setResult] = useState<AdvancedAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numericVars = useMemo(
    () => variables.filter((v) => v.kind === 'numeric' || v.metrics.includes('mean')),
    [variables],
  )
  const categoricalVars = useMemo(
    () => variables.filter((v) => ['single', 'multi'].includes(v.kind) && v.can_filter),
    [variables],
  )

  const activeType = ANALYSIS_TYPES.find((t) => t.id === analysisType)!

  const readiness = canRunAnalysis(analysisType, {
    variableIds,
    dependentId,
    independentIds,
    groupVariableId,
    numericVariableId,
  })

  const runAnalysis = useCallback(async () => {
    if (!readiness.ok) return
    setLoading(true)
    setError(null)
    setResult(null)
    const payload = filterPayload(filters, filterTree)
    try {
      const data = await api.runAdvancedAnalysis(surveyId, {
        analysis_type: analysisType,
        completion_status: completionStatus,
        ...payload,
        variable_ids: variableIds,
        dependent_id: dependentId || undefined,
        independent_ids: independentIds,
        group_variable_id: groupVariableId || undefined,
        numeric_variable_id: numericVariableId || undefined,
        method,
      })
      if (data.error) setError(data.error)
      else setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }, [
    surveyId,
    completionStatus,
    filters,
    filterTree,
    analysisType,
    variableIds,
    dependentId,
    independentIds,
    groupVariableId,
    numericVariableId,
    method,
    readiness.ok,
  ])

  function switchType(id: AnalysisType) {
    setAnalysisType(id)
    setResult(null)
    setError(null)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--canvas)]">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
        <FilterEditor
          surveyId={surveyId}
          completionStatus={completionStatus}
          variables={variables}
          filters={filters}
          filterTree={filterTree}
          onChange={onFiltersChange}
          onFilterTreeChange={onFilterTreeChange}
          compact
          heading="Sample filters"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Sidebar — configuration */}
        <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white lg:w-[360px] lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Multivariate analysis</h2>
            <p className="mt-1 text-xs text-slate-500">
              Choose a statistical test, select variables, then run on your filtered sample.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              1 · Choose test
            </p>
            <div className="space-y-2">
              {ANALYSIS_TYPES.map((t) => {
                const Icon = t.icon
                const active = analysisType === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => switchType(t.id)}
                    className={`w-full rounded-xl border bg-gradient-to-br p-3 text-left transition ${
                      active
                        ? `${t.color} ring-2 ring-[var(--et-teal)]/40`
                        : 'border-slate-200 from-white to-slate-50/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`rounded-lg p-1.5 ${
                          active ? 'bg-white/80 text-[var(--et-teal-dark)]' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-slate-900">{t.label}</span>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{t.description}</p>
                        <p className="mt-1 text-[10px] italic text-slate-400">{t.when}</p>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            <p className="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              2 · Select variables
            </p>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              {(analysisType === 'correlation' || analysisType === 'describe') && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">
                    Numeric variables{' '}
                    <span className="text-slate-400">({numericVars.length} available)</span>
                  </p>
                  <MultivariateVariablePicker
                    variables={numericVars}
                    selectedIds={variableIds}
                    onChange={setVariableIds}
                    mode="multi"
                    max={analysisType === 'correlation' ? 12 : 20}
                    emptyMessage="No numeric variables in this survey"
                  />
                  {analysisType === 'correlation' && (
                    <label className="mt-2 block text-xs">
                      <span className="font-medium text-slate-600">Correlation method</span>
                      <select
                        value={method}
                        onChange={(e) =>
                          setMethod(e.target.value as 'pearson' | 'spearman' | 'kendall')
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="pearson">Pearson — linear relationships</option>
                        <option value="spearman">Spearman — monotonic / ranked</option>
                        <option value="kendall">Kendall — small samples / ties</option>
                      </select>
                    </label>
                  )}
                </div>
              )}

              {analysisType === 'regression' && (
                <div className="space-y-4">
                  <VariableSlotSelect
                    label="Outcome (Y)"
                    hint="What you want to predict or explain"
                    value={dependentId}
                    onChange={setDependentId}
                    variables={numericVars}
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Predictors (X)</p>
                    <p className="mb-2 text-[11px] text-slate-400">Variables that may drive the outcome</p>
                    <MultivariateVariablePicker
                      variables={numericVars.filter((v) => v.id !== dependentId)}
                      selectedIds={independentIds}
                      onChange={setIndependentIds}
                      mode="multi"
                      max={8}
                    />
                  </div>
                </div>
              )}

              {analysisType === 'chi_square' && (
                <div className="space-y-4">
                  <VariableSlotSelect
                    label="Row variable"
                    value={variableIds[0] ?? ''}
                    onChange={(id) => setVariableIds([id, variableIds[1] ?? ''].filter(Boolean))}
                    variables={categoricalVars}
                  />
                  <VariableSlotSelect
                    label="Column variable"
                    value={variableIds[1] ?? ''}
                    onChange={(id) =>
                      setVariableIds([variableIds[0] ?? '', id].filter(Boolean))
                    }
                    variables={categoricalVars.filter((v) => v.id !== variableIds[0])}
                  />
                </div>
              )}

              {(analysisType === 'ttest' || analysisType === 'anova') && (
                <div className="space-y-4">
                  <VariableSlotSelect
                    label="Numeric outcome"
                    hint="The scale or number to compare across groups"
                    value={numericVariableId}
                    onChange={setNumericVariableId}
                    variables={numericVars}
                  />
                  <VariableSlotSelect
                    label="Grouping variable"
                    hint={
                      analysisType === 'ttest'
                        ? 'Two largest groups will be compared'
                        : 'Up to 8 groups compared'
                    }
                    value={groupVariableId}
                    onChange={setGroupVariableId}
                    variables={categoricalVars}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              3 · Run
            </p>
            <p
              className={`mb-3 text-xs ${readiness.ok ? 'text-[var(--et-teal-dark)]' : 'text-slate-500'}`}
            >
              {readiness.hint}
            </p>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={loading || !readiness.ok}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--et-teal)] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
              {loading ? 'Running…' : `Run ${activeType.label}`}
            </button>
          </div>
        </aside>

        {/* Main — results */}
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader2 className="animate-spin text-[var(--et-teal)]" size={40} />
              <p className="mt-4 text-sm font-medium text-slate-700">Computing {activeType.label}…</p>
              <p className="mt-1 text-xs text-slate-400">Applying filters and running statistics</p>
            </div>
          )}

          {!loading && error && (
            <div className="mx-auto max-w-lg">
              <ErrorState message={error} />
            </div>
          )}

          {!loading && !error && result && (
            <div className="mx-auto max-w-4xl">
              <MultivariateResults result={result} />
            </div>
          )}

          {!loading && !error && !result && (
            <EmptyState activeType={activeType} readiness={readiness} />
          )}
        </main>
      </div>
    </div>
  )
}

function EmptyState({
  activeType,
  readiness,
}: {
  activeType: (typeof ANALYSIS_TYPES)[0]
  readiness: { ok: boolean; hint: string }
}) {
  const Icon = activeType.icon
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="rounded-2xl bg-gradient-to-br from-[var(--et-teal-light)] to-white p-5 ring-1 ring-[var(--et-teal)]/20">
        <Icon size={36} className="text-[var(--et-teal-dark)]" />
      </div>
      <h3 className="mt-6 text-lg font-semibold text-slate-900">{activeType.label} analysis</h3>
      <p className="mt-2 text-sm text-slate-500">{activeType.description}</p>
      <p className="mt-1 text-xs italic text-slate-400">Example: {activeType.when}</p>

      <div className="mt-8 w-full rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-left">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Getting started
        </p>
        <ol className="mt-2 space-y-2 text-sm text-slate-600">
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold">
              1
            </span>
            Optional: filter your sample above
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold">
              2
            </span>
            Select variables in the left panel
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--et-teal-light)] text-[10px] font-bold text-[var(--et-teal-dark)]">
              3
            </span>
            <span className="flex items-center gap-1">
              Click Run {activeType.label}
              <ArrowRight size={14} className="text-[var(--et-teal)]" />
            </span>
          </li>
        </ol>
      </div>

      {!readiness.ok && (
        <p className="mt-4 text-xs text-amber-700">{readiness.hint}</p>
      )}
    </div>
  )
}
