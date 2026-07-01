import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Layers,
  Loader2,
  PanelLeft,
  Pin,
  Search,
  ShieldCheck,
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
  type CustomVariableInput,
  type CustomVariableType,
  type FilterGroup,
  type FilterPreset,
  type FilterSpec,
  type ProfileResult,
  type ProjectDetail,
  type StudyType,
  type SurveySchema,
  type SurveyVariable,
  type WorkflowAccess,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { usePinnedSurveys } from '../hooks/usePinnedSurveys'
import { BrandLogo } from '../components/BrandLogo'
import { ExplorePanel } from '../components/analysis/ExplorePanel'
import { CrosstabsPanel } from '../components/analysis/CrosstabsPanel'
import { QuestionNavigator } from '../components/analysis/QuestionNavigator'
import { VariablesPanel, customVariableToSurvey, buildVariableFormFromSource } from '../components/analysis/VariablesPanel'
import { StatusBadge } from '../components/StatusBadge'
import { ErrorState } from '../components/States'
import { FieldOperationsPanel, type FieldView } from '../components/analysis/FieldOperationsPanel'
import { SurveyHomePanel } from '../components/analysis/SurveyHomePanel'
import { ProjectWorkflowPanel } from '../components/analysis/ProjectWorkflowPanel'
import { QualPanel } from '../components/analysis/QualPanel'
import { ReportBuilderPanel } from '../components/analysis/ReportBuilderPanel'
import { filterPayload, treeToFlatFilters } from '../lib/filterTree'
import type { ChartTypeId } from '../lib/chartTypes'
import type { CrosstabHeatmapMetric } from '../lib/crosstabHeatmap'
import {
  captureCrosstabDefaults,
  loadUserFieldDefaults,
  resolveIdsFromCodes,
  resolveLayersFromCodes,
  saveSurveyLayout,
  saveUserFieldDefaults,
} from '../lib/surveyFieldDefaults'
import { filterWorkspaceNav,
  navItemToSearchParams,
  parseSetupView,
  resolveActiveNavId,
  WORKSPACE_NAV_ITEMS,
  type SetupView,
  type WorkspaceNavItem,
} from '../lib/workspaceNav'
import { CommandPalette, useCommandPaletteHotkey } from '../components/workspace/CommandPalette'
import { WorkspaceBreadcrumbs } from '../components/workspace/WorkspaceBreadcrumbs'
import {
  resolveSidebarActiveId,
  WorkspaceSidebar,
  WorkspaceSidebarToggle,
} from '../components/workspace/WorkspaceSidebar'
import {
  loadSurveySession,
  saveSurveySession,
  saveUserAppSession,
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
  | 'qual'
type AnalyzeView = 'profile' | 'compare'

function parseMode(raw: string | null): Mode {
  if (raw === 'crosstabs' || raw === 'compare') return 'explore'
  if (raw === 'home' || raw === 'overview') return 'home'
  if (raw === 'qual' || raw === 'qual-library') return 'qual'
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

function modeNeedsSchema(mode: Mode): boolean {
  return mode !== 'home' && mode !== 'workflow' && mode !== 'qual'
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
  const [schemaError, setSchemaError] = useState<string | null>(null)

  const rawModeParam = searchParams.get('mode')
  const mode = parseMode(rawModeParam)
  const analyzeView = parseAnalyzeView(rawModeParam, searchParams.get('view'))
  const fieldView = parseFieldView(rawModeParam, searchParams.get('view'))
  const setupView = parseSetupView(rawModeParam, searchParams.get('view'))
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
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)
  const [heatmapMetric, setHeatmapMetric] = useState<CrosstabHeatmapMetric>('col_pct')
  const [confidenceLevel, setConfidenceLevel] = useState(0.95)
  const [sigEnabled, setSigEnabled] = useState(true)
  const [filters, setFilters] = useState<FilterSpec[]>([])
  const [filterTree, setFilterTree] = useState<FilterGroup | null>(null)
  const [tableFilters, setTableFilters] = useState<Record<string, FilterSpec[]>>({})
  const [refreshingTableId, setRefreshingTableId] = useState<string | null>(null)
  const [customVariables, setCustomVariables] = useState<CustomVariable[]>([])
  const [variableFormBootstrap, setVariableFormBootstrap] = useState<Partial<CustomVariableInput> | null>(
    null,
  )
  const [variableEditBootstrap, setVariableEditBootstrap] = useState<CustomVariable | null>(null)
  const [exportingReport, setExportingReport] = useState(false)
  const [schemaVersion, setSchemaVersion] = useState(0)
  const [qcSummary, setQcSummary] = useState<{
    total_completed: number
    qc_approved_count: number
    excluded_count: number
    has_review: boolean
  } | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [workflowAccess, setWorkflowAccess] = useState<WorkflowAccess | null>(null)
  const [studyType, setStudyType] = useState<StudyType>('quant')
  const [workflowAccessLoaded, setWorkflowAccessLoaded] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
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
    const saved = loadSurveySession(user.username, surveyId)
    if (saved?.selectedQuestionId) setSelectedId(saved.selectedQuestionId)
    if (saved?.metric) setMetric(saved.metric)
  }, [user?.username, surveyId])

  useEffect(() => {
    if (!user?.username || !Number.isFinite(surveyId)) return
    const viewParam = searchParams.get('view') || undefined
    saveSurveySession(user.username, surveyId, {
      mode: rawModeParam || 'home',
      view: viewParam,
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
    saveSurveyLayout(user.username, surveyId, {
      mode: rawModeParam || 'home',
      analyzeView: analyzeView === 'compare' ? 'crosstabs' : undefined,
      fieldView,
      setupView: mode === 'variables' ? setupView : undefined,
    })
  }, [
    user?.username,
    surveyId,
    rawModeParam,
    completionStatus,
    selectedId,
    sideRowIds,
    bannerLayers,
    metric,
    project?.title,
    navTitle,
    analyzeView,
    fieldView,
    mode,
    setupView,
    searchParams,
  ])

  useEffect(() => {
    if (!surveyId) return
    let cancelled = false
    setWorkflowAccessLoaded(false)
    api
      .getProjectWorkflow(surveyId)
      .then((res) => {
        if (!cancelled) {
          setWorkflowAccess(res.access)
          setStudyType(res.workflow.study_type ?? 'quant')
          setWorkflowAccessLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkflowAccess(null)
          setWorkflowAccessLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [surveyId])

  useEffect(() => {
    if (!workflowAccessLoaded || !workflowAccess) return
    const navId = resolveActiveNavId(mode, analyzeView, fieldView, setupView)
    const allowed = filterWorkspaceNav(workflowAccess, studyType)
    if (allowed.some((item) => item.id === navId)) return
    const fallbackItem = allowed[0]
    if (!fallbackItem) return
    const { mode: nextMode, view } = navItemToSearchParams(fallbackItem)
    setSearchParams((prev) => {
      prev.set('mode', nextMode)
      if (view) prev.set('view', view)
      else prev.delete('view')
      return prev
    }, { replace: true })
  }, [workflowAccess, workflowAccessLoaded, mode, analyzeView, fieldView, setupView, studyType, setSearchParams])

  useEffect(() => {
    if (mode !== 'variables') return
    const view = searchParams.get('view')
    if (!view || view === 'questions') {
      setSearchParams((prev) => {
        prev.set('mode', 'explore')
        prev.delete('view')
        return prev
      }, { replace: true })
    }
  }, [mode, searchParams, setSearchParams])

  useCommandPaletteHotkey(() => setCommandOpen(true))

  const activeNavId = resolveSidebarActiveId(mode, analyzeView, fieldView, setupView)

  const navigateToNavItem = useCallback(
    (item: WorkspaceNavItem) => {
      const { mode: nextMode, view } = navItemToSearchParams(item)
      setSearchParams((prev) => {
        prev.set('mode', nextMode)
        if (view) prev.set('view', view)
        else if (nextMode === 'explore') prev.delete('view')
        else if (nextMode !== 'fields' && nextMode !== 'variables') prev.delete('view')
        return prev
      }, { replace: true })
    },
    [setSearchParams],
  )
  useEffect(() => {
    if (!surveyId || !schema || mode !== 'home') return
    const timer = window.setTimeout(() => {
      reloadQcSummary()
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [surveyId, schema, mode, reloadQcSummary])

  // QC summary when Field tab is active (immediate).
  useEffect(() => {
    if (!surveyId || mode !== 'fields') return
    reloadQcSummary()
  }, [surveyId, mode, schemaVersion, reloadQcSummary])

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
        } else if (targetMode === 'variables') {
          if (view === 'custom' || view === 'weighting') {
            prev.set('view', view)
          } else if (view === 'questions' || view === 'profile') {
            prev.set('mode', 'explore')
            prev.delete('view')
          } else {
            prev.set('view', 'custom')
          }
        } else if (view === 'compare' || view === 'crosstabs') {
          prev.set('mode', 'explore')
          prev.set('view', 'crosstabs')
        } else if (view === 'profile') {
          prev.set('mode', 'explore')
          prev.delete('view')
        } else if (targetMode !== 'explore' && targetMode !== 'fields') {
          prev.delete('view')
        }
        return prev
      }, { replace: true })
    },
    [setSearchParams],
  )

  const setSetupView = useCallback(
    (view: SetupView) => {
      setSearchParams((prev) => {
        prev.set('mode', 'variables')
        prev.set('view', view)
        return prev
      }, { replace: true })
    },
    [setSearchParams],
  )

  const openCreateVariableFromQuestion = useCallback(
    (type: CustomVariableType, source: SurveyVariable) => {
      setVariableEditBootstrap(null)
      setVariableFormBootstrap({ ...buildVariableFormFromSource(type, source) })
      setSetupView('custom')
    },
    [setSetupView],
  )

  const openEditVariable = useCallback(
    (variable: CustomVariable) => {
      setVariableFormBootstrap(null)
      setVariableEditBootstrap(variable)
      setSetupView('custom')
    },
    [setSetupView],
  )

  const compareCurrentQuestion = useCallback(() => {
    if (!selectedId) return
    setSideRowIds([selectedId])
    setAnalyzeView('compare')
  }, [selectedId, setAnalyzeView])

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
    if (typeof cfg.heatmap_enabled === 'boolean') setHeatmapEnabled(cfg.heatmap_enabled)
    if (
      cfg.heatmap_metric === 'col_pct' ||
      cfg.heatmap_metric === 'row_pct' ||
      cfg.heatmap_metric === 'count' ||
      cfg.heatmap_metric === 'value'
    ) {
      setHeatmapMetric(cfg.heatmap_metric)
    }
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

  // Load project (fast) then schema when an analysis/field tab needs it
  useEffect(() => {
    if (!surveyId) return
    api.getProject(surveyId).then(setProject).catch(() => {})
  }, [surveyId])

  useEffect(() => {
    if (!surveyId) return
    if (mode === 'home' || mode === 'workflow' || mode === 'qual') {
      setSchemaLoading(false)
      return
    }
    let cancelled = false
    initialized.current = false
    setSchemaLoading(true)
    setEnriching(false)
    setSchemaError(null)
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

    // Phase 1: fast question list — sidebar usable immediately
    async function loadLightSchema(attempt = 0) {
      try {
        const data = await api.getSchema(surveyId, completionStatus, true)
        if (cancelled) return
        setSchema(data)
        pickDefaults(data)
        setSchemaLoading(false)
        setSchemaError(null)
      } catch (err) {
        if (cancelled) return
        if (attempt < 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000))
          if (!cancelled) return loadLightSchema(attempt + 1)
          return
        }
        setSchemaError(err instanceof Error ? err.message : 'Failed to load survey')
        setSchemaLoading(false)
      }
    }

    void loadLightSchema()

    return () => { cancelled = true }
  }, [surveyId, completionStatus, schemaVersion, user?.username, mode])

  // Phase 2: full enrichment — defer on Home so opening a survey stays fast
  useEffect(() => {
    if (!surveyId || mode === 'home' || mode === 'qual') return
    let cancelled = false
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
  }, [surveyId, completionStatus, schemaVersion, mode])

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

  const showsQuestionNav = mode === 'explore'

  return (
    <div className="flex h-screen flex-col bg-[var(--canvas)]">
      <header className="shrink-0 border-b border-[var(--et-teal)]/12 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <WorkspaceSidebarToggle onClick={() => setSidebarMobileOpen(true)} />
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
            <div className="mt-0.5 hidden sm:block">
              <WorkspaceBreadcrumbs
                activeId={activeNavId}
                surveyTitle={project?.title || navTitle}
                onNavigate={(navId) => {
                  const item = WORKSPACE_NAV_ITEMS.find((row) => row.id === navId)
                  if (item) navigateToNavItem(item)
                }}
              />
            </div>
            <p className="mt-0.5 text-xs text-slate-500 sm:hidden">
              ID {surveyId}
              {schema && ` · ${schema.response_count.toLocaleString()} in sample`}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 sm:inline-flex"
            >
              <Search size={14} />
              Jump to…
              <kbd className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-400">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="inline-flex rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-slate-300 sm:hidden"
              aria-label="Jump to"
            >
              <Search size={16} />
            </button>

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
              <span className="hidden sm:inline">{isPinned(surveyId) ? 'Pinned' : 'Pin'}</span>
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
                <span className="hidden sm:inline">QC review</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarMobileOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
            onClick={() => setSidebarMobileOpen(false)}
          />
        )}
        <div
          className={`${
            sidebarMobileOpen
              ? 'fixed inset-y-0 left-0 z-50 flex pt-0 lg:relative lg:z-auto'
              : 'hidden lg:flex'
          } h-full min-h-0 shrink-0`}
        >
          <WorkspaceSidebar
            access={workflowAccess}
            studyType={studyType}
            activeId={activeNavId}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
            onNavigate={navigateToNavItem}
            onCloseMobile={() => setSidebarMobileOpen(false)}
            mobile={sidebarMobileOpen}
          />
        </div>

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
                onClose={() => setMobileNavOpen(false)}
                className="h-full min-h-0 max-h-full"
              />
            </div>
          )}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {schemaError && !schema && modeNeedsSchema(mode) && (
            <div className="p-6">
              <ErrorState message={schemaError} />
            </div>
          )}

          {schemaError && !schema && !modeNeedsSchema(mode) && (
            <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Question list is still loading in the background. Home and workflow work; analysis tabs may be limited until load finishes.
            </div>
          )}

          {mode === 'explore' && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--et-teal)]/30 bg-[var(--et-teal-light)]/40 px-2.5 py-1.5 text-xs font-semibold text-[var(--et-teal-dark)] hover:bg-[var(--et-teal-light)]/70 md:hidden"
              >
                <PanelLeft size={15} />
                {analyzeView === 'compare' ? 'Rows & banners' : 'Questions'}
              </button>
              <div className="et-segment">
                <AnalyzeViewButton
                  active={analyzeView === 'profile'}
                  onClick={() => setAnalyzeView('profile')}
                  icon={<Layers size={14} />}
                >
                  Questions
                </AnalyzeViewButton>
                <AnalyzeViewButton
                  active={analyzeView === 'compare'}
                  onClick={() => setAnalyzeView('compare')}
                  icon={<Table2 size={14} />}
                >
                  Crosstabs
                </AnalyzeViewButton>
              </div>
              {selectedVar && (
                <p className="min-w-0 flex-1 truncate text-xs text-slate-600 md:hidden">
                  <span className="font-semibold text-slate-800">{selectedVar.code}</span>
                  {' · '}
                  {selectedVar.text}
                </p>
              )}
              <p className="hidden min-w-0 flex-1 text-xs text-slate-500 sm:block">
                {analyzeView === 'profile'
                  ? 'Distributions, summary stats, and analysis setup'
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

          {mode === 'qual' && <QualPanel surveyId={surveyId} />}

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
              hideSubNav
            />
          )}

          {mode === 'reports' && (
            <ReportBuilderPanel
              surveyId={surveyId}
              surveyTitle={project?.title || navTitle}
              completionStatus={completionStatus}
              variables={activeSchema?.variables ?? []}
              filters={filters}
              filterTree={filterTree}
            />
          )}

          {mode === 'charts' && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
            </div>
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
              customVariables={customVariables}
              onSetupChanged={() => {
                invalidateProfileCache(surveyId)
                void reloadCustomVariables()
              }}
              onCreateVariable={openCreateVariableFromQuestion}
              onEditVariable={openEditVariable}
              onCompareQuestion={compareCurrentQuestion}
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
              variableFormBootstrap={variableFormBootstrap}
              variableEditBootstrap={variableEditBootstrap}
              onVariableBootstrapConsumed={() => {
                setVariableFormBootstrap(null)
                setVariableEditBootstrap(null)
              }}
              onChanged={reloadCustomVariables}
              pageTab={setupView}
              onPageTabChange={setSetupView}
              hideSubNav
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
                onOpenVariables={() => setSetupView('custom')}
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
              heatmapEnabled={heatmapEnabled}
              onHeatmapEnabledChange={setHeatmapEnabled}
              heatmapMetric={heatmapMetric}
              onHeatmapMetricChange={setHeatmapMetric}
              sigEnabled={sigEnabled}
              onSigEnabledChange={setSigEnabled}
              confidenceLevel={confidenceLevel}
              onConfidenceLevelChange={setConfidenceLevel}
              analyzing={analyzing}
              bannerProgress={bannerProgress}
              exporting={exporting}
              onRun={() => void runBanner()}
              onRunAllOnTotal={() => void runAllOnTotal()}
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
                    heatmap_enabled: heatmapEnabled,
                    heatmap_metric: heatmapMetric,
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

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        surveyId={surveyId}
        surveyTitle={project?.title || navTitle}
        access={workflowAccess}
        studyType={studyType}
      />
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
