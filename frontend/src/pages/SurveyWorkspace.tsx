import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Database,
  Download,
  Info,
  Layers,
  Loader2,
  ShieldCheck,
  Sigma,
  SlidersHorizontal,
  Table2,
} from 'lucide-react'
import {
  api,
  invalidateSchemaCache,
  type AnalysisBookmark,
  type BannerResult,
  type CustomVariable,
  type DataQualityResult,
  type FilterGroup,
  type FilterPreset,
  type FilterSpec,
  type ProfileResult,
  type ProjectDetail,
  type SurveySchema,
  type SurveyVariable,
  type WeightConfig,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { BannerPicker } from '../components/analysis/BannerPicker'
import { FilterEditor } from '../components/analysis/FilterEditor'
import { QuestionNavigator } from '../components/analysis/QuestionNavigator'
import { SurveyOverviewBar } from '../components/analysis/SurveyOverviewBar'
import { CrosstabsResults, ProfileResults } from '../components/analysis/Results'
import { AnalysisBookmarkMenu } from '../components/analysis/AnalysisBookmarkMenu'
import { VariablesPanel, customVariableToSurvey } from '../components/analysis/VariablesPanel'
import { StatusBadge } from '../components/StatusBadge'
import { ErrorState, TableSkeleton } from '../components/States'
import { filterPayload } from '../lib/filterTree'

const DataPanel = lazy(() =>
  import('../components/analysis/DataPanel').then((m) => ({ default: m.DataPanel })),
)
const QualityPanel = lazy(() =>
  import('../components/analysis/QualityPanel').then((m) => ({ default: m.QualityPanel })),
)
const ChartsPanel = lazy(() =>
  import('../components/analysis/ChartsPanel').then((m) => ({ default: m.ChartsPanel })),
)
const AdvancedAnalysisPanel = lazy(() =>
  import('../components/analysis/AdvancedAnalysisPanel').then((m) => ({
    default: m.AdvancedAnalysisPanel,
  })),
)

function PanelLoader() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
    </div>
  )
}

type Mode = 'explore' | 'charts' | 'crosstabs' | 'quality' | 'variables' | 'data' | 'multivariate'

function parseMode(raw: string | null): Mode {
  if (raw === 'crosstabs' || raw === 'compare') return 'crosstabs'
  if (raw === 'charts') return 'charts'
  if (raw === 'quality') return 'quality'
  if (raw === 'variables') return 'variables'
  if (raw === 'data') return 'data'
  if (raw === 'multivariate' || raw === 'advanced' || raw === 'statistics') return 'multivariate'
  if (raw === 'explore' || raw === 'questions') return 'explore'
  return 'explore'
}

function modeLabel(mode: Mode): string {
  if (mode === 'explore') return 'Questions'
  if (mode === 'crosstabs') return 'Compare'
  if (mode === 'multivariate') return 'Statistics'
  if (mode === 'charts') return 'Charts'
  if (mode === 'quality') return 'Quality'
  if (mode === 'variables') return 'Variables'
  return 'Data'
}

