import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Layers, Play, Table2 } from 'lucide-react'
import {
  api,
  type BannerResult,
  type ProfileResult,
  type SurveySchema,
} from '../api/client'
import { QuestionPicker } from '../components/analysis/QuestionPicker'
import { BannerTable, ProfileResults } from '../components/analysis/Results'
import { ErrorState, LoadingState } from '../components/States'

type Tab = 'profile' | 'banner'

export function AnalysisPage() {
  const { id } = useParams()
  const surveyId = Number(id)

  const [schema, setSchema] = useState<SurveySchema | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('banner')
  const [completionStatus, setCompletionStatus] = useState('complete')

  const [profileVarId, setProfileVarId] = useState<string | null>(null)
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null)
  const [profileRunning, setProfileRunning] = useState(false)

  const [rowVarId, setRowVarId] = useState<string | null>(null)
  const [bannerVarIds, setBannerVarIds] = useState<string[]>([])
  const [bannerResult, setBannerResult] = useState<BannerResult | null>(null)
  const [bannerRunning, setBannerRunning] = useState(false)
  const [metric, setMetric] = useState('auto')
  const [showSignificance, setShowSignificance] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const data = await api.getSchema(surveyId, completionStatus)
        setSchema(data)
        const analyzable = data.variables.filter((v) => v.can_banner)
        if (analyzable[0]) {
          setProfileVarId(analyzable[0].id)
          setRowVarId(analyzable[0].id)
        }
        const filterable = data.variables.filter((v) => v.kind === 'single')
        if (filterable[0]) {
          setBannerVarIds([filterable[0].id])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load survey schema')
      } finally {
        setLoading(false)
      }
    }
    if (surveyId) load()
  }, [surveyId, completionStatus])

  const rowVariable = useMemo(
    () => schema?.variables.find((v) => v.id === rowVarId) ?? null,
    [schema, rowVarId],
  )

  const availableMetrics = useMemo(() => {
    if (!rowVariable) return ['auto']
    const m = new Set(['auto', ...rowVariable.metrics])
    return Array.from(m)
  }, [rowVariable])

  async function runProfile() {
    if (!profileVarId) return
    try {
      setProfileRunning(true)
      setError(null)
      setProfileResult(await api.runProfile(surveyId, profileVarId, completionStatus))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profile analysis failed')
    } finally {
      setProfileRunning(false)
    }
  }

  async function runBanner() {
    if (!rowVarId || bannerVarIds.length === 0) return
    try {
      setBannerRunning(true)
      setError(null)
      setBannerResult(
        await api.runBanner(surveyId, {
          row_variable_id: rowVarId,
          banner_variable_ids: bannerVarIds,
          completion_status: completionStatus,
          show_significance: showSignificance,
          metric,
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Banner analysis failed')
    } finally {
      setBannerRunning(false)
    }
  }

  if (loading) return <LoadingState message="Loading survey structure..." />
  if (error && !schema) return <ErrorState message={error} />

  const variables = schema?.variables ?? []
  const groups = schema?.groups ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link
            to={`/projects/${surveyId}`}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={16} />
            Back to project
          </Link>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Survey analysis</h2>
          <p className="mt-1 text-sm text-slate-500">
            Decipher-style tables: question-type aware profiles, banner crosstabs, and significance testing.
            {schema?.response_count !== undefined && (
              <span className="ml-1 font-medium text-slate-700">
                {schema.response_count} completed responses loaded.
              </span>
            )}
          </p>
        </div>
        <select
          value={completionStatus}
          onChange={(e) => setCompletionStatus(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
        >
          <option value="complete">Completed responses</option>
          <option value="qc_approved">QC Approved</option>
          <option value="all">All responses</option>
          <option value="incomplete">Incomplete only</option>
        </select>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <TabButton active={tab === 'banner'} onClick={() => setTab('banner')} icon={<Table2 size={16} />}>
          Banner / Crosstab
        </TabButton>
        <TabButton active={tab === 'profile'} onClick={() => setTab('profile')} icon={<Layers size={16} />}>
          Question profile
        </TabButton>
      </div>

      {error && (
        <ErrorState message={error} />
      )}

      {tab === 'banner' && (
        <div className="grid gap-6 xl:grid-cols-[280px_280px_1fr]">
          <QuestionPicker
            title="Row question (stub)"
            variables={variables}
            groups={groups}
            selectedId={rowVarId}
            onSelect={setRowVarId}
            filterKinds={['single', 'multi', 'array', 'numeric']}
          />
          <QuestionPicker
            title="Banner breaks"
            variables={variables}
            groups={groups}
            selectedId={null}
            onSelect={() => {}}
            multiSelect
            selectedIds={bannerVarIds}
            onMultiSelect={setBannerVarIds}
            filterKinds={['single', 'multi']}
          />
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Table settings</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="font-medium text-slate-600">Metric</span>
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  >
                    {availableMetrics.map((m) => (
                      <option key={m} value={m}>
                        {metricLabel(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 pt-5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={showSignificance}
                    onChange={(e) => setShowSignificance(e.target.checked)}
                    className="rounded"
                  />
                  Show significance vs Total
                </label>
              </div>
              {rowVariable && (
                <p className="mt-3 text-xs text-slate-500">
                  Row: <strong>{rowVariable.text}</strong> ({rowVariable.type_label})
                </p>
              )}
              <button
                type="button"
                onClick={runBanner}
                disabled={bannerRunning || !rowVarId || bannerVarIds.length === 0}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Play size={14} />
                {bannerRunning ? 'Building table...' : 'Run banner table'}
              </button>
            </div>
            {bannerResult && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <BannerTable result={bannerResult} />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <QuestionPicker
            title="Select question"
            variables={variables}
            groups={groups}
            selectedId={profileVarId}
            onSelect={setProfileVarId}
          />
          <div className="space-y-4">
            <button
              type="button"
              onClick={runProfile}
              disabled={profileRunning || !profileVarId}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Play size={14} />
              {profileRunning ? 'Analyzing...' : 'Run profile'}
            </button>
            {profileResult && (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <ProfileResults result={profileResult} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
        active
          ? 'border-emerald-600 text-emerald-700'
          : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function metricLabel(m: string) {
  const labels: Record<string, string> = {
    auto: 'Auto (by question type)',
    distribution: 'Distribution (counts & %)',
    checkbox_rate: '% selecting each option',
    mean: 'Mean score',
    top2box: 'Top 2 box %',
    bottom2box: 'Bottom 2 box %',
    rank_avg: 'Average rank',
  }
  return labels[m] || m
}
