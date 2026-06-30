import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import {
  api,
  type BannerResult,
  type FilterGroup,
  type FilterSpec,
  type ProfileResult,
  type SurveyVariable,
} from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { type ChartTypeId, defaultChartType } from '../../lib/chartTypes'
import { CHART_PALETTES, type ChartPaletteId, type ChartPaletteSelection, paletteSelectionFromLegacy } from '../../lib/chartPalettes'
import {
  addUserChartPalette,
  deleteUserChartPalette,
  loadUserChartPalettes,
  type UserChartPalette,
} from '../../lib/chartPaletteStore'
import {
  apiChartType,
  chartSeriesLabels,
  chartSupportsValueMode,
  mergeComboLineValues,
  needsBanner as chartNeedsBanner,
  needsHistogramBins,
  needsYVariable,
} from '../../lib/chartDataHelpers'
import { chartSlotDefs } from '../../lib/chartSlots'
import type { ChartSlotId } from '../../lib/chartSlots'
import { exportChartPng, exportChartCsv, exportMapPlaceholder } from '../../lib/chartExport'
import { ChartDataMapper } from './ChartDataMapper'
import { ChartStylePanel } from './ChartStylePanel'
import { ChartTypePicker } from './ChartTypePicker'
import { ChartVisualizer } from './ChartVisualizer'
import { FilterEditor } from './FilterEditor'
import { AnalysisBookmarkMenu } from './AnalysisBookmarkMenu'
import type { FilterPreset } from '../../api/client'
import { ChartPreviewChrome } from './ChartPreviewChrome'
import { SuggestedCharts } from './SuggestedCharts'
import { getChartType } from '../../lib/chartTypes'

interface Props {
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  groups: { id: number; title: string; variable_ids: string[] }[]
  selectedVar: SurveyVariable | null
  selectedId: string | null
  onVariableChange: (id: string) => void
  filters: FilterSpec[]
  filterTree: FilterGroup | null
  onFiltersChange: (filters: FilterSpec[]) => void
  onFilterTreeChange: (tree: FilterGroup | null) => void
  schemaLoading: boolean
  onPresetApply?: (preset: FilterPreset) => void
  initialChartType?: ChartTypeId | null
  onInitialChartTypeConsumed?: () => void
}

function varSummary(v: SurveyVariable) {
  return {
    id: v.id,
    code: v.code,
    text: v.text,
    kind: v.kind,
    type_label: v.type_label,
  }
}