export function SurveyWorkspace() {
  const { user } = useAuth()
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
  const [filterTree, setFilterTree] = useState<FilterGroup | null>(null)
  const [tableFilters, setTableFilters] = useState<Record<string, FilterSpec[]>>({})
  const [refreshingTableId, setRefreshingTableId] = useState<string | null>(null)
  const [qualityResult, setQualityResult] = useState<DataQualityResult | null>(null)
  const [qualityLoading, setQualityLoading] = useState(false)
  const [qualityError, setQualityError] = useState<string | null>(null)
  const [customVariables, setCustomVariables] = useState<CustomVariable[]>([])
  const [weightConfig, setWeightConfig] = useState<WeightConfig>({ enabled: false, variable_id: null })
  const [exportingReport, setExportingReport] = useState(false)
  const [schemaVersion, setSchemaVersion] = useState(0)

  const mergedSchema = useMemo((): SurveySchema | null => {
    if (!schema) return null
    if (!customVariables.length) return schema
    const customVars = customVariables.map(customVariableToSurvey)
    const customGroup = {
      id: -1,
      title: 'Custom variables',
      order: 9999,
      variable_ids: customVars.map((v) => v.id),
    }
    const existingGroup = schema.groups.find((g) => g.id === -1)
    const groups = existingGroup
      ? schema.groups.map((g) =>
          g.id === -1
            ? { ...g, variable_ids: [...g.variable_ids, ...customGroup.variable_ids] }
            : g,
        )
      : [...schema.groups, customGroup]
    return {
      ...schema,
      variables: [...schema.variables, ...customVars],
      groups,
    }
  }, [schema, customVariables])

  const reloadCustomVariables = useCallback(async () => {
    try {
      const { variables } = await api.getCustomVariables(surveyId)
      setCustomVariables(variables)
    } catch {
      /* ignore */
    }
  }, [surveyId])

  const reloadSchema = useCallback(async () => {
    invalidateSchemaCache(surveyId)
    setSchemaVersion((v) => v + 1)
    try {
      const data = await api.getSchema(surveyId, completionStatus, false)
      setSchema(data)
    } catch {
      /* ignore */
    }
  }, [surveyId, completionStatus])

  const applyFilterPreset = useCallback((preset: FilterPreset) => {
    if (preset.filter_tree?.children?.length) {
      setFilterTree(preset.filter_tree)
      setFilters([])
    } else {
      setFilters(preset.filters ?? [])
      setFilterTree(null)
    }
  }, [])

  const compareCurrentQuestion = useCallback(() => {
    if (!selectedId) return
    setSideRowIds([selectedId])
    setSearchParams((prev) => {
      prev.set('mode', 'crosstabs')
      return prev
    }, { replace: true })
  }, [selectedId, setSearchParams])

  const loadCrosstabBookmark = useCallback((bm: AnalysisBookmark) => {
    const cfg = bm.config
    if (Array.isArray(cfg.side_row_ids)) setSideRowIds(cfg.side_row_ids as string[])
    if (Array.isArray(cfg.banner_ids)) setBannerIds(cfg.banner_ids as string[])
    if (typeof cfg.metric === 'string') setMetric(cfg.metric)
    if (typeof cfg.show_counts === 'boolean') setShowCounts(cfg.show_counts)
    if (typeof cfg.show_col_pct === 'boolean') setShowColPct(cfg.show_col_pct)
    if (typeof cfg.show_row_pct === 'boolean') setShowRowPct(cfg.show_row_pct)
    if (typeof cfg.sig_enabled === 'boolean') setSigEnabled(cfg.sig_enabled)
    if (typeof cfg.confidence_level === 'number') setConfidenceLevel(cfg.confidence_level)
    if (cfg.filter_tree) {
      setFilterTree(cfg.filter_tree as FilterGroup)
      setFilters([])
    } else if (Array.isArray(cfg.filters)) {
      setFilters(cfg.filters as FilterSpec[])
      setFilterTree(null)
    }
  }, [])

  useEffect(() => {
    if (!surveyId) return
    api.getWeightConfig(surveyId).then(setWeightConfig).catch(() => {})
  }, [surveyId, schemaVersion])

  const profileAbort = useRef<AbortController | null>(null)
  const initialized = useRef(false)
  const qualityCacheRef = useRef<Map<string, { at: number; data: DataQualityResult }>>(new Map())
  const QUALITY_CACHE_MS = 120_000

  const setMode = (m: Mode) => {
    setSearchParams((prev) => {
      prev.set('mode', m)
      return prev
    }, { replace: true })
  }

  function handleFiltersChange(next: FilterSpec[]) {
    setFilters(next)
    if (next.length) setFilterTree(null)
  }

  function handleFilterTreeChange(tree: FilterGroup | null) {
    setFilterTree(tree)
    if (tree) setFilters([])
  }

  function buildBannerRequest() {
    const rowIds = sideRowIds.length > 0 ? sideRowIds : selectedId ? [selectedId] : []
    if (rowIds.length === 0) return null
    const row_filters: Record<string, FilterSpec[]> = {}
    for (const id of rowIds) {
      row_filters[id] = tableFilters[id] ?? filters
    }
    return {
      row_variable_id: rowIds[0],
      row_variable_ids: rowIds,
      banner_variable_ids: bannerIds,
      completion_status: completionStatus,
      show_counts: showCounts,
      show_col_pct: showColPct,
      show_row_pct: showRowPct,
      show_significance: sigEnabled,
      confidence_level: confidenceLevel,
      metric,
      ...filterPayload(filters, filterTree),
      row_filters,
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
        setSideRowIds([first.id])
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
        api.warmupSurvey(surveyId, completionStatus).catch(() => {})
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
  }, [surveyId, completionStatus, schemaVersion])

  useEffect(() => {
    if (!surveyId) return
    reloadCustomVariables()
  }, [surveyId, reloadCustomVariables])

  const activeSchema = mergedSchema ?? schema

  const selectedVar = useMemo(
    () => activeSchema?.variables.find((v) => v.id === selectedId) ?? null,
    [activeSchema, selectedId],
  )

  const bannerIdSet = useMemo(() => new Set(bannerIds), [bannerIds])

  const bannerVars = useMemo(() => {
    if (!activeSchema) return []
    return activeSchema.variables.filter((v) => bannerIdSet.has(v.id))
  }, [activeSchema, bannerIdSet])

  const sideRowVars = useMemo(() => {
    if (!activeSchema) return []
    const map = new Map(activeSchema.variables.map((v) => [v.id, v]))
    return sideRowIds.map((id) => map.get(id)).filter((v): v is SurveyVariable => Boolean(v))
  }, [activeSchema, sideRowIds])

  const primaryRowVar = useMemo(
    () => sideRowVars[0] ?? selectedVar,
    [sideRowVars, selectedVar],
  )

  const availableMetrics = useMemo(() => {
    if (!primaryRowVar) return ['auto']
    return ['auto', ...primaryRowVar.metrics]
  }, [primaryRowVar])

  // Auto-run profile when question selected in explore mode
  const runProfile = useCallback(async (varId: string) => {
    profileAbort.current?.abort()
    const ctrl = new AbortController()
    profileAbort.current = ctrl
    setAnalyzing(true)
    setProfileResult(null)
    const payload = filterPayload(filters, filterTree)
    try {
      const result = await api.runProfile(
        surveyId,
        varId,
        completionStatus,
        payload.filters,
        ctrl.signal,
        payload.filter_tree,
      )
      if (!ctrl.signal.aborted) setProfileResult(result)
    } catch (err) {
      if (!ctrl.signal.aborted) {
        setProfileResult({ error: err instanceof Error ? err.message : 'Analysis failed' })
      }
    } finally {
      if (!ctrl.signal.aborted) setAnalyzing(false)
    }
  }, [surveyId, completionStatus, filters, filterTree])

  useEffect(() => {
    if (mode !== 'explore' || !selectedId || schemaLoading) return
    const t = setTimeout(() => runProfile(selectedId), 300)
    return () => clearTimeout(t)
  }, [mode, selectedId, schemaLoading, filters, filterTree, runProfile])

  useEffect(() => {
    if (mode !== 'quality' || !Number.isFinite(surveyId) || surveyId <= 0) return
    const cacheKey = `${surveyId}:${completionStatus}`
    const cached = qualityCacheRef.current.get(cacheKey)
    if (cached && Date.now() - cached.at < QUALITY_CACHE_MS) {
      setQualityResult(cached.data)
      setQualityLoading(false)
      setQualityError(null)
      return
    }

    let cancelled = false
    setQualityLoading(true)
    setQualityError(null)
    setQualityResult(null)
    api
      .getDataQuality(surveyId, completionStatus)
      .then((data) => {
        if (!cancelled) {
          qualityCacheRef.current.set(cacheKey, { at: Date.now(), data })
          setQualityResult(data)
        }
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
    return () => {
      cancelled = true
    }
  }, [mode, surveyId, completionStatus])

  const refreshQuality = useCallback(async () => {
    if (!Number.isFinite(surveyId) || surveyId <= 0) return
    const cacheKey = `${surveyId}:${completionStatus}`
    setQualityLoading(true)
    setQualityError(null)
    try {
      const data = await api.getDataQuality(surveyId, completionStatus, true)
      qualityCacheRef.current.set(cacheKey, { at: Date.now(), data })
      setQualityResult(data)
    } catch (err) {
      setQualityError(err instanceof Error ? err.message : 'Quality scan failed')
      setQualityResult(null)
    } finally {
      setQualityLoading(false)
    }
  }, [surveyId, completionStatus])

  async function runBanner() {
    const request = buildBannerRequest()
    if (!request || bannerIds.length === 0 || sideRowIds.length === 0) return
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

  async function refreshCrosstabTable(rowId: string, tableIndex: number) {
    const request = buildBannerRequest()
    if (!request) return
    const tableFilterList = tableFilters[rowId] ?? filters
    setRefreshingTableId(rowId)
    try {
      const result = await api.runBanner(surveyId, {
        ...request,
        row_variable_id: rowId,
        row_variable_ids: [rowId],
        filters: tableFilterList,
        row_filters: { [rowId]: tableFilterList },
      })
      const table =
        result.table_type === 'multi' && result.tables?.length ? result.tables[0] : result
      setBannerResult((prev) => {
        if (!prev?.tables) return prev
        const tables = [...prev.tables]
        tables[tableIndex] = table
        return { ...prev, tables }
      })
    } catch (err) {
      setBannerResult((prev) => {
        if (!prev?.tables) return prev
        const tables = [...prev.tables]
        tables[tableIndex] = {
          error: err instanceof Error ? err.message : 'Failed to update table',
        }
        return { ...prev, tables }
      })
    } finally {
      setRefreshingTableId(null)
    }
  }

  function updateTableFilters(rowId: string, next: FilterSpec[]) {
    setTableFilters((prev) => ({ ...prev, [rowId]: next }))
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

  function addSideRow(id: string) {
    setSideRowIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    if (!selectedId) setSelectedId(id)
    setBannerResult(null)
  }

  function addAllSideRows() {
    const ids = (activeSchema?.variables ?? [])
      .filter((v) => v.can_banner)
      .map((v) => v.id)
    setSideRowIds(ids)
    if (ids.length > 0) setSelectedId(ids[0])
    setBannerResult(null)
  }

  function addAllBanners() {
    const ids = (activeSchema?.variables ?? [])
      .filter((v) => v.can_banner)
      .map((v) => v.id)
    setBannerIds(ids)
    setBannerResult(null)
  }

  function copySideRowsToBanners() {
    setBannerIds((prev) => [...new Set([...prev, ...sideRowIds])])
    setBannerResult(null)
  }

  function toggleSideRow(id: string) {
    setSideRowIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      return [...prev, id]
    })
    setBannerResult(null)
  }

  function clearSideRows() {
    setSideRowIds([])
    setBannerResult(null)
  }

  function clearBanners() {
    setBannerIds([])
    setBannerResult(null)
  }

  function handleSelectQuestion(id: string) {
    setSelectedId(id)
    if (mode === 'crosstabs') {
      setSideRowIds((prev) => {
        const rest = prev.filter((x) => x !== id)
        return [id, ...rest]
      })
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

        {/* Mode switcher — Analyze | Setup */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            <ModeButton active={mode === 'explore'} onClick={() => setMode('explore')} icon={<Layers size={15} />}>
              {modeLabel('explore')}
            </ModeButton>
            <ModeButton active={mode === 'charts'} onClick={() => setMode('charts')} icon={<BarChart3 size={15} />}>
              Charts
            </ModeButton>
            <ModeButton active={mode === 'crosstabs'} onClick={() => setMode('crosstabs')} icon={<Table2 size={15} />}>
              {modeLabel('crosstabs')}
            </ModeButton>
            <ModeButton active={mode === 'multivariate'} onClick={() => setMode('multivariate')} icon={<Sigma size={15} />}>
              {modeLabel('multivariate')}
            </ModeButton>
          </div>
          <span className="hidden h-5 w-px bg-slate-300 sm:block" aria-hidden />
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            <ModeButton active={mode === 'variables'} onClick={() => setMode('variables')} icon={<SlidersHorizontal size={15} />}>
              Variables
            </ModeButton>
            <ModeButton active={mode === 'quality'} onClick={() => setMode('quality')} icon={<ShieldCheck size={15} />}>
              Quality
            </ModeButton>
            <ModeButton active={mode === 'data'} onClick={() => setMode('data')} icon={<Database size={15} />}>
              Data
            </ModeButton>
          </div>
        </div>

        <select
          value={weightConfig.enabled && weightConfig.variable_id ? weightConfig.variable_id : ''}
          onChange={async (e) => {
            const variable_id = e.target.value || null
            const next = { enabled: Boolean(variable_id), variable_id }
            setWeightConfig(next)
            await api.setWeightConfig(surveyId, next)
            invalidateSchemaCache(surveyId)
            setSchemaVersion((v) => v + 1)
          }}
          className="max-w-[9rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
          title="Response weighting"
        >
          <option value="">No weight</option>
          {(activeSchema?.variables ?? [])
            .filter((v) => v.kind === 'numeric' && !v.custom)
            .map((v) => (
              <option key={v.id} value={v.id}>
                W: {(v.code || v.text).slice(0, 18)}
              </option>
            ))}
        </select>

        <select
          value={completionStatus}
          onChange={(e) => setCompletionStatus(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
        >
          <option value="complete">Completed</option>
          <option value="qc_approved">QC Approved</option>
          <option value="all">All responses</option>
          <option value="incomplete">Incomplete</option>
        </select>
      </header>

      <div className="flex min-h-0 flex-1">
          {mode !== 'quality' && mode !== 'variables' && mode !== 'data' && mode !== 'charts' && mode !== 'multivariate' && (
            <QuestionNavigator
              variables={activeSchema?.variables ?? []}
              groups={activeSchema?.groups ?? []}
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

          {mode === 'charts' && (
            <Suspense fallback={<PanelLoader />}>
              <ChartsPanel
                surveyId={surveyId}
                completionStatus={completionStatus}
                variables={activeSchema?.variables ?? []}
                groups={activeSchema?.groups ?? []}
                selectedVar={selectedVar}
                selectedId={selectedId}
                onVariableChange={handleSelectQuestion}
                filters={filters}
                filterTree={filterTree}
                onFilterTreeChange={handleFilterTreeChange}
                onFiltersChange={handleFiltersChange}
                schemaLoading={schemaLoading}
                onPresetApply={applyFilterPreset}
              />
            </Suspense>
          )}

          {mode === 'explore' && (
            <ExplorePanel
              surveyId={surveyId}
              completionStatus={completionStatus}
              selectedVar={selectedVar}
              selectedId={selectedId}
              variables={activeSchema?.variables ?? []}
              groups={activeSchema?.groups ?? []}
              responseCount={activeSchema?.response_count ?? project?.responses.completed ?? 0}
              questionCount={activeSchema?.question_count ?? activeSchema?.variables.length ?? 0}
              customVarCount={customVariables.length}
              filters={filters}
              filterTree={filterTree}
              onFilterTreeChange={handleFilterTreeChange}
              onFiltersChange={handleFiltersChange}
              onPresetApply={applyFilterPreset}
              analyzing={analyzing}
              profileResult={profileResult}
              schemaLoading={schemaLoading}
              enriching={enriching}
              onCompareQuestion={compareCurrentQuestion}
              exportingReport={exportingReport}
              onExportReport={async (format) => {
                if (!selectedId) return
                setExportingReport(true)
                try {
                  const payload = filterPayload(filters, filterTree)
                  await api.exportReport(
                    surveyId,
                    {
                      format,
                      report_type: 'profile',
                      variable_id: selectedId,
                      completion_status: completionStatus,
                      filters: payload.filters,
                      filter_tree: payload.filter_tree,
                    },
                    `question_${selectedId}.${format === 'pdf' ? 'pdf' : 'pptx'}`,
                  )
                } finally {
                  setExportingReport(false)
                }
              }}
            />
          )}

          {mode === 'quality' && (
            <Suspense fallback={<PanelLoader />}>
              <QualityPanel
                result={qualityResult}
                loading={qualityLoading}
                error={qualityError}
                onRefresh={refreshQuality}
              />
            </Suspense>
          )}

          {mode === 'multivariate' && (
            <Suspense fallback={<PanelLoader />}>
              <AdvancedAnalysisPanel
                surveyId={surveyId}
                completionStatus={completionStatus}
                variables={activeSchema?.variables ?? []}
                filters={filters}
                filterTree={filterTree}
                onFiltersChange={handleFiltersChange}
                onFilterTreeChange={handleFilterTreeChange}
              />
            </Suspense>
          )}

          {mode === 'variables' && (
            <VariablesPanel
              surveyId={surveyId}
              schema={schema}
              completionStatus={completionStatus}
              username={user?.username ?? null}
              onChanged={reloadCustomVariables}
              onSchemaChanged={reloadSchema}
            />
          )}

          {mode === 'data' && (
            <Suspense fallback={<PanelLoader />}>
              <DataPanel
                surveyId={surveyId}
                completionStatus={completionStatus}
                username={user?.username ?? null}
                onVariablesChanged={reloadCustomVariables}
                onOpenVariables={() => setMode('variables')}
              />
            </Suspense>
          )}

          {mode === 'crosstabs' && (
            <CrosstabsPanel
              surveyId={surveyId}
              completionStatus={completionStatus}
              variables={activeSchema?.variables ?? []}
              sideRowVars={sideRowVars}
              sideRowIds={sideRowIds}
              bannerVars={bannerVars}
              bannerIds={bannerIds}
              onAddSideRow={addSideRow}
              onAddAllSideRows={addAllSideRows}
              onAddAllBanners={addAllBanners}
              onCopySideRowsToBanners={copySideRowsToBanners}
              onClearSideRows={clearSideRows}
              onClearBanners={clearBanners}
              onAddBanner={addBanner}
              filters={filters}
              filterTree={filterTree}
              onFilterTreeChange={handleFilterTreeChange}
              onFiltersChange={handleFiltersChange}
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
              tableFilters={tableFilters}
              onTableFiltersChange={updateTableFilters}
              onRefreshTable={refreshCrosstabTable}
              refreshingTableId={refreshingTableId}
              onPresetApply={applyFilterPreset}
              onLoadBookmark={loadCrosstabBookmark}
              buildBookmarkConfig={() => {
                const req = buildBannerRequest()
                return {
                  name: `Compare ${sideRowIds.length}×${bannerIds.length}`,
                  config: {
                    side_row_ids: sideRowIds,
                    banner_ids: bannerIds,
                    metric,
                    show_counts: showCounts,
                    show_col_pct: showColPct,
                    show_row_pct: showRowPct,
                    sig_enabled: sigEnabled,
                    confidence_level: confidenceLevel,
                    ...filterPayload(filters, filterTree),
                  },
                  banner_request: req,
                }
              }}
              onExportReport={async (format) => {
                const req = buildBannerRequest()
                if (!req) return
                setExportingReport(true)
                try {
                  await api.exportReport(
                    surveyId,
                    {
                      format,
                      report_type: 'banner',
                      completion_status: completionStatus,
                      banner_request: req,
                    },
                    `crosstab.${format === 'pdf' ? 'pdf' : 'pptx'}`,
                  )
                } finally {
                  setExportingReport(false)
                }
              }}
              exportingReport={exportingReport}
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
  surveyId,
  completionStatus,
  selectedVar,
  selectedId,
  variables,
  groups,
  responseCount,
  questionCount,
  customVarCount,
  filters,
  filterTree,
  onFiltersChange,
  onFilterTreeChange,
  onPresetApply,
  analyzing,
  profileResult,
  schemaLoading,
  enriching,
  onCompareQuestion,
  onExportReport,
  exportingReport,
}: {
  surveyId: number
  completionStatus: string
  selectedVar: SurveyVariable | null
  selectedId: string | null
  variables: SurveyVariable[]
  groups: { id: number; title: string; order: number; variable_ids: string[] }[]
  responseCount: number
  questionCount: number
  customVarCount: number
  filters: FilterSpec[]
  filterTree: FilterGroup | null
  onFiltersChange: (filters: FilterSpec[]) => void
  onFilterTreeChange: (tree: FilterGroup | null) => void
  onPresetApply: (preset: FilterPreset) => void
  analyzing: boolean
  profileResult: ProfileResult | null
  schemaLoading: boolean
  enriching: boolean
  onCompareQuestion: () => void
  onExportReport: (format: 'pdf' | 'pptx') => void
  exportingReport: boolean
}) {
  const overview = (
    <SurveyOverviewBar
      responseCount={responseCount}
      questionCount={questionCount}
      groupCount={groups.length}
      variables={variables}
      completionStatus={completionStatus}
      customVarCount={customVarCount}
    />
  )

  if (schemaLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-slate-200 bg-[var(--canvas)] px-6 py-4">
          {overview}
        </div>
        <div className="flex flex-1 flex-col gap-4 p-8">
          <TableSkeleton rows={4} />
          <TableSkeleton rows={8} />
        </div>
      </div>
    )
  }

  if (!selectedVar) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-slate-200 bg-[var(--canvas)] px-6 py-4">
          {overview}
        </div>
        <EmptyCanvas
          icon={<BarChart3 size={40} />}
          title="Select a question"
          description="Choose any question from the sidebar to see its distribution, chart, and summary stats."
        />
      </div>
    )
  }

  if (enriching && !profileResult && !analyzing) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-slate-200 bg-[var(--canvas)] px-6 py-4">
          {overview}
        </div>
        <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
          <FilterEditor
            surveyId={surveyId}
            completionStatus={completionStatus}
            variables={variables}
            filters={filters}
            filterTree={filterTree}
            onChange={onFiltersChange}
            onFilterTreeChange={onFilterTreeChange}
            showPresets
            onPresetApply={onPresetApply}
            compact
          />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          <div className="max-w-md text-center">
            <p className="font-medium text-slate-800">{selectedVar.text}</p>
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="animate-spin text-[var(--et-teal)]" size={18} />
              Preparing analysis…
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 bg-[var(--canvas)] px-6 py-4">
        {overview}
      </div>
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
        <FilterEditor
          surveyId={surveyId}
          completionStatus={completionStatus}
          variables={variables}
          filters={filters}
          filterTree={filterTree}
          onChange={onFiltersChange}
          onFilterTreeChange={onFilterTreeChange}
          showPresets
          onPresetApply={onPresetApply}
          compact
        />
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
              <ProfileResults
                result={profileResult}
                onCompareQuestion={selectedId ? onCompareQuestion : undefined}
                onExportReport={selectedId ? onExportReport : undefined}
                exportingReport={exportingReport}
              />
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
  surveyId,
  completionStatus,
  variables,
  sideRowVars,
  sideRowIds,
  bannerVars,
  bannerIds,
  onAddSideRow,
  onAddAllSideRows,
  onAddAllBanners,
  onCopySideRowsToBanners,
  onClearSideRows,
  onClearBanners,
  onAddBanner,
  onRemoveBanner,
  onRemoveSideRow,
  filters,
  filterTree,
  onFiltersChange,
  onFilterTreeChange,
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
  tableFilters,
  onTableFiltersChange,
  onRefreshTable,
  refreshingTableId,
  onPresetApply,
  onLoadBookmark,
  buildBookmarkConfig,
  onExportReport,
  exportingReport,
}: {
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  sideRowVars: SurveyVariable[]
  sideRowIds: string[]
  bannerVars: SurveyVariable[]
  bannerIds: string[]
  onAddSideRow: (id: string) => void
  onAddAllSideRows: () => void
  onAddAllBanners: () => void
  onCopySideRowsToBanners: () => void
  onClearSideRows: () => void
  onClearBanners: () => void
  onAddBanner: (id: string) => void
  onRemoveBanner: (id: string) => void
  onRemoveSideRow: (id: string) => void
  filters: FilterSpec[]
  filterTree: FilterGroup | null
  onFiltersChange: (filters: FilterSpec[]) => void
  onFilterTreeChange: (tree: FilterGroup | null) => void
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
  tableFilters: Record<string, FilterSpec[]>
  onTableFiltersChange: (rowId: string, filters: FilterSpec[]) => void
  onRefreshTable: (rowId: string, tableIndex: number) => void
  refreshingTableId: string | null
  onPresetApply: (preset: FilterPreset) => void
  onLoadBookmark: (bm: AnalysisBookmark) => void
  buildBookmarkConfig: () => { name: string; config: Record<string, unknown> }
  onExportReport: (format: 'pdf' | 'pptx') => void
  exportingReport: boolean
}) {
  const canRun = sideRowVars.length > 0 && bannerVars.length > 0 && !schemaLoading

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="max-h-[45vh] shrink-0 overflow-y-auto border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Side (rows)</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <SelectionChips
                vars={sideRowVars}
                onRemove={onRemoveSideRow}
                onClearAll={onClearSideRows}
                chipClassName="inline-flex max-w-[200px] items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 ring-1 ring-indigo-200"
              />
              <BannerPicker
                variables={variables}
                selectedIds={sideRowIds}
                onAdd={onAddSideRow}
                onRemove={onRemoveSideRow}
                onAddAll={onAddAllSideRows}
                label="Add side row"
                pickerTitle="Side rows"
                emptyMessage="No side row questions available"
                variant="side"
                showAddAll
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Banners (columns)</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <SelectionChips
                vars={bannerVars}
                onRemove={onRemoveBanner}
                onClearAll={onClearBanners}
                chipClassName="inline-flex max-w-[200px] items-center gap-1 rounded-full bg-[var(--et-teal-light)] px-2.5 py-1 text-xs font-medium text-[var(--et-teal-dark)] ring-1 ring-[var(--et-teal)]/25"
              />
              <BannerPicker
                variables={variables}
                selectedIds={bannerIds}
                onAdd={onAddBanner}
                onRemove={onRemoveBanner}
                onAddAll={onAddAllBanners}
                onAddSideRowsAsBanners={onCopySideRowsToBanners}
                sideRowCount={sideRowIds.length}
                label="Add banner column"
                pickerTitle="Banner columns"
                emptyMessage="No banner questions available"
                variant="banner"
                showAddAll
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
              <>
                <button
                  type="button"
                  onClick={onExport}
                  disabled={exporting}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={() => onExportReport('pdf')}
                  disabled={exportingReport}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => onExportReport('pptx')}
                  disabled={exportingReport}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  PPT
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <AnalysisBookmarkMenu
            surveyId={surveyId}
            kind="crosstab"
            onSave={buildBookmarkConfig}
            onLoad={onLoadBookmark}
          />
          <FilterEditor
            surveyId={surveyId}
            completionStatus={completionStatus}
            variables={variables}
            filters={filters}
            filterTree={filterTree}
            onChange={onFiltersChange}
            onFilterTreeChange={onFilterTreeChange}
            showPresets
            onPresetApply={onPresetApply}
            compact
            heading="Default filters"
          />
        </div>

        <p className="mt-2 text-xs text-slate-400">
          Default filters apply to all tables on build. Override filters per table in each table section below.
        </p>

        <p className="mt-1 text-xs text-slate-400">
          Use <strong>Add side row</strong> or <strong>Add banner column</strong> above, or click questions in the sidebar · <strong>+</strong> = banner · <strong>S</strong> = side row · a question can be both row and banner.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {!bannerResult && !analyzing && (
          <EmptyCanvas
            icon={<Table2 size={40} />}
            title="Advanced crosstabs"
            description="Add side row and banner column questions, choose table format options, then build the crosstab."
          />
        )}
        {analyzing && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
          </div>
        )}
        {bannerResult && !analyzing && (
          <div className="animate-fade-in rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <CrosstabsResults
              result={bannerResult}
              multiControls={{
                surveyId,
                completionStatus,
                variables,
                globalFilters: filters,
                tableFilters,
                onTableFiltersChange: onTableFiltersChange,
                onRefreshTable: onRefreshTable,
                refreshingTableId,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function SelectionChips({
  vars,
  onRemove,
  onClearAll,
  chipClassName,
  maxVisible = 3,
}: {
  vars: SurveyVariable[]
  onRemove: (id: string) => void
  onClearAll: () => void
  chipClassName: string
  maxVisible?: number
}) {
  if (vars.length === 0) return null

  const visible = vars.slice(0, maxVisible)
  const hiddenCount = vars.length - visible.length

  return (
    <>
      {vars.length > maxVisible && (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
          {vars.length} selected
        </span>
      )}
      {visible.map((v) => (
        <span key={v.id} className={chipClassName}>
          <span className="truncate">{v.text || v.code}</span>
          <button type="button" onClick={() => onRemove(v.id)} className="ml-0.5 rounded-full hover:opacity-70">
            ×
          </button>
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
          +{hiddenCount} more
        </span>
      )}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-medium text-slate-400 hover:text-red-600"
      >
        Clear all
      </button>
    </>
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
