import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, ImageDown, Loader2, Palette, RefreshCw } from 'lucide-react'
import {
  api,
  type BannerResult,
  type FilterGroup,
  type FilterSpec,
  type ProfileResult,
  type SurveyVariable,
} from '../../api/client'
import { type ChartTypeId } from '../../lib/chartTypes'
import { CHART_PALETTES, type ChartPaletteId } from '../../lib/chartPalettes'
import {
  apiChartType,
  mergeComboLineValues,
  needsBanner as chartNeedsBanner,
  needsHistogramBins,
  needsYVariable,
} from '../../lib/chartDataHelpers'
import { chartSlotDefs } from '../../lib/chartSlots'
import type { ChartSlotId } from '../../lib/chartSlots'
import { exportChartPng, exportMapPlaceholder } from '../../lib/chartExport'
import { ChartDataMapper } from './ChartDataMapper'
import { ChartTypePicker } from './ChartTypePicker'
import { ChartVisualizer } from './ChartVisualizer'
import { FilterEditor } from './FilterEditor'
import { AnalysisBookmarkMenu } from './AnalysisBookmarkMenu'
import type { FilterPreset } from '../../api/client'
import { KindBadge } from './Results'
import { ErrorState, ChartSkeleton } from '../States'

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
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartType, setChartType] = useState<ChartTypeId>('bar_vertical')
  const [valueVariableId, setValueVariableId] = useState(selectedId ?? '')
  const [yVariableId, setYVariableId] = useState('')
  const [zVariableId, setZVariableId] = useState('')
  const [bannerVariableId, setBannerVariableId] = useState('')
  const [valueMode, setValueMode] = useState<'count' | 'percent'>('count')
  const [maxItems, setMaxItems] = useState(20)
  const [histogramBins, setHistogramBins] = useState(10)
  const [paletteId, setPaletteId] = useState<ChartPaletteId>('et_teal')
  const [colorMode, setColorMode] = useState<'single' | 'multi'>('multi')
  const [chartData, setChartData] = useState<ProfileResult | BannerResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportingPng, setExportingPng] = useState(false)
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
    () => ({ valueMode, maxItems, paletteId, colorMode }),
    [valueMode, maxItems, paletteId, colorMode],
  )

  useEffect(() => {
    if (selectedId && selectedId !== valueVariableId) {
      setValueVariableId(selectedId)
    }
  }, [selectedId])

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
  const activePalette = CHART_PALETTES.find((p) => p.id === paletteId) ?? CHART_PALETTES[0]
  const requiredSlots = chartSlotDefs(chartType).filter((s) => s.required)
  const slotsReady =
    Boolean(valueVariableId) &&
    requiredSlots.every((s) => {
      if (s.id === 'value') return Boolean(valueVariableId)
      if (s.id === 'y') return Boolean(yVariableId)
      if (s.id === 'banner') return Boolean(bannerVariableId)
      return true
    })

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

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-[var(--et-teal)]" />
              <h2 className="text-lg font-semibold text-slate-900">Charts & visualisation</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Choose a chart type first, then assign the questions for each axis or series.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadChart}
              disabled={!slotsReady || loading}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40 ${
                filtersStale ? 'bg-amber-600 ring-2 ring-amber-300' : 'bg-[var(--et-teal)]'
              }`}
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              {filtersStale ? 'Apply filters' : 'Generate'}
            </button>
            <button
              type="button"
              onClick={handleExportPng}
              disabled={!chartData || loading || exportingPng}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {exportingPng ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <ImageDown size={16} />
              )}
              Export PNG
            </button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <ChartTypePicker
                selected={chartType}
                onSelect={setChartType}
                disabled={schemaLoading}
              />

              <div className="mt-5 border-t border-slate-100 pt-5">
                <ChartDataMapper
                  chartType={chartType}
                  variables={variables}
                  slots={slotValues}
                  onSlotChange={handleSlotChange}
                  disabled={schemaLoading}
                />
              </div>

              <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                <label className="text-xs">
                  <span className="font-medium text-slate-500">Values</span>
                  <select
                    value={valueMode}
                    onChange={(e) => setValueMode(e.target.value as 'count' | 'percent')}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  >
                    <option value="count">Counts</option>
                    <option value="percent">Percentages</option>
                  </select>
                </label>

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

                <label className="text-xs">
                  <span className="flex items-center gap-1 font-medium text-slate-500">
                    <Palette size={12} /> Palette
                  </span>
                  <select
                    value={paletteId}
                    onChange={(e) => setPaletteId(e.target.value as ChartPaletteId)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  >
                    {CHART_PALETTES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1.5 flex gap-1">
                    {activePalette.colors.slice(0, 6).map((c) => (
                      <span
                        key={c}
                        className="h-3 w-3 rounded-full ring-1 ring-slate-200"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </label>

                <label className="text-xs">
                  <span className="font-medium text-slate-500">Bar colours</span>
                  <select
                    value={colorMode}
                    onChange={(e) => setColorMode(e.target.value as 'single' | 'multi')}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  >
                    <option value="multi">Multi-colour</option>
                    <option value="single">Single colour</option>
                  </select>
                </label>
              </div>
            </div>

            <AnalysisBookmarkMenu
              surveyId={surveyId}
              kind="chart"
              onSave={() => ({
                name: `Chart: ${valueVar?.code ?? 'custom'}`,
                config: {
                  chart_type: chartType,
                  value_variable_id: valueVariableId,
                  y_variable_id: yVariableId,
                  z_variable_id: zVariableId,
                  banner_variable_id: bannerVariableId,
                  value_mode: valueMode,
                  max_items: maxItems,
                  histogram_bins: histogramBins,
                  palette_id: paletteId,
                  color_mode: colorMode,
                },
              })}
              onLoad={(bm) => {
                const c = bm.config
                if (typeof c.chart_type === 'string') setChartType(c.chart_type as ChartTypeId)
                if (typeof c.value_variable_id === 'string') {
                  setValueVariableId(c.value_variable_id)
                  onVariableChange(c.value_variable_id)
                }
                if (typeof c.y_variable_id === 'string') setYVariableId(c.y_variable_id)
                if (typeof c.z_variable_id === 'string') setZVariableId(c.z_variable_id)
                if (typeof c.banner_variable_id === 'string') setBannerVariableId(c.banner_variable_id)
                if (c.value_mode === 'count' || c.value_mode === 'percent') setValueMode(c.value_mode)
                if (typeof c.max_items === 'number') setMaxItems(c.max_items)
                if (typeof c.histogram_bins === 'number') setHistogramBins(c.histogram_bins)
                if (typeof c.palette_id === 'string') setPaletteId(c.palette_id as ChartPaletteId)
                if (c.color_mode === 'single' || c.color_mode === 'multi') setColorMode(c.color_mode)
              }}
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

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4 xl:self-start">
            <div className="p-6">
              {!slotsReady && !schemaLoading && (
                <div className="mb-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Select a chart type and fill in the required variable slots to preview.
                </div>
              )}

              {valueVar && (
                <div className="mb-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <KindBadge kind={valueVar.kind} label={valueVar.type_label} />
                    <span className="text-xs text-slate-500">{valueVar.code}</span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{valueVar.text}</h3>
                  {yVar && chartType === 'combo' && (
                    <p className="mt-1 text-sm text-slate-500">
                      Line: {yVar.text}
                    </p>
                  )}
                  {chartData?.base_n != null && (
                    <p className="mt-1 text-sm text-slate-500">
                      Base: {chartData.base_n} respondents
                    </p>
                  )}
                </div>
              )}

              {loading && <ChartSkeleton />}

              {error && !loading && (
                <div className="min-h-[200px]">
                  <ErrorState message={error} />
                </div>
              )}

              {!loading && !error && chartData && slotsReady && (
                <div ref={chartRef} className="min-h-[360px] w-full">
                  <ChartVisualizer
                    chartType={chartType}
                    data={chartData}
                    options={displayOptions}
                  />
                </div>
              )}

              {!loading && !error && !chartData && slotsReady && (
                <div className="flex min-h-[280px] items-center justify-center text-sm text-slate-400">
                  Click Generate to build the chart
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