export function ChartsPanel({
  surveyId,
  completionStatus,
  variables,
  selectedId,
  onVariableChange,
  filters,
  filterTree,
  onFiltersChange,
  onFilterTreeChange,
  schemaLoading,
  onPresetApply,
  initialChartType,
  onInitialChartTypeConsumed,
}: Props) {
  const { user } = useAuth()
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartType, setChartType] = useState<ChartTypeId>(initialChartType ?? 'bar_vertical')
  const [valueVariableId, setValueVariableId] = useState(selectedId ?? '')
  const [yVariableId, setYVariableId] = useState('')
  const [zVariableId, setZVariableId] = useState('')
  const [bannerVariableId, setBannerVariableId] = useState('')
  const [valueMode, setValueMode] = useState<'count' | 'percent'>('percent')
  const [showDataLabels, setShowDataLabels] = useState(true)
  const [maxItems, setMaxItems] = useState(20)
  const [histogramBins, setHistogramBins] = useState(10)
  const [paletteSelection, setPaletteSelection] = useState<ChartPaletteSelection>('et_teal')
  const [colorMode, setColorMode] = useState<'single' | 'multi'>('multi')
  const [primaryColor, setPrimaryColor] = useState(CHART_PALETTES[0].colors[0])
  const [seriesColors, setSeriesColors] = useState<string[]>([])
  const [chartTitle, setChartTitle] = useState('')
  const [showLegend, setShowLegend] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [userPalettes, setUserPalettes] = useState<UserChartPalette[]>([])
  const [chartData, setChartData] = useState<ProfileResult | BannerResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportingPng, setExportingPng] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [filtersStale, setFiltersStale] = useState(false)
  const chartAbort = useRef<AbortController | null>(null)
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const filterTreeRef = useRef(filterTree)
  filterTreeRef.current = filterTree

  const valueVar = useMemo(
    () => variables.find((v) => v.id === valueVariableId) ?? null,
    [variables, valueVariableId],
  )

  const yVar = useMemo(
    () => variables.find((v) => v.id === yVariableId) ?? null,
    [variables, yVariableId],
  )

  const slotValues = useMemo(
    () => ({
      value: valueVariableId,
      y: yVariableId,
      z: zVariableId,
      banner: bannerVariableId,
    }),
    [valueVariableId, yVariableId, zVariableId, bannerVariableId],
  )

  const displayOptions = useMemo(
    () => ({
      valueMode,
      maxItems,
      paletteId: (paletteSelection.startsWith('user:') ? 'et_teal' : paletteSelection) as ChartPaletteId,
      paletteSelection,
      colorMode,
      showDataLabels,
      primaryColor,
      seriesColors: seriesColors.length ? seriesColors : undefined,
      chartTitle: chartTitle.trim() || undefined,
      showLegend,
      showGrid,
      userPalettes,
    }),
    [
      valueMode,
      maxItems,
      paletteSelection,
      colorMode,
      showDataLabels,
      primaryColor,
      seriesColors,
      chartTitle,
      showLegend,
      showGrid,
      userPalettes,
    ],
  )

  const valueModeSupported = chartSupportsValueMode(chartType)

  const seriesLabels = useMemo(
    () => chartSeriesLabels(chartData, maxItems),
    [chartData, maxItems],
  )

  useEffect(() => {
    if (!user?.username) {
      setUserPalettes([])
      return
    }
    setUserPalettes(loadUserChartPalettes(user.username))
  }, [user?.username])

  useEffect(() => {
    if (selectedId && selectedId !== valueVariableId) {
      setValueVariableId(selectedId)
    }
  }, [selectedId])

  useEffect(() => {
    if (!initialChartType) return
    setChartType(initialChartType)
    onInitialChartTypeConsumed?.()
  }, [initialChartType, onInitialChartTypeConsumed])

  useEffect(() => {
    if (!valueVar || initialChartType) return
    setChartType(defaultChartType(valueVar))
  }, [valueVar?.id, valueVar?.kind, initialChartType])

  useEffect(() => {
    setYVariableId('')
    setZVariableId('')
    setBannerVariableId('')
  }, [chartType])

  useEffect(() => {
    setFiltersStale(true)
  }, [filters, filterTree])

  const handleSlotChange = useCallback(
    (slot: ChartSlotId, id: string) => {
      if (slot === 'value') {
        setValueVariableId(id)
        if (id) onVariableChange(id)
      } else if (slot === 'y') {
        setYVariableId(id)
        if (id === zVariableId) setZVariableId('')
      } else if (slot === 'z') {
        setZVariableId(id)
      } else if (slot === 'banner') {
        setBannerVariableId(id)
      }
    },
    [onVariableChange, zVariableId],
  )

  const loadChart = useCallback(async () => {
    if (!valueVar) return
    chartAbort.current?.abort()
    const ctrl = new AbortController()
    chartAbort.current = ctrl
    setLoading(true)
    setError(null)

    try {
      const needsBannerVar = chartNeedsBanner(chartType)
      if (needsBannerVar && !bannerVariableId) {
        setError('Select a banner variable for segmented charts')
        setChartData(null)
        setLoading(false)
        return
      }

      if (needsYVariable(chartType) && !yVariableId) {
        setError(
          chartType === 'combo'
            ? 'Select a line series variable for the combo chart'
            : 'Select a Y-axis variable for scatter / bubble charts',
        )
        setChartData(null)
        setLoading(false)
        return
      }

      const baseQuery = {
        completionStatus,
        filters: filtersRef.current,
        filterTree: filterTreeRef.current,
        chartType: apiChartType(chartType, valueVar.kind, {
          y: yVariableId || undefined,
          z: zVariableId || undefined,
        }),
        bins: histogramBins,
        bannerVariableId: needsBannerVar ? bannerVariableId : undefined,
        yVariableId: yVariableId || undefined,
        zVariableId: zVariableId || undefined,
      }

      if (chartType === 'combo' && yVariableId) {
        const [primary, secondary] = await Promise.all([
          api.runChart(
            surveyId,
            { ...baseQuery, variableId: valueVar.id, chartType: 'auto' },
            ctrl.signal,
          ),
          api.runChart(
            surveyId,
            { ...baseQuery, variableId: yVariableId, chartType: 'auto' },
            ctrl.signal,
          ),
        ])
        if (ctrl.signal.aborted) return
        const merged = mergeComboLineValues(
          primary.values ?? [],
          secondary.values ?? [],
          maxItems,
        )
        setChartData({
          ...primary,
          values: merged.bars,
          line_values: merged.line,
          y_variable: yVar ? varSummary(yVar) : undefined,
          chart_type: chartType,
        })
        setFiltersStale(false)
        return
      }

      const result = await api.runChart(
        surveyId,
        { ...baseQuery, variableId: valueVar.id },
        ctrl.signal,
      )
      if (ctrl.signal.aborted) return
      if (
        result.error &&
        !result.values &&
        !result.headers &&
        !result.points &&
        !result.scatter_points
      ) {
        setError(result.error)
        setChartData(null)
      } else {
        setChartData(result)
        setFiltersStale(false)
      }
    } catch (err) {
      if (ctrl.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Chart failed')
      setChartData(null)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [
    surveyId,
    valueVar,
    yVar,
    completionStatus,
    chartType,
    histogramBins,
    bannerVariableId,
    yVariableId,
    zVariableId,
    maxItems,
  ])

  useEffect(() => {
    if (!valueVar || schemaLoading) return
    const timer = window.setTimeout(loadChart, 400)
    return () => window.clearTimeout(timer)
  }, [
    valueVar?.id,
    schemaLoading,
    loadChart,
    chartType,
    bannerVariableId,
    yVariableId,
    zVariableId,
    histogramBins,
  ])

  useEffect(() => () => chartAbort.current?.abort(), [])

  const slug = valueVar?.code?.replace(/\W+/g, '_') || 'chart'
  const requiredSlots = chartSlotDefs(chartType).filter((s) => s.required)
  const slotsReady =
    Boolean(valueVariableId) &&
    requiredSlots.every((s) => {
      if (s.id === 'value') return Boolean(valueVariableId)
      if (s.id === 'y') return Boolean(yVariableId)
      if (s.id === 'banner') return Boolean(bannerVariableId)
      return true
    })

  async function handleExportCsv() {
    if (!chartData) return
    setExportingCsv(true)
    try {
      exportChartCsv(chartData, `${slug}_${chartType}.csv`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'CSV export failed')
    } finally {
      setExportingCsv(false)
    }
  }

  async function handleExportPng() {
    if (chartType === 'map') {
      alert(exportMapPlaceholder.message)
      return
    }
    setExportingPng(true)
    try {
      await exportChartPng(chartRef.current, `${slug}_${chartType}.png`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExportingPng(false)
    }
  }

  const bookmarkConfig = useMemo(
    () => ({
      chart_type: chartType,
      value_variable_id: valueVariableId,
      y_variable_id: yVariableId,
      z_variable_id: zVariableId,
      banner_variable_id: bannerVariableId,
      value_mode: valueMode,
      show_data_labels: showDataLabels,
      max_items: maxItems,
      histogram_bins: histogramBins,
      palette_selection: paletteSelection,
      palette_id: paletteSelection.startsWith('user:') ? 'et_teal' : paletteSelection,
      color_mode: colorMode,
      primary_color: primaryColor,
      series_colors: seriesColors,
      chart_title: chartTitle,
      show_legend: showLegend,
      show_grid: showGrid,
    }),
    [
      chartType,
      valueVariableId,
      yVariableId,
      zVariableId,
      bannerVariableId,
      valueMode,
      showDataLabels,
      maxItems,
      histogramBins,
      paletteSelection,
      colorMode,
      primaryColor,
      seriesColors,
      chartTitle,
      showLegend,
      showGrid,
    ],
  )

  function loadBookmark(c: Record<string, unknown>) {
    if (typeof c.chart_type === 'string') setChartType(c.chart_type as ChartTypeId)
    if (typeof c.value_variable_id === 'string') {
      setValueVariableId(c.value_variable_id)
      onVariableChange(c.value_variable_id)
    }
    if (typeof c.y_variable_id === 'string') setYVariableId(c.y_variable_id)
    if (typeof c.z_variable_id === 'string') setZVariableId(c.z_variable_id)
    if (typeof c.banner_variable_id === 'string') setBannerVariableId(c.banner_variable_id)
    if (c.value_mode === 'count' || c.value_mode === 'percent') setValueMode(c.value_mode)
    if (typeof c.show_data_labels === 'boolean') setShowDataLabels(c.show_data_labels)
    if (typeof c.max_items === 'number') setMaxItems(c.max_items)
    if (typeof c.histogram_bins === 'number') setHistogramBins(c.histogram_bins)
    if (typeof c.palette_selection === 'string') {
      setPaletteSelection(paletteSelectionFromLegacy(c.palette_selection))
    } else if (typeof c.palette_id === 'string') {
      setPaletteSelection(paletteSelectionFromLegacy(c.palette_id))
    }
    if (c.color_mode === 'single' || c.color_mode === 'multi') setColorMode(c.color_mode)
    if (typeof c.primary_color === 'string') setPrimaryColor(c.primary_color)
    if (Array.isArray(c.series_colors)) {
      setSeriesColors(c.series_colors.filter((x): x is string => typeof x === 'string'))
    }
    if (typeof c.chart_title === 'string') setChartTitle(c.chart_title)
    if (typeof c.show_legend === 'boolean') setShowLegend(c.show_legend)
    if (typeof c.show_grid === 'boolean') setShowGrid(c.show_grid)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--canvas-subtle)]">
      <header className="shrink-0 border-b border-slate-200/80 bg-white px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]">
              <BarChart3 size={18} />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 sm:text-lg">Chart studio</h2>
              <p className="text-xs text-slate-500">Publication-ready visuals from your survey data</p>
            </div>
          </div>
          <AnalysisBookmarkMenu
            surveyId={surveyId}
            kind="chart"
            onSave={() => ({ name: `Chart: ${valueVar?.code ?? 'custom'}`, config: bookmarkConfig })}
            onLoad={(bm) => loadBookmark(bm.config)}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="w-full shrink-0 overflow-y-auto border-b border-slate-200/80 bg-white lg:w-[min(100%,22rem)] lg:border-b-0 lg:border-r xl:w-96">
          <div className="space-y-4 p-4">
            {valueVar && (
              <SuggestedCharts
                variable={valueVar}
                selectedChartType={chartType}
                onSelectChart={setChartType}
              />
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <ChartTypePicker
                selected={chartType}
                onSelect={setChartType}
                disabled={schemaLoading}
                variable={valueVar}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <ChartDataMapper
                chartType={chartType}
                variables={variables}
                slots={slotValues}
                onSlotChange={handleSlotChange}
                disabled={schemaLoading}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                <span className="font-medium text-slate-500">Max categories</span>
                <select
                  value={maxItems}
                  onChange={(e) => setMaxItems(Number(e.target.value))}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                >
                  {[10, 15, 20, 30, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              {valueVar &&
                needsHistogramBins(chartType, valueVar.kind, { y: yVariableId || undefined }) && (
                  <label className="text-xs">
                    <span className="font-medium text-slate-500">Histogram bins</span>
                    <select
                      value={histogramBins}
                      onChange={(e) => setHistogramBins(Number(e.target.value))}
                      className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                    >
                      {[5, 8, 10, 15, 20, 30].map((n) => (
                        <option key={n} value={n}>
                          {n} bins
                        </option>
                      ))}
                    </select>
                  </label>
                )}
            </div>

            <ChartStylePanel
              paletteSelection={paletteSelection}
              onPaletteSelectionChange={setPaletteSelection}
              colorMode={colorMode}
              onColorModeChange={setColorMode}
              primaryColor={primaryColor}
              onPrimaryColorChange={setPrimaryColor}
              seriesColors={seriesColors}
              onSeriesColorsChange={setSeriesColors}
              seriesLabels={seriesLabels}
              chartTitle={chartTitle}
              onChartTitleChange={setChartTitle}
              showLegend={showLegend}
              onShowLegendChange={setShowLegend}
              showGrid={showGrid}
              onShowGridChange={setShowGrid}
              userPalettes={userPalettes}
              onSavePalette={(name, colors) => {
                if (!user?.username) return
                const saved = addUserChartPalette(user.username, { label: name, colors })
                setUserPalettes(loadUserChartPalettes(user.username))
                setPaletteSelection(`user:${saved.id}`)
                setSeriesColors([])
              }}
              onDeletePalette={(id) => {
                if (!user?.username) return
                deleteUserChartPalette(user.username, id)
                setUserPalettes(loadUserChartPalettes(user.username))
                if (paletteSelection === `user:${id}`) setPaletteSelection('et_teal')
              }}
              onResetSeriesColors={() => setSeriesColors([])}
            />

            <FilterEditor
              surveyId={surveyId}
              completionStatus={completionStatus}
              variables={variables}
              filters={filters}
              filterTree={filterTree}
              onChange={onFiltersChange}
              onFilterTreeChange={onFilterTreeChange}
              showPresets={Boolean(onPresetApply)}
              onPresetApply={onPresetApply}
              compact
            />
          </div>
        </aside>

        <main className="flex min-h-[28rem] min-w-0 flex-1 flex-col lg:min-h-0">
          <ChartPreviewChrome
            valueVar={valueVar}
            yVar={yVar}
            chartType={chartType}
            chartTitle={chartTitle}
            baseN={chartData?.base_n}
            categoryCount={seriesLabels.length}
            loading={loading}
            error={error}
            hasData={Boolean(chartData)}
            slotsReady={slotsReady}
            schemaLoading={schemaLoading}
            filtersStale={filtersStale}
            valueModeSupported={valueModeSupported}
            valueMode={valueMode}
            onValueModeChange={setValueMode}
            showDataLabels={showDataLabels}
            onShowDataLabelsChange={setShowDataLabels}
            onRefresh={loadChart}
            onExportCsv={handleExportCsv}
            onExportPng={handleExportPng}
            exportingCsv={exportingCsv}
            exportingPng={exportingPng}
          >
            <div ref={chartRef} className="w-full">
              {displayOptions.chartTitle && valueVar && (
                <h4 className="mb-4 text-center font-display text-base font-semibold text-slate-800">
                  {displayOptions.chartTitle}
                </h4>
              )}
              <ChartVisualizer chartType={chartType} data={chartData!} options={displayOptions} />
              {getChartType(chartType)?.description && (
                <p className="mt-4 text-center text-[11px] text-slate-400">
                  {getChartType(chartType)?.description}
                </p>
              )}
            </div>
          </ChartPreviewChrome>
        </main>
      </div>
    </div>
  )
}
