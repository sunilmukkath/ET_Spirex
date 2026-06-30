import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Database,
  FileText,
  Home,
  Kanban,
  Layers,
  Loader2,
  PanelLeft,
  Pin,
  ShieldCheck,
  Sigma,
  SlidersHorizontal,
  Table2,
} from 'lucide-react'
import {
  BANNER_CHUNK_CONCURRENCY,
  bannerChunkRequest,
  bannerTablesFromResult,
  chunkBannerRowIds,
  markSurveyWarmed,
  mergeBannerChunkResults,
  runBannerChunksParallel,
  shouldWarmupSurvey,
} from '../lib/bannerRun'
import {
  api,
  invalidateProfileCache,
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
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { usePinnedSurveys } from '../hooks/usePinnedSurveys'
import { BrandLogo } from '../components/BrandLogo'
import { ExplorePanel } from '../components/analysis/ExplorePanel'
import { CrosstabsPanel } from '../components/analysis/CrosstabsPanel'
import { QuestionNavigator } from '../components/analysis/QuestionNavigator'
import { VariablesPanel, customVariableToSurvey } from '../components/analysis/VariablesPanel'
import { StatusBadge } from '../components/StatusBadge'
import { ErrorState } from '../components/States'
import { FieldOperationsPanel, type FieldView } from '../components/analysis/FieldOperationsPanel'
import { SurveyHomePanel } from '../components/analysis/SurveyHomePanel'
import { ProjectWorkflowPanel } from '../components/analysis/ProjectWorkflowPanel'
import { ReportBuilderPanel } from '../components/analysis/ReportBuilderPanel'
import { filterPayload, treeToFlatFilters } from '../lib/filterTree'
import type { ChartTypeId } from '../lib/chartTypes'
import {
  captureCrosstabDefaults,
  loadUserFieldDefaults,
  resolveIdsFromCodes,
  resolveLayersFromCodes,
  saveUserFieldDefaults,
} from '../lib/surveyFieldDefaults'
import {
  loadSurveySession,
  loadUserAppSession,
  mergeSessionIntoSearch,
  saveSurveySession,
  saveUserAppSession,
  surveyEntryUsesDefaults,
} from '../lib/workspaceSession'

const DataPanel = lazy(() =>
  import('../components/analysis/DataPanel').then((m) => ({ default: m.DataPanel })),
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

type Mode =
  | 'home'
  | 'explore'
  | 'charts'
  | 'reports'
  | 'variables'
  | 'fields'
  | 'data'
  | 'multivariate'
  | 'workflow'
type AnalyzeView = 'profile' | 'compare'

function parseMode(raw: string | null): Mode {
  if (raw === 'crosstabs' || raw === 'compare') return 'explore'
  if (raw === 'home' || raw === 'overview') return 'home'
  if (raw === 'fielding' || raw === 'monitor' || raw === 'fieldteam' || raw === 'field-team') return 'fields'
  if (raw === 'reports' || raw === 'report-builder') return 'reports'
  if (raw === 'charts') return 'charts'
  if (raw === 'quality') return 'fields'
  if (raw === 'variables') return 'variables'
  if (raw === 'fields' || raw === 'quotas' || raw === 'field-management') return 'fields'
  if (raw === 'data') return 'data'
  if (raw === 'multivariate' || raw === 'advanced' || raw === 'statistics') return 'multivariate'
  if (raw === 'workflow' || raw === 'tasks' || raw === 'team-workflow') return 'workflow'
  if (raw === 'explore' || raw === 'questions') return 'explore'
  return 'home'
}

function parseAnalyzeView(rawMode: string | null, rawView: string | null): AnalyzeView {
  if (rawMode === 'crosstabs' || rawMode === 'compare' || rawView === 'compare' || rawView === 'crosstabs') return 'compare'
  return 'profile'
}

function parseFieldView(rawMode: string | null, rawView: string | null): FieldView {
  if (
    rawMode === 'quality' ||
    rawView === 'quality'
  ) {
    return 'quality'
  }
  if (
    rawMode === 'fieldteam' ||
    rawMode === 'field-team' ||
    rawView === 'team'
  ) {
    return 'team'
  }
  return 'fielding'
}

export function SurveyWorkspace() {
  const { user } = useAuth()
  const { isPinned, toggle: togglePinned } = usePinnedSurveys()
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

  const rawModeParam = searchParams.get('mode')
  const mode = parseMode(rawModeParam)
  const analyzeView = parseAnalyzeView(rawModeParam, searchParams.get('view'))
  const fieldView = parseFieldView(rawModeParam, searchParams.get('view'))
  const completionStatus = searchParams.get('responses') || 'complete'
  const initialChartType = (searchParams.get('chart') as ChartTypeId | null) || null

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bannerLayers, setBannerLayers] = useState<string[][]>([[]])
  const [sideRowIds, setSideRowIds] = useState<string[]>([])
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null)
  const [bannerResult, setBannerResult] = useState<BannerResult | null>(null)
  const [bannerProgress, setBannerProgress] = useState<{ done: number; total: number } | null>(null)
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
  const [focusQuestionId, setFocusQuestionId] = useState<string | null>(null)
  const [exportingReport, setExportingReport] = useState(false)
  const [schemaVersion, setSchemaVersion] = useState(0)
  const [qcSummary, setQcSummary] = useState<{
    total_completed: number
    qc_approved_count: number
    excluded_count: number
    has_review: boolean
  } | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [autoRunCrosstabsTotal, setAutoRunCrosstabsTotal] = useState(
    () => loadUserAppSession(user?.username ?? '')?.autoRunCrosstabsTotal ?? true,
  )
  const autoRunCompareAttempted = useRef(false)

  useEffect(() => {
    if (!user?.username) return
    setAutoRunCrosstabsTotal(loadUserAppSession(user.username)?.autoRunCrosstabsTotal ?? true)
  }, [user?.username])

  useEffect(() => {
    if (!user?.username) return
    saveUserAppSession(user.username, { autoRunCrosstabsTotal })
  }, [user?.username, autoRunCrosstabsTotal])

  useEffect(() => {
    autoRunCompareAttempted.current = false
  }, [surveyId, analyzeView])

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
    invalidateProfileCache(surveyId)
    setSchemaVersion((v) => v + 1)
    setProfileResult(null)
    setBannerResult(null)
  }, [surveyId, reloadQcSummary])

  useEffect(() => {
    if (!user?.username || !Number.isFinite(surveyId)) return

    const qs = searchParams.toString()
    if (!surveyEntryUsesDefaults(qs ? `?${qs}` : '')) return

    const saved = loadSurveySession(user.username, surveyId)
    if (!saved) return

    setSearchParams((prev) => mergeSessionIntoSearch(prev, saved), { replace: true })
    if (saved.selectedQuestionId) setSelectedId(saved.selectedQuestionId)
    if (saved.metric) setMetric(saved.metric)
  }, [user?.username, surveyId, setSearchParams])

  useEffect(() => {
    if (!user?.username || !Number.isFinite(surveyId)) return
    saveSurveySession(user.username, surveyId, {
      mode: rawModeParam || 'home',
      view: searchParams.get('view') || undefined,
      responses: completionStatus,
      selectedQuestionId: selectedId,
      sideRowIds,
      bannerLayers,
      metric,
    })
    const qs = searchParams.toString()
    saveUserAppSession(user.username, {
      lastSurveyId: surveyId,
      lastSurveyTitle: project?.title || navTitle || undefined,
      lastPath: qs ? `/projects/${surveyId}?${qs}` : `/projects/${surveyId}`,
    })
  }, [
    user?.username,
    surveyId,
    rawModeParam,
    searchParams,
    completionStatus,
    selectedId,
    sideRowIds,
    bannerLayers,
    metric,
    project?.title,
    navTitle,
  ])

  useEffect(() => {
    if (!surveyId) return
    reloadQcSummary()
  }, [surveyId, schemaVersion, reloadQcSummary])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [mode, analyzeView, fieldView])

  useEffect(() => {
    const raw = searchParams.get('mode')
    if (raw === 'crosstabs' || raw === 'compare') {
      setSearchParams((prev) => {
        prev.set('mode', 'explore')
        prev.set('view', 'crosstabs')
        return prev
      }, { replace: true })
      return
    }
    if (raw === 'fielding' || raw === 'monitor' || raw === 'quotas') {
      setSearchParams((prev) => {
        prev.set('mode', 'fields')
        prev.set('view', 'fielding')
        return prev
      }, { replace: true })
      return
    }
    if (raw === 'fieldteam' || raw === 'field-team') {
      setSearchParams((prev) => {
        prev.set('mode', 'fields')
        prev.set('view', 'team')
        return prev
      }, { replace: true })
      return
    }
    if (raw === 'quality') {
      setSearchParams((prev) => {
        prev.set('mode', 'fields')
        prev.set('view', 'quality')
        return prev
      }, { replace: true })
      return
    }
    const rawView = searchParams.get('view')
    if (rawView === 'monitor' || rawView === 'quotas') {
      setSearchParams((prev) => {
        prev.set('mode', 'fields')
        prev.set('view', 'fielding')
        return prev
      }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const mergedSchema = useMemo((): SurveySchema | null => {
    if (!schema) return null
    if (!customVariables.length) return schema
    const customVars = customVariables.map((cv) => customVariableToSurvey(cv, schema.variables))
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

  const applyTableFilterPreset = useCallback((rowId: string, preset: FilterPreset) => {
    const next =
      preset.filter_tree?.children?.length
        ? treeToFlatFilters(preset.filter_tree)
        : (preset.filters ?? [])
    setTableFilters((prev) => ({ ...prev, [rowId]: next }))
  }, [])

  const setAnalyzeView = useCallback(
    (view: AnalyzeView) => {
      setSearchParams((prev) => {
        prev.set('mode', 'explore')
        if (view === 'compare') prev.set('view', 'crosstabs')
        else prev.delete('view')
        return prev
      }, { replace: true })
    },
    [setSearchParams],
  )

  const setFieldView = useCallback(
    (view: FieldView) => {
      setSearchParams((prev) => {
        prev.set('mode', 'fields')
        prev.set('view', view)
        return prev
      }, { replace: true })
    },
    [setSearchParams],
  )

  const navigateWorkspace = useCallback(
    (targetMode: string, view?: string) => {
      setSearchParams((prev) => {
        prev.set('mode', targetMode)
        if (targetMode === 'fields' && (view === 'fielding' || view === 'team' || view === 'quality' || view === 'monitor' || view === 'quotas')) {
          prev.set('view', view === 'fielding' || view === 'monitor' || view === 'quotas' ? 'fielding' : view)
        } else if (targetMode === 'quality') {
          prev.set('mode', 'fields')
          prev.set('view', 'quality')
        } else if (view === 'compare' || view === 'crosstabs') {
          prev.set('view', 'crosstabs')
        } else if (view === 'profile') {
          prev.delete('view')
        } else if (targetMode !== 'explore' && targetMode !== 'fields') {
          prev.delete('view')
        }
        return prev
      }, { replace: true })
    },
    [setSearchParams],
  )

  const compareCurrentQuestion = useCallback(() => {
    if (!selectedId) return
    setSideRowIds([selectedId])
    setAnalyzeView('compare')
  }, [selectedId, setAnalyzeView])

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
    if (cfg.table_filters && typeof cfg.table_filters === 'object') {
      setTableFilters(cfg.table_filters as Record<string, FilterSpec[]>)
    }
  }, [])

  const profileAbort = useRef<AbortController | null>(null)
  const bannerAbort = useRef<AbortController | null>(null)
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

  function buildBannerRequest(overrides?: { rowIds?: string[]; bannerLayers?: string[][] }) {
    const rowIds =
      overrides?.rowIds ??
      (sideRowIds.length > 0 ? sideRowIds : selectedId ? [selectedId] : [])
    if (rowIds.length === 0) return null
    const sourceLayers = overrides?.bannerLayers ?? bannerLayers
    const layers = sourceLayers.filter((layer) => layer.length > 0)
    const flatBannerIds = layers.flat()
    const row_filters: Record<string, FilterSpec[]> = {}
    const defaultFiltersKey = JSON.stringify(filters)
    for (const id of rowIds) {
      const custom = tableFilters[id]
      if (custom && JSON.stringify(custom) !== defaultFiltersKey) {
        row_filters[id] = custom
      }
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
      ...(Object.keys(row_filters).length > 0 ? { row_filters } : {}),
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
      if (initialized.current) return

      const saved = user?.username ? loadSurveySession(user.username, surveyId) : null
      const userDefaults = user?.username ? loadUserFieldDefaults(user.username) : null

      initialized.current = true

      let sideIds =
        saved?.sideRowIds?.filter((id) => data.variables.some((v) => v.id === id)) ?? []
      let layers =
        saved?.bannerLayers
          ?.map((layer) => layer.filter((id) => data.variables.some((v) => v.id === id)))
          .filter((layer) => layer.length > 0) ?? []

      if (!sideIds.length && userDefaults?.sideRowCodes?.length) {
        sideIds = resolveIdsFromCodes(data.variables, userDefaults.sideRowCodes)
      }
      if (!layers.length && userDefaults?.bannerLayerCodes?.length) {
        layers = resolveLayersFromCodes(data.variables, userDefaults.bannerLayerCodes)
      }

      if (!sideIds.length) {
        const first = data.variables.find((v) => v.can_banner) || data.variables[0]
        if (first) sideIds = [first.id]
      }
      if (!layers.length) {
        const banner = data.variables.find((v) => v.kind === 'single' && !sideIds.includes(v.id))
        if (banner) layers = [[banner.id]]
      }

      if (sideIds.length) {
        setSideRowIds(sideIds)
        const selected =
          saved?.selectedQuestionId && sideIds.includes(saved.selectedQuestionId)
            ? saved.selectedQuestionId
            : sideIds[0]
        setSelectedId(selected)
      }
      if (layers.length) setBannerLayers(layers)
      if (saved?.metric) setMetric(saved.metric)
    }

    // Phase 1: fast question list (~1s) — sidebar usable immediately
    api.getSchema(surveyId, completionStatus, true)
      .then((data) => {
        if (cancelled) return
        setSchema(data)
        pickDefaults(data)
        setSchemaLoading(false)
        api.warmupSurvey(surveyId, completionStatus)
          .then(() => markSurveyWarmed(surveyId, completionStatus))
          .catch(() => {})
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
  }, [surveyId, completionStatus, schemaVersion, user?.username])

  useEffect(() => {
    if (!surveyId) return
    reloadCustomVariables()
  }, [surveyId, reloadCustomVariables])

  const activeSchema = mergedSchema ?? schema

  useEffect(() => {
    if (!user?.username || !activeSchema?.variables.length) return
    const timer = window.setTimeout(() => {
      saveUserFieldDefaults(
        user.username,
        captureCrosstabDefaults(activeSchema.variables, sideRowIds, bannerLayers),
      )
    }, 800)
    return () => window.clearTimeout(timer)
  }, [user?.username, activeSchema, sideRowIds, bannerLayers])

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
    if (mode !== 'explore' || analyzeView !== 'profile' || !selectedId || schemaLoading) return
    const t = setTimeout(() => runProfile(selectedId), 600)
    return () => clearTimeout(t)
  }, [mode, analyzeView, selectedId, schemaLoading, filters, filterTree, runProfile])

  const runBanner = useCallback(async (overrides?: { rowIds?: string[]; bannerLayers?: string[][] }) => {
    const request = buildBannerRequest(overrides)
    if (!request) return

    bannerAbort.current?.abort()
    const ctrl = new AbortController()
    bannerAbort.current = ctrl

    setAnalyzing(true)
    setBannerProgress(null)
    setBannerResult(null)

    const rowIds = request.row_variable_ids ?? [request.row_variable_id]
    const chunks = chunkBannerRowIds(rowIds)

    try {
      if (shouldWarmupSurvey(surveyId, completionStatus)) {
        await api.warmupSurvey(surveyId, completionStatus).catch(() => {})
        markSurveyWarmed(surveyId, completionStatus)
      }

      if (chunks.length === 1) {
        const chunkResult = await api.runBanner(surveyId, request, ctrl.signal)
        if (!ctrl.signal.aborted) setBannerResult(chunkResult)
        return
      }

      setBannerProgress({ done: 0, total: rowIds.length })
      const chunkResults = await runBannerChunksParallel({
        chunks,
        concurrency: BANNER_CHUNK_CONCURRENCY,
        signal: ctrl.signal,
        runChunk: async (chunkIds) => {
          const chunkResult = await api.runBanner(
            surveyId,
            bannerChunkRequest(request, chunkIds),
            ctrl.signal,
          )
          return chunkResult
        },
        onChunkComplete: (_index, _chunkResult, completedRows, totalRows) => {
          if (ctrl.signal.aborted) return
          setBannerProgress({ done: completedRows, total: totalRows })
        },
      })

      if (ctrl.signal.aborted) return

      const allTables = chunkResults.flatMap((result) => bannerTablesFromResult(result))
      setBannerResult(mergeBannerChunkResults(allTables, request))
    } catch (err) {
      if (!ctrl.signal.aborted) {
        setBannerResult({ error: err instanceof Error ? err.message : 'Crosstab failed' })
      }
    } finally {
      if (!ctrl.signal.aborted) {
        setAnalyzing(false)
        setBannerProgress(null)
      }
    }
  }, [
    surveyId,
    completionStatus,
    sideRowIds,
    selectedId,
    bannerLayers,
    showCounts,
    showColPct,
    showRowPct,
    sigEnabled,
    confidenceLevel,
    metric,
    filters,
    filterTree,
    tableFilters,
  ])

  const runAllOnTotal = useCallback(async () => {
    const ids = (activeSchema?.variables ?? [])
      .filter((v) => v.can_banner)
      .map((v) => v.id)
    if (ids.length === 0) return
    setSideRowIds(ids)
    setBannerLayers([[]])
    setSelectedId(ids[0])
    setBannerResult(null)
    await runBanner({ rowIds: ids, bannerLayers: [[]] })
  }, [activeSchema, runBanner])

  useEffect(() => {
    if (mode !== 'explore' || analyzeView !== 'compare' || schemaLoading) return
    if (!autoRunCrosstabsTotal) return
    if (analyzing || autoRunCompareAttempted.current) return
    if (!(activeSchema?.variables ?? []).some((v) => v.can_banner)) return

    autoRunCompareAttempted.current = true
    const timer = window.setTimeout(() => {
      void runAllOnTotal()
    }, 400)
    return () => window.clearTimeout(timer)
  }, [
    mode,
    analyzeView,
    schemaLoading,
    autoRunCrosstabsTotal,
    analyzing,
    activeSchema,
    runAllOnTotal,
  ])

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
    setMobileNavOpen(false)
    if (mode === 'explore' && analyzeView === 'compare') {
      setSideRowIds((prev) => {
        const rest = prev.filter((x) => x !== id)
        return [id, ...rest]
      })
      setBannerResult(null)
    }
  }

  const showsQuestionNav =
    mode !== 'home' &&
    mode !== 'variables' &&
    mode !== 'fields' &&
    mode !== 'reports' &&
    mode !== 'data' &&
    mode !== 'charts' &&
    mode !== 'multivariate'

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
            <BrandLogo size="sm" />
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
            <button
              type="button"
              onClick={() => void togglePinned(surveyId)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                isPinned(surveyId)
                  ? 'border-[var(--et-teal)] bg-[var(--et-teal-light)]/60 text-[var(--et-teal-dark)]'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
              }`}
              title={isPinned(surveyId) ? 'Unpin from surveys page' : 'Pin to surveys page'}
            >
              <Pin size={14} className={isPinned(surveyId) ? 'fill-current' : ''} />
              {isPinned(surveyId) ? 'Pinned' : 'Pin'}
            </button>

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
                onClick={() => setFieldView('quality')}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--et-teal)]/30 bg-[var(--et-teal-light)]/50 px-2.5 py-1.5 text-xs font-semibold text-[var(--et-teal-dark)] transition hover:bg-[var(--et-teal-light)]"
                title="Review flagged responses and exclusions"
              >
                <ShieldCheck size={14} />
                QC review
              </button>
            )}
          </div>
        </div>

        <div className="et-toolbar-scroll flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-slate-100 bg-slate-50/90 px-3 py-2 sm:gap-3 sm:px-4">
          {showsQuestionNav && (
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 md:hidden"
            >
              <PanelLeft size={15} />
              {analyzeView === 'compare' ? 'Rows & banners' : 'Questions'}
            </button>
          )}
          <span className="hidden shrink-0 et-kicker lg:inline">Overview</span>
          <div className="et-segment">
            <ModeButton active={mode === 'home'} onClick={() => setMode('home')} icon={<Home size={15} />}>
              Home
            </ModeButton>
            <ModeButton active={mode === 'workflow'} onClick={() => setMode('workflow')} icon={<Kanban size={15} />}>
              Workflow
            </ModeButton>
          </div>
          <span className="hidden shrink-0 text-slate-300 lg:inline" aria-hidden>
            |
          </span>
          <span className="hidden shrink-0 et-kicker lg:inline">Analyze</span>
          <div className="et-segment">
            <ModeButton active={mode === 'explore'} onClick={() => setMode('explore')} icon={<Layers size={15} />}>
              Analyze
            </ModeButton>
            <ModeButton active={mode === 'charts'} onClick={() => setMode('charts')} icon={<BarChart3 size={15} />}>
              Charts
            </ModeButton>
            <ModeButton active={mode === 'reports'} onClick={() => setMode('reports')} icon={<FileText size={15} />}>
              Reports
            </ModeButton>
            <ModeButton active={mode === 'multivariate'} onClick={() => setMode('multivariate')} icon={<Sigma size={15} />}>
              Statistics
            </ModeButton>
          </div>
          <span className="hidden shrink-0 text-slate-300 lg:inline" aria-hidden>
            |
          </span>
          <span className="hidden shrink-0 et-kicker lg:inline">Field & data</span>
          <div className="et-segment">
            <ModeButton active={mode === 'fields'} onClick={() => setMode('fields')} icon={<ClipboardList size={15} />}>
              Field
            </ModeButton>
            <ModeButton active={mode === 'variables'} onClick={() => setMode('variables')} icon={<SlidersHorizontal size={15} />}>
              Data setup
            </ModeButton>
            <ModeButton active={mode === 'data'} onClick={() => setMode('data')} icon={<Database size={15} />}>
              Raw data
            </ModeButton>
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {showsQuestionNav && mobileNavOpen && (
            <button
              type="button"
              aria-label="Close question panel"
              className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
          )}
          {showsQuestionNav && (
            <div
              className={`${
                mobileNavOpen
                  ? 'fixed inset-y-0 left-0 z-50 flex shadow-2xl md:relative md:z-auto md:shadow-none'
                  : 'hidden md:flex'
              } h-full min-h-0`}
            >
              <QuestionNavigator
                variables={activeSchema?.variables ?? []}
                groups={activeSchema?.groups ?? []}
                selectedId={selectedId}
                onSelect={handleSelectQuestion}
                loading={schemaLoading}
                compareMode={mode === 'explore' && analyzeView === 'compare'}
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
                onAfterSelect={() => setMobileNavOpen(false)}
                className="h-full min-h-0 max-h-full"
              />
            </div>
          )}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {error && !schema && (
            <div className="p-6">
              <ErrorState message={error} />
            </div>
          )}

          {mode === 'explore' && (
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
              <div className="et-segment">
                <AnalyzeViewButton
                  active={analyzeView === 'profile'}
                  onClick={() => setAnalyzeView('profile')}
                  icon={<Layers size={14} />}
                >
                  Profile
                </AnalyzeViewButton>
                <AnalyzeViewButton
                  active={analyzeView === 'compare'}
                  onClick={() => setAnalyzeView('compare')}
                  icon={<Table2 size={14} />}
                >
                  Crosstabs
                </AnalyzeViewButton>
              </div>
              <p className="hidden text-xs text-slate-500 sm:block">
                {analyzeView === 'profile'
                  ? 'Single-question distribution and summary'
                  : 'Crosstab rows against banner columns'}
              </p>
            </div>
          )}

          {enriching && schema && (
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              <Loader2 className="animate-spin" size={14} />
              Loading answer options for {schema.question_count ?? schema.variables.length} questions…
            </div>
          )}

          {mode === 'home' && (
            <SurveyHomePanel surveyId={surveyId} onNavigate={navigateWorkspace} />
          )}

          {mode === 'workflow' && user && (
            <ProjectWorkflowPanel
              surveyId={surveyId}
              currentUser={user.username}
              globalRole={user.role}
            />
          )}

          {mode === 'fields' && (
            <FieldOperationsPanel
              surveyId={surveyId}
              completionStatus={completionStatus}
              variables={activeSchema?.variables ?? []}
              view={fieldView}
              onViewChange={setFieldView}
              qcApprovedCount={qcSummary?.qc_approved_count ?? null}
              onUseQcApproved={() => setCompletionStatus('qc_approved')}
              onReviewChanged={handleQcReviewChanged}
            />
          )}

          {mode === 'reports' && (
            <ReportBuilderPanel
              surveyId={surveyId}
              completionStatus={completionStatus}
              variables={activeSchema?.variables ?? []}
              filters={filters}
              filterTree={filterTree}
            />
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

          {mode === 'explore' && analyzeView === 'profile' && (
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <VariablesPanel
              surveyId={surveyId}
              schema={schema}
              completionStatus={completionStatus}
              username={user?.username ?? null}
              focusQuestionId={focusQuestionId}
              onFocusQuestionConsumed={() => setFocusQuestionId(null)}
              onChanged={reloadCustomVariables}
              />
            </div>
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

          {mode === 'explore' && analyzeView === 'compare' && (
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
              bannerProgress={bannerProgress}
              exporting={exporting}
              onRun={() => void runBanner()}
              onRunAllOnTotal={() => void runAllOnTotal()}
              autoRunTotal={autoRunCrosstabsTotal}
              onAutoRunTotalChange={setAutoRunCrosstabsTotal}
              onExport={exportBanner}
              bannerResult={bannerResult}
              schemaLoading={schemaLoading}
              tableFilters={tableFilters}
              onTableFiltersChange={updateTableFilters}
              onRefreshTable={refreshCrosstabTable}
              refreshingTableId={refreshingTableId}
              onPresetApply={applyFilterPreset}
              onTablePresetApply={applyTableFilterPreset}
              onLoadBookmark={loadCrosstabBookmark}
              buildBookmarkConfig={() => {
                const req = buildBannerRequest()
                return {
                  name: `Crosstabs ${sideRowIds.length}×${bannerIds.length}${bannerLayers.filter((l) => l.length > 0).length > 1 ? ` (${bannerLayers.filter((l) => l.length > 0).length} layers)` : ''}`,
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
                    table_filters: tableFilters,
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

function AnalyzeViewButton({
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
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition ${
        active ? 'et-segment-btn-active' : 'et-segment-btn-inactive'
      }`}
    >
      {icon}
      {children}
    </button>
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
