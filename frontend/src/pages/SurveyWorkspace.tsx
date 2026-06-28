import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Download,
  Info,
  Layers,
  Loader2,
  ShieldCheck,
  Table2,
} from 'lucide-react'
import {
  api,
  type BannerResult,
  type DataQualityResult,
  type FilterSpec,
  type ProfileResult,
  type ProjectDetail,
  type SurveySchema,
  type SurveyVariable,
} from '../api/client'
import { BannerPicker } from '../components/analysis/BannerPicker'
import { FilterEditor } from '../components/analysis/FilterEditor'
import { QualityPanel } from '../components/analysis/QualityPanel'
import { QuestionNavigator } from '../components/analysis/QuestionNavigator'
import { CrosstabsResults, ProfileResults } from '../components/analysis/Results'
import { StatusBadge } from '../components/StatusBadge'
import { ErrorState } from '../components/States'

type Mode = 'explore' | 'crosstabs' | 'quality'

function parseMode(raw: string | null): Mode {
  if (raw === 'crosstabs' || raw === 'compare') return 'crosstabs'
  if (raw === 'quality') return 'quality'
  return 'explore'
}

export function SurveyWorkspace() {
  const { id } = useParams()
  const location = useLocation()
  const navTitle = (location.state as { title?: string } | null)?.title
  const surveyId = Number(id)
  const [searchParams, setSearchParams] = useSearchParams()

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [schema, setSchema] = useState<SurveySchema | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(true)
  const [enriching, setEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mode = parseMode(searchParams.get('mode'))
  const completionStatus = searchParams.get('responses') || 'complete'

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bannerIds, setBannerIds] = useState<string[]>([])
  const [sideRowIds, setSideRowIds] = useState<string[]>([])
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null)
  const [bannerResult, setBannerResult] = useState<BannerResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [metric, setMetric] = useState('auto')
  const [showCounts, setShowCounts] = useState(true)
  const [showColPct, setShowColPct] = useState(true)
  const [showRowPct, setShowRowPct] = useState(false)
  const [confidenceLevel, setConfidenceLevel] = useState(0.95)
  const [sigEnabled, setSigEnabled] = useState(true)
  const [filters, setFilters] = useState<FilterSpec[]>([])
  const [qualityResult, setQualityResult] = useState<DataQualityResult | null>(null)
  const [qualityLoading, setQualityLoading] = useState(false)
  const [qualityError, setQualityError] = useState<string | null>(null)

  const profileAbort = useRef<AbortController | null>(null)
  const initialized = useRef(false)

  const setMode = (m: Mode) => {
    setSearchParams((prev) => {
      prev.set('mode', m)
      return prev
    }, { replace: true })
  }

  function buildBannerRequest() {
    if (!selectedId) return null
    const rowIds = [selectedId, ...sideRowIds.filter((id) => id !== selectedId)]
    return {
      row_variable_id: selectedId,
      row_variable_ids: rowIds,
      banner_variable_ids: bannerIds,
      completion_status: completionStatus,
      show_counts: showCounts,
      show_col_pct: showColPct,
      show_row_pct: showRowPct,
      show_significance: sigEnabled,
      confidence_level: confidenceLevel,
      metric,
      filters,
    }
  }

  const setCompletionStatus = (v: string) => {
    setSearchParams((prev) => {
      prev.set('responses', v)
      return prev
    }, { replace: true })
  }

  // Load project (fast) then schema (slow)
  useEffect(() => {
    if (!surveyId) return
    api.getProject(surveyId).then(setProject).catch(() => {})
  }, [surveyId])

  useEffect(() => {
    if (!surveyId) return
    let cancelled = false
    initialized.current = false
    setSchemaLoading(true)
    setEnriching(false)
    setError(null)
    setSchema(null)
    setProfileResult(null)
    setBannerResult(null)

    function pickDefaults(data: SurveySchema) {
      const first = data.variables.find((v) => v.can_banner) || data.variables[0]
      if (first && !initialized.current) {
        initialized.current = true
        setSelectedId(first.id)
      }
      const banner = data.variables.find((v) => v.kind === 'single' && v.id !== first?.id)
      if (banner) setBannerIds([banner.id])
    }

    // Phase 1: fast question list (~1s) — sidebar usable immediately
    api.getSchema(surveyId, completionStatus, true)
      .then((data) => {
        if (cancelled) return
        setSchema(data)
        pickDefaults(data)
        setSchemaLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load survey')
          setSchemaLoading(false)
        }
      })

    // Phase 2: full enrichment in background (~10–15s) — answer options, banners
    setEnriching(true)
    api.getSchema(surveyId, completionStatus, false)
      .then((data) => {
        if (cancelled) return
        setSchema(data)
        setEnriching(false)
      })
      .catch(() => {
        if (!cancelled) setEnriching(false)
      })

    return () => { cancelled = true }
  }, [surveyId, completionStatus])

  const selectedVar = useMemo(
    () => schema?.variables.find((v) => v.id === selectedId) ?? null,
    [schema, selectedId],
  )

  const bannerVars = useMemo(
    () => schema?.variables.filter((v) => bannerIds.includes(v.id)) ?? [],
    [schema, bannerIds],
  )

  const availableMetrics = useMemo(() => {
    if (!selectedVar) return ['auto']
    return ['auto', ...selectedVar.metrics]
  }, [selectedVar])

  // Auto-run profile when question selected in explore mode
  const runProfile = useCallback(async (varId: string, activeFilters: FilterSpec[]) => {
    profileAbort.current?.abort()
    const ctrl = new AbortController()
    profileAbort.current = ctrl
    setAnalyzing(true)
    setProfileResult(null)
    try {
      const result = await api.runProfile(surveyId, varId, completionStatus, activeFilters)
      if (!ctrl.signal.aborted) setProfileResult(result)
    } catch (err) {
      if (!ctrl.signal.aborted) {
        setProfileResult({ error: err instanceof Error ? err.message : 'Analysis failed' })
      }
    } finally {
      if (!ctrl.signal.aborted) setAnalyzing(false)
    }
  }, [surveyId, completionStatus])

  useEffect(() => {
    if (mode !== 'explore' || !selectedId || schemaLoading || enriching) return
    const t = setTimeout(() => runProfile(selectedId, filters), 300)
    return () => clearTimeout(t)
  }, [mode, selectedId, schemaLoading, enriching, filters, runProfile])

  useEffect(() => {
    if (mode !== 'quality' || schemaLoading) return
    let cancelled = false
    setQualityLoading(true)
    setQualityError(null)
    api
      .getDataQuality(surveyId, completionStatus)
      .then((data) => {
        if (!cancelled) setQualityResult(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setQualityError(err instanceof Error ? err.message : 'Quality scan failed')
          setQualityResult(null)
        }
      })
      .finally(() => {
        if (!cancelled) setQualityLoading(false)
      })
    return () => { cancelled = true }
  }, [mode, surveyId, completionStatus, schemaLoading])

  async function runBanner() {
    const request = buildBannerRequest()
    if (!request || bannerIds.length === 0) return
    setAnalyzing(true)
    setBannerResult(null)
    try {
      setBannerResult(await api.runBanner(surveyId, request))
    } catch (err) {
      setBannerResult({ error: err instanceof Error ? err.message : 'Crosstab failed' })
    } finally {
      setAnalyzing(false)
    }
  }

  async function exportBanner() {
    const request = buildBannerRequest()
    if (!request || !bannerResult) return
    setExporting(true)
    try {
      await api.exportBanner(surveyId, request)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  function addBanner(id: string) {
    setBannerIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  function toggleSideRow(id: string) {
    setSideRowIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function handleSelectQuestion(id: string) {
    setSelectedId(id)
    if (mode === 'crosstabs') {
      setBannerResult(null)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--canvas)]">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-4 border-b border-[var(--et-teal)]/15 bg-white px-4 py-2 shadow-sm">
        <Link
          to="/dashboard"
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 hover:bg-[var(--et-teal-light)] hover:text-[var(--et-teal-dark)]"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Surveys</span>
        </Link>
        <div className="hidden h-5 w-px bg-slate-200 sm:block" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {project?.title || navTitle || 'Loading survey...'}
            </h1>
            {project && <StatusBadge status={project.status} />}
          </div>
          <p className="text-xs text-slate-500">
            ID {surveyId}
            {schema && ` · ${schema.response_count} responses`}
            {project && project.responses.total > 0 && ` · ${project.responses.completed} completed`}
          </p>
        </div>

        {/* Mode switcher */}
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          <ModeButton active={mode === 'explore'} onClick={() => setMode('explore')} icon={<Layers size={15} />}>
            Explore
          </ModeButton>
          <ModeButton active={mode === 'crosstabs'} onClick={() => setMode('crosstabs')} icon={<Table2 size={15} />}>
            Crosstabs
          </ModeButton>
          <ModeButton active={mode === 'quality'} onClick={() => setMode('quality')} icon={<ShieldCheck size={15} />}>
            Quality
          </ModeButton>
        </div>

        <select
          value={completionStatus}
          onChange={(e) => setCompletionStatus(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
        >
          <option value="complete">Completed</option>
          <option value="all">All responses</option>
          <option value="incomplete">Incomplete</option>
        </select>
      </header>

      <div className="flex min-h-0 flex-1">
          {mode !== 'quality' && (
            <QuestionNavigator
              variables={schema?.variables ?? []}
              groups={schema?.groups ?? []}
              selectedId={selectedId}
              onSelect={handleSelectQuestion}
              loading={schemaLoading}
              compareMode={mode === 'crosstabs'}
              compareIds={bannerIds}
              onCompareToggle={addBanner}
              onCompareRemove={(id) => setBannerIds((p) => p.filter((x) => x !== id))}
              sideRowIds={sideRowIds}
              onSideRowToggle={toggleSideRow}
            />
          )}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {error && !schema && (
            <div className="p-6">
              <ErrorState message={error} />
            </div>
          )}

          {enriching && schema && (
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              <Loader2 className="animate-spin" size={14} />
              Loading answer options for {schema.question_count ?? schema.variables.length} questions…
            </div>
          )}

          {mode === 'explore' && (
            <ExplorePanel
              selectedVar={selectedVar}
              variables={schema?.variables ?? []}
              filters={filters}
              onFiltersChange={setFilters}
              analyzing={analyzing}
              profileResult={profileResult}
              schemaLoading={schemaLoading}
              enriching={enriching}
            />
          )}

          {mode === 'quality' && (
            <QualityPanel
              result={qualityResult}
              loading={qualityLoading}
              error={qualityError}
            />
          )}

          {mode === 'crosstabs' && (
            <CrosstabsPanel
              selectedVar={selectedVar}
              variables={schema?.variables ?? []}
              sideRowVars={schema?.variables.filter((v) => sideRowIds.includes(v.id)) ?? []}
              bannerVars={bannerVars}
              bannerIds={bannerIds}
              onAddBanner={addBanner}
              filters={filters}
              onFiltersChange={setFilters}
              onRemoveBanner={(id) => setBannerIds((p) => p.filter((x) => x !== id))}
              onRemoveSideRow={(id) => setSideRowIds((p) => p.filter((x) => x !== id))}
              metric={metric}
              onMetricChange={setMetric}
              availableMetrics={availableMetrics}
              showCounts={showCounts}
              onShowCountsChange={setShowCounts}
              showColPct={showColPct}
              onShowColPctChange={setShowColPct}
              showRowPct={showRowPct}
              onShowRowPctChange={setShowRowPct}
              sigEnabled={sigEnabled}
              onSigEnabledChange={setSigEnabled}
              confidenceLevel={confidenceLevel}
              onConfidenceLevelChange={setConfidenceLevel}
              analyzing={analyzing}
              exporting={exporting}
              onRun={runBanner}
              onExport={exportBanner}
              bannerResult={bannerResult}
              schemaLoading={schemaLoading}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function ModeButton({
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
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function ExplorePanel({
  selectedVar,
  variables,
  filters,
  onFiltersChange,
  analyzing,
  profileResult,
  schemaLoading,
  enriching,
}: {
  selectedVar: SurveyVariable | null
  variables: SurveyVariable[]
  filters: FilterSpec[]
  onFiltersChange: (filters: FilterSpec[]) => void
  analyzing: boolean
  profileResult: ProfileResult | null
  schemaLoading: boolean
  enriching: boolean
}) {
  if (schemaLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-[var(--et-teal)]" size={32} />
          <p className="mt-4 text-sm text-slate-500">Loading question list...</p>
        </div>
      </div>
    )
  }

  if (!selectedVar) {
    return (
      <EmptyCanvas
        icon={<BarChart3 size={40} />}
        title="Select a question"
        description="Choose any question from the sidebar to see its distribution, chart, and summary stats."
      />
    )
  }

  if (enriching && !profileResult && !analyzing) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="font-medium text-slate-800">{selectedVar.text}</p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="animate-spin text-[var(--et-teal)]" size={18} />
            Preparing analysis...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
        <FilterEditor variables={variables} filters={filters} onChange={onFiltersChange} compact />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl animate-fade-in">
          {analyzing && (
            <div className="mb-4 flex items-center gap-2 text-sm text-[var(--et-teal-dark)]">
              <Loader2 className="animate-spin" size={16} />
              Analyzing...
            </div>
          )}
          {profileResult ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <ProfileResults result={profileResult} />
            </div>
          ) : !analyzing ? (
            <EmptyCanvas
              icon={<Info size={32} />}
              title="No data"
              description="This question has no response data yet, or the survey table is empty."
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CrosstabsPanel({
  selectedVar,
  variables,
  sideRowVars,
  bannerVars,
  bannerIds,
  onAddBanner,
  onRemoveBanner,
  onRemoveSideRow,
  filters,
  onFiltersChange,
  metric,
  onMetricChange,
  availableMetrics,
  showCounts,
  onShowCountsChange,
  showColPct,
  onShowColPctChange,
  showRowPct,
  onShowRowPctChange,
  sigEnabled,
  onSigEnabledChange,
  confidenceLevel,
  onConfidenceLevelChange,
  analyzing,
  exporting,
  onRun,
  onExport,
  bannerResult,
  schemaLoading,
}: {
  selectedVar: SurveyVariable | null
  variables: SurveyVariable[]
  sideRowVars: SurveyVariable[]
  bannerVars: SurveyVariable[]
  bannerIds: string[]
  onAddBanner: (id: string) => void
  onRemoveBanner: (id: string) => void
  onRemoveSideRow: (id: string) => void
  filters: FilterSpec[]
  onFiltersChange: (filters: FilterSpec[]) => void
  metric: string
  onMetricChange: (m: string) => void
  availableMetrics: string[]
  showCounts: boolean
  onShowCountsChange: (v: boolean) => void
  showColPct: boolean
  onShowColPctChange: (v: boolean) => void
  showRowPct: boolean
  onShowRowPctChange: (v: boolean) => void
  sigEnabled: boolean
  onSigEnabledChange: (v: boolean) => void
  confidenceLevel: number
  onConfidenceLevelChange: (v: number) => void
  analyzing: boolean
  exporting: boolean
  onRun: () => void
  onExport: () => void
  bannerResult: BannerResult | null
  schemaLoading: boolean
}) {
  const canRun = selectedVar && bannerVars.length > 0 && !schemaLoading

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Side (row)</p>
            <p className="mt-1 truncate text-sm font-medium text-slate-900">
              {selectedVar?.text || 'Click a question in the sidebar'}
            </p>
            {sideRowVars.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sideRowVars.map((v) => (
                  <span
                    key={v.id}
                    className="inline-flex max-w-[180px] items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800 ring-1 ring-indigo-200"
                  >
                    <span className="truncate">{v.text || v.code}</span>
                    <button type="button" onClick={() => onRemoveSideRow(v.id)} className="hover:text-indigo-600">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Banners (columns)</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {bannerVars.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex max-w-[200px] items-center gap-1 rounded-full bg-[var(--et-teal-light)] px-2.5 py-1 text-xs font-medium text-[var(--et-teal-dark)] ring-1 ring-[var(--et-teal)]/25"
                >
                  <span className="truncate">{v.text || v.code}</span>
                  <button type="button" onClick={() => onRemoveBanner(v.id)} className="ml-0.5 rounded-full hover:bg-[var(--et-teal)]/15">×</button>
                </span>
              ))}
              <BannerPicker
                variables={variables}
                selectedIds={bannerIds}
                excludeIds={selectedVar ? [selectedVar.id, ...sideRowVars.map((v) => v.id)] : []}
                onAdd={onAddBanner}
                onRemove={onRemoveBanner}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs">
              <span className="font-medium text-slate-500">Metric</span>
              <select value={metric} onChange={(e) => onMetricChange(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                {availableMetrics.map((m) => (
                  <option key={m} value={m}>{metricLabel(m)}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="font-medium text-slate-500">Sig. level</span>
              <select
                value={sigEnabled ? String(confidenceLevel) : 'off'}
                onChange={(e) => {
                  if (e.target.value === 'off') {
                    onSigEnabledChange(false)
                  } else {
                    onSigEnabledChange(true)
                    onConfidenceLevelChange(Number(e.target.value))
                  }
                }}
                className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="off">Off</option>
                <option value="0.9">90%</option>
                <option value="0.95">95%</option>
                <option value="0.99">99%</option>
              </select>
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="font-medium text-slate-500">Show:</span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showCounts} onChange={(e) => onShowCountsChange(e.target.checked)} />
            Counts
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showColPct} onChange={(e) => onShowColPctChange(e.target.checked)} />
            Column %
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showRowPct} onChange={(e) => onShowRowPctChange(e.target.checked)} />
            Row %
          </label>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onRun}
              disabled={!canRun || analyzing}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
            >
              {analyzing ? <Loader2 className="animate-spin" size={16} /> : <Table2 size={16} />}
              Build crosstab
            </button>
            {bannerResult && !bannerResult.error && (
              <button
                type="button"
                onClick={onExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                Export Excel
              </button>
            )}
          </div>
        </div>

        <div className="mt-3">
          <FilterEditor variables={variables} filters={filters} onChange={onFiltersChange} compact />
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Click a question for the side (row). Use <strong>Add banner column</strong> or the <strong>+</strong> button in the sidebar · <strong>S</strong> = extra side row.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!bannerResult && !analyzing && (
          <EmptyCanvas
            icon={<Table2 size={40} />}
            title="Advanced crosstabs"
            description="Pick a side question and one or more banner breaks, choose table format options, then build the crosstab."
          />
        )}
        {analyzing && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
          </div>
        )}
        {bannerResult && !analyzing && (
          <div className="animate-fade-in rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <CrosstabsResults result={bannerResult} />
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyCanvas({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
      <div className="rounded-2xl bg-slate-100 p-5 text-slate-400">{icon}</div>
      <h3 className="mt-4 text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
    </div>
  )
}

function metricLabel(m: string) {
  const labels: Record<string, string> = {
    auto: 'Auto',
    distribution: 'Distribution %',
    checkbox_rate: '% Selected',
    mean: 'Mean',
    top2box: 'Top 2 box %',
    bottom2box: 'Bottom 2 box %',
  }
  return labels[m] || m
}
