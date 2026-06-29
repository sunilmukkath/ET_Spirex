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
import { BrandLogo } from '../components/BrandLogo'
import { BannerPicker } from '../components/analysis/BannerPicker'
import { BannerLayerEditor } from '../components/analysis/BannerLayerEditor'
import { FilterEditor } from '../components/analysis/FilterEditor'
import { QuestionNavigator } from '../components/analysis/QuestionNavigator'
import { SurveyOverviewBar } from '../components/analysis/SurveyOverviewBar'
import { CrosstabsResults, ProfileResults } from '../components/analysis/Results'
import { AnalysisBookmarkMenu } from '../components/analysis/AnalysisBookmarkMenu'
import { VariablesPanel, customVariableToSurvey } from '../components/analysis/VariablesPanel'
import { SuggestedCharts } from '../components/analysis/SuggestedCharts'
import { StatusBadge } from '../components/StatusBadge'
import { ErrorState, TableSkeleton } from '../components/States'
import { filterPayload } from '../lib/filterTree'
import type { ChartTypeId } from '../lib/chartTypes'

const DataPanel = lazy(() =>
  import('../components/analysis/DataPanel').then((m) => ({ default: m.DataPanel })),
)
const ResponseQCPanel = lazy(() =>
  import('../components/analysis/ResponseQCPanel').then((m) => ({ default: m.ResponseQCPanel })),
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
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <Loader2 className="animate-spin text-[var(--et-teal)]" size={24} />
        </div>
        <p className="text-sm text-slate-500">Loading panel…</p>
      </div>
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
  if (mode === 'quality') return 'Response QC'
  if (mode === 'variables') return 'Setup'
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
  const initialChartType = (searchParams.get('chart') as ChartTypeId | null) || null

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bannerLayers, setBannerLayers] = useState<string[][]>([[]])
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
  const [customVariables, setCustomVariables] = useState<CustomVariable[]>([])
  const [weightConfig, setWeightConfig] = useState<WeightConfig>({ enabled: false, variable_id: null })
  const [focusQuestionId, setFocusQuestionId] = useState<string | null>(null)
  const [exportingReport, setExportingReport] = useState(false)
  const [schemaVersion, setSchemaVersion] = useState(0)
  const [qcSummary, setQcSummary] = useState<{
    total_completed: number
    qc_approved_count: number
    excluded_count: number
    has_review: boolean
  } | null>(null)

  const reloadQcSummary = useCallback(async () => {
    if (!surveyId) return
    try {
      const summary = await api.getQcSummary(surveyId)
      setQcSummary(summary)
    } catch {
      setQcSummary(null)
    }
  }, [surveyId])

  const handleQcReviewChanged = useCallback(() => {
    reloadQcSummary()
    invalidateSchemaCache(surveyId)
    setSchemaVersion((v) => v + 1)
    setProfileResult(null)
    setBannerResult(null)
  }, [surveyId, reloadQcSummary])

  useEffect(() => {
    if (!surveyId) return
    reloadQcSummary()
  }, [surveyId, schemaVersion, reloadQcSummary])

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

  const configureCurrentQuestion = useCallback(() => {
    if (!selectedId) return
    setFocusQuestionId(selectedId)
    setSearchParams((prev) => {
      prev.set('mode', 'variables')
      return prev
    }, { replace: true })
  }, [selectedId, setSearchParams])

  const openQuestionChart = useCallback(
    (chartType: ChartTypeId) => {
      setSearchParams((prev) => {
        prev.set('mode', 'charts')
        prev.set('chart', chartType)
        return prev
      }, { replace: true })
    },
    [setSearchParams],
  )

  const clearInitialChartType = useCallback(() => {
    setSearchParams((prev) => {
      prev.delete('chart')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const handleWeightConfigChange = useCallback(
    async (next: WeightConfig) => {
      setWeightConfig(next)
      await api.setWeightConfig(surveyId, next)
      invalidateSchemaCache(surveyId)
      setSchemaVersion((v) => v + 1)
    },
    [surveyId],
  )

  const loadCrosstabBookmark = useCallback((bm: AnalysisBookmark) => {
    const cfg = bm.config
    if (Array.isArray(cfg.side_row_ids)) setSideRowIds(cfg.side_row_ids as string[])
    if (Array.isArray(cfg.banner_layers)) {
      setBannerLayers(cfg.banner_layers as string[][])
    } else if (Array.isArray(cfg.banner_ids)) {
      setBannerLayers([cfg.banner_ids as string[]])
    }
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
    const layers = bannerLayers.filter((layer) => layer.length > 0)
    const flatBannerIds = layers.flat()
    const row_filters: Record<string, FilterSpec[]> = {}
    for (const id of rowIds) {
      row_filters[id] = tableFilters[id] ?? filters
    }
    return {
      row_variable_id: rowIds[0],
      row_variable_ids: rowIds,
      banner_variable_ids: flatBannerIds,
      banner_layers: layers.length > 0 ? layers : undefined,
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
      if (banner) setBannerLayers([[banner.id]])
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

  const bannerIds = useMemo(() => [...new Set(bannerLayers.flat())], [bannerLayers])

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
    setBannerLayers((prev) => {
      const layers = prev.length > 0 ? prev : [[]]
      const layer0 = layers[0] ?? []
      if (layer0.includes(id)) return prev
      return [[...layer0, id], ...layers.slice(1)]
    })
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
    setBannerLayers([ids])
    setBannerResult(null)
  }

  function copySideRowsToBannerLayer(layerIndex: number) {
    setBannerLayers((prev) => {
      const layers = prev.length > 0 ? [...prev] : [[]]
      while (layers.length <= layerIndex) layers.push([])
      const existing = new Set(layers[layerIndex])
      layers[layerIndex] = [...layers[layerIndex], ...sideRowIds.filter((id) => !existing.has(id))]
      return layers
    })
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
    setBannerLayers([[]])
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
      <header className="shrink-0 border-b border-[var(--et-teal)]/12 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <Link
            to="/dashboard"
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-[var(--et-teal-light)] hover:text-[var(--et-teal-dark)]"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Surveys</span>
          </Link>
          <div className="hidden h-6 w-px bg-slate-200 md:block" />
          <Link to="/dashboard" className="hidden shrink-0 rounded-lg transition hover:opacity-90 md:block">
            <BrandLogo size="sm" showTagline={false} />
          </Link>
          <div className="hidden h-6 w-px bg-slate-200 lg:block" />

          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                {project?.title || navTitle || 'Loading survey...'}
              </h1>
              {project && <StatusBadge status={project.status} />}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              ID {surveyId}
              {schema && ` · ${schema.response_count.toLocaleString()} in sample`}
              {project && project.responses.total > 0 && ` · ${project.responses.completed.toLocaleString()} completed`}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={weightConfig.enabled && weightConfig.variable_id ? weightConfig.variable_id : ''}
              onChange={async (e) => {
                const variable_id = e.target.value || null
                const next = { enabled: Boolean(variable_id), variable_id }
                await handleWeightConfigChange(next)
              }}
              className="et-select max-w-[9.5rem]"
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
              className={`et-select ${
                completionStatus === 'qc_approved'
                  ? 'border-[var(--et-teal)] bg-[var(--et-teal-light)]/50 font-medium text-[var(--et-teal-dark)]'
                  : ''
              }`}
              title="Response sample for analysis"
            >
              <option value="complete">Completed</option>
              <option value="qc_approved">
                QC Approved{qcSummary ? ` (${qcSummary.qc_approved_count})` : ''}
              </option>
              <option value="all">All responses</option>
              <option value="incomplete">Incomplete</option>
            </select>

            {(completionStatus === 'qc_approved' || qcSummary?.has_review) && (
              <button
                type="button"
                onClick={() => setMode('quality')}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--et-teal)]/30 bg-[var(--et-teal-light)]/50 px-2.5 py-1.5 text-xs font-semibold text-[var(--et-teal-dark)] transition hover:bg-[var(--et-teal-light)]"
                title="Review flagged responses and exclusions"
              >
                <ShieldCheck size={14} />
                QC review
              </button>
            )}
          </div>
        </div>

        <div className="et-toolbar-scroll flex items-center gap-3 border-t border-slate-100 bg-slate-50/90 px-4 py-2">
          <span className="hidden shrink-0 et-kicker lg:inline">Analyze</span>
          <div className="et-segment">
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
          <span className="hidden shrink-0 text-slate-300 lg:inline" aria-hidden>
            |
          </span>
          <span className="hidden shrink-0 et-kicker lg:inline">Manage</span>
          <div className="et-segment">
            <ModeButton active={mode === 'variables'} onClick={() => setMode('variables')} icon={<SlidersHorizontal size={15} />}>
              Setup
            </ModeButton>
            <ModeButton active={mode === 'quality'} onClick={() => setMode('quality')} icon={<ShieldCheck size={15} />}>
              Quality
            </ModeButton>
            <ModeButton active={mode === 'data'} onClick={() => setMode('data')} icon={<Database size={15} />}>
              Data
            </ModeButton>
          </div>
        </div>
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
              onCompareRemove={(id) =>
                setBannerLayers((prev) => {
                  const next = prev.map((layer) => layer.filter((x) => x !== id))
                  return next.some((layer) => layer.length > 0) ? next : [[]]
                })
              }
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
                initialChartType={initialChartType}
                onInitialChartTypeConsumed={clearInitialChartType}
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
              onConfigureQuestion={configureCurrentQuestion}
              onOpenChart={openQuestionChart}
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <Suspense fallback={<PanelLoader />}>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <ResponseQCPanel
                    surveyId={surveyId}
                    qcApprovedCount={qcSummary?.qc_approved_count ?? null}
                    onUseQcApproved={() => setCompletionStatus('qc_approved')}
                    onReviewChanged={handleQcReviewChanged}
                  />
                </div>
              </Suspense>
            </div>
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
              weightConfig={weightConfig}
              onWeightConfigChange={handleWeightConfigChange}
              focusQuestionId={focusQuestionId}
              onFocusQuestionConsumed={() => setFocusQuestionId(null)}
              onChanged={reloadCustomVariables}
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
              bannerLayers={bannerLayers}
              onBannerLayersChange={(layers) => {
                setBannerLayers(layers)
                setBannerResult(null)
              }}
              onAddSideRow={addSideRow}
              onAddAllSideRows={addAllSideRows}
              onAddAllBanners={addAllBanners}
              onCopySideRowsToBannerLayer={copySideRowsToBannerLayer}
              onClearSideRows={clearSideRows}
              onClearBanners={clearBanners}
              filters={filters}
              filterTree={filterTree}
              onFilterTreeChange={handleFilterTreeChange}
              onFiltersChange={handleFiltersChange}
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
                  name: `Compare ${sideRowIds.length}×${bannerIds.length}${bannerLayers.filter((l) => l.length > 0).length > 1 ? ` (${bannerLayers.filter((l) => l.length > 0).length} layers)` : ''}`,
                  config: {
                    side_row_ids: sideRowIds,
                    banner_ids: bannerIds,
                    banner_layers: bannerLayers.filter((layer) => layer.length > 0),
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
      className={`et-segment-btn ${active ? 'et-segment-btn-active' : 'et-segment-btn-inactive'}`}
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
  onConfigureQuestion,
  onOpenChart,
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
  onConfigureQuestion: () => void
  onOpenChart: (chartType: ChartTypeId) => void
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
        <div className="shrink-0 border-b border-slate-200/80 bg-[var(--canvas-subtle)] px-6 py-4">
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
        <div className="shrink-0 border-b border-slate-200/80 bg-[var(--canvas-subtle)] px-6 py-4">
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
        <div className="shrink-0 border-b border-slate-200/80 bg-[var(--canvas-subtle)] px-6 py-4">
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
      <div className="shrink-0 border-b border-slate-200/80 bg-[var(--canvas-subtle)] px-6 py-4">
        {overview}
      </div>
      <div className="shrink-0 border-b border-slate-200/80 bg-white px-6 py-3 shadow-sm">
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
          {selectedVar && !schemaLoading && (
            <div className="mb-4">
              <SuggestedCharts variable={selectedVar} onSelectChart={onOpenChart} />
            </div>
          )}
          {profileResult ? (
            <div className="et-panel p-6 shadow-sm">
              <ProfileResults
                result={profileResult}
                onCompareQuestion={selectedId ? onCompareQuestion : undefined}
                onConfigureQuestion={selectedId ? onConfigureQuestion : undefined}
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
  bannerLayers,
  onBannerLayersChange,
  onAddSideRow,
  onAddAllSideRows,
  onAddAllBanners,
  onCopySideRowsToBannerLayer,
  onClearSideRows,
  onClearBanners,
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
  bannerLayers: string[][]
  onBannerLayersChange: (layers: string[][]) => void
  onAddSideRow: (id: string) => void
  onAddAllSideRows: () => void
  onAddAllBanners: () => void
  onCopySideRowsToBannerLayer: (layerIndex: number) => void
  onClearSideRows: () => void
  onClearBanners: () => void
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Banners (columns)</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onAddAllBanners}
                  className="text-[10px] font-medium text-[var(--et-teal-dark)] hover:underline"
                >
                  Add all
                </button>
                {sideRowIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onCopySideRowsToBannerLayer(0)}
                    className="text-[10px] font-medium text-[var(--et-teal-dark)] hover:underline"
                  >
                    Copy side rows
                  </button>
                )}
                {bannerLayers.some((layer) => layer.length > 0) && (
                  <button
                    type="button"
                    onClick={onClearBanners}
                    className="text-[10px] font-medium text-slate-500 hover:text-red-600"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
            <div className="mt-1.5">
              <BannerLayerEditor
                variables={variables.filter((v) => v.can_banner)}
                layers={bannerLayers}
                onChange={onBannerLayersChange}
                sideRowIds={sideRowIds}
                onCopySideRowsToLayer={onCopySideRowsToBannerLayer}
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
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
            <p className="text-sm font-medium text-slate-700">Building crosstab…</p>
            <p className="max-w-sm text-xs text-slate-500">
              First run can take up to 2–3 minutes while response data loads from LimeSurvey.
            </p>
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
      <div className="et-empty-icon">{icon}</div>
      <h3 className="mt-5 font-display text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>
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
