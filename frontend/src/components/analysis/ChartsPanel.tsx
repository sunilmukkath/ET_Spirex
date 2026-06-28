import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, ImageDown, Loader2, Palette, RefreshCw } from 'lucide-react'
import {
  api,
  type BannerResult,
  type FilterSpec,
  type ProfileResult,
  type SurveyVariable,
} from '../../api/client'
import {
  chartTypesForVariable,
  defaultChartType,
  type ChartTypeId,
} from '../../lib/chartTypes'
import { CHART_PALETTES, type ChartPaletteId } from '../../lib/chartPalettes'
import {
  apiChartType,
  needsBanner as chartNeedsBanner,
  needsHistogramBins,
  needsYVariable,
  needsZVariable,
  scatterAxisVariables,
} from '../../lib/chartDataHelpers'
import { exportChartPng, exportMapPlaceholder } from '../../lib/chartExport'
import { ChartTypePicker } from './ChartTypePicker'
import { ChartVariablePicker } from './ChartVariablePicker'
import { ChartVisualizer } from './ChartVisualizer'
import { FilterEditor } from './FilterEditor'
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
  onFiltersChange: (filters: FilterSpec[]) => void
  schemaLoading: boolean
}

export function ChartsPanel({
  surveyId,
  completionStatus,
  variables,
  groups,
  selectedVar,
  selectedId,
  onVariableChange,
  filters,
  onFiltersChange,
  schemaLoading,
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartType, setChartType] = useState<ChartTypeId>('bar_vertical')
  const [bannerVariableId, setBannerVariableId] = useState('')
  const [yVariableId, setYVariableId] = useState('')
  const [zVariableId, setZVariableId] = useState('')
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

  const axisVariableOptions = useMemo(
    () => scatterAxisVariables(variables, [selectedVar?.id ?? '']),
    [variables, selectedVar?.id],
  )

  const sizeVariableOptions = useMemo(
    () => scatterAxisVariables(variables, [selectedVar?.id ?? '', yVariableId]),
    [variables, selectedVar?.id, yVariableId],
  )

  const showYAxisPicker = needsYVariable(chartType)
  const showZAxisPicker = needsZVariable(chartType)

  useEffect(() => {
    if (!showYAxisPicker) setYVariableId('')
    if (!showZAxisPicker) setZVariableId('')
  }, [showYAxisPicker, showZAxisPicker])

  const bannerOptions = useMemo(
    () => variables.filter((v) => v.can_banner && ['single', 'multi'].includes(v.kind)),
    [variables],
  )

  const availableChartTypes = useMemo(
    () => chartTypesForVariable(selectedVar, 'all'),
    [selectedVar],
  )

  const displayOptions = useMemo(
    () => ({ valueMode, maxItems, paletteId, colorMode }),
    [valueMode, maxItems, paletteId, colorMode],
  )

  useEffect(() => {
    if (!selectedVar) return
    setChartType((current) => {
      const available = chartTypesForVariable(selectedVar, 'all')
      if (available.some((t) => t.id === current)) return current
      return defaultChartType(selectedVar)
    })
  }, [selectedVar?.id, selectedVar])

  useEffect(() => {
    if (!availableChartTypes.some((t) => t.id === chartType) && availableChartTypes.length > 0) {
      setChartType(availableChartTypes[0].id)
    }
  }, [availableChartTypes, chartType])

  useEffect(() => {
    setFiltersStale(true)
  }, [filters])

  const loadChart = useCallback(async () => {
    if (!selectedVar) return
    chartAbort.current?.abort()
    const ctrl = new AbortController()
    chartAbort.current = ctrl
    setLoading(true)
    setError(null)
    try {
      const needsBannerVar = chartNeedsBanner(chartType)
      if (needsBannerVar && !bannerVariableId) {
        setError('Select a banner variable below for heatmap / grouped / stacked charts')
        setChartData(null)
        setLoading(false)
        return
      }

      if (needsYVariable(chartType) && !yVariableId) {
        setError('Select a Y-axis variable for XY scatter / bubble charts')
        setChartData(null)
        setLoading(false)
        return
      }

      const result = await api.runChart(
        surveyId,
        {
          variableId: selectedVar.id,
          completionStatus,
          filters: filtersRef.current,
          chartType: apiChartType(chartType, selectedVar.kind, {
            y: yVariableId || undefined,
            z: zVariableId || undefined,
          }),
          bins: histogramBins,
          bannerVariableId: needsBannerVar ? bannerVariableId : undefined,
          yVariableId: yVariableId || undefined,
          zVariableId: zVariableId || undefined,
        },
        ctrl.signal,
      )
      if (ctrl.signal.aborted) return
      if (result.error && !result.values && !result.headers && !result.points && !result.scatter_points) {
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
    selectedVar,
    completionStatus,
    chartType,
    histogramBins,
    bannerVariableId,
    yVariableId,
    zVariableId,
  ])

  useEffect(() => {
    if (!selectedVar || schemaLoading) return
    const timer = window.setTimeout(loadChart, 400)
    return () => window.clearTimeout(timer)
  }, [
    selectedVar?.id,
    schemaLoading,
    loadChart,
    chartType,
    bannerVariableId,
    yVariableId,
    zVariableId,
    histogramBins,
    surveyId,
    completionStatus,
  ])

  useEffect(() => () => chartAbort.current?.abort(), [])

  const slug = selectedVar?.code?.replace(/\W+/g, '_') || 'chart'
  const activePalette = CHART_PALETTES.find((p) => p.id === paletteId) ?? CHART_PALETTES[0]

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
              Pick a question, choose a chart type, and the chart appears below.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadChart}
              disabled={!selectedVar || loading}
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

        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <ChartVariablePicker
            variables={variables}
            groups={groups}
            selectedId={selectedId}
            onSelect={onVariableChange}
            disabled={schemaLoading}
          />
        </div>

        {selectedVar && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <ChartTypePicker
                  types={availableChartTypes}
                  variable={selectedVar}
                  selected={chartType}
                  onSelect={setChartType}
                  disabled={schemaLoading}
                  bannerSelected={Boolean(bannerVariableId)}
                />

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

              {selectedVar && needsHistogramBins(chartType, selectedVar.kind, { y: yVariableId || undefined }) && (
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

              {availableChartTypes.some((t) => t.needsBanner) && (
                <label className="text-xs">
                  <span className="font-medium text-slate-500">Banner (segmentation)</span>
                  <select
                    value={bannerVariableId}
                    onChange={(e) => setBannerVariableId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {bannerOptions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.text || v.code}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {showYAxisPicker && (
                <label className="text-xs sm:col-span-2">
                  <span className="font-medium text-slate-500">Y axis variable</span>
                  <select
                    value={yVariableId}
                    onChange={(e) => {
                      setYVariableId(e.target.value)
                      if (e.target.value === zVariableId) setZVariableId('')
                    }}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  >
                    <option value="">Select Y variable…</option>
                    {axisVariableOptions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.text || v.code}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {showZAxisPicker && (
                <label className="text-xs sm:col-span-2">
                  <span className="font-medium text-slate-500">Size variable (optional)</span>
                  <select
                    value={zVariableId}
                    onChange={(e) => setZVariableId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  >
                    <option value="">Uniform size</option>
                    {sizeVariableOptions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.text || v.code}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {(showYAxisPicker || showZAxisPicker) && (
                <p className="text-xs text-slate-400 sm:col-span-2">
                  X axis uses the primary question above. Each point is one respondent with valid
                  values on both axes
                  {showZAxisPicker ? ' (and size when selected)' : ''}.
                </p>
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

              <FilterEditor
                surveyId={surveyId}
                completionStatus={completionStatus}
                variables={variables}
                filters={filters}
                onChange={onFiltersChange}
                compact
              />
            </div>

            {/* Chart display — sticky on wide screens */}
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4 xl:self-start">
              <div className="p-6">
                <div className="mb-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <KindBadge kind={selectedVar.kind} label={selectedVar.type_label} />
                    <span className="text-xs text-slate-500">{selectedVar.code}</span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{selectedVar.text}</h3>
                  {chartData?.base_n != null && (
                    <p className="mt-1 text-sm text-slate-500">
                      Base: {chartData.base_n} respondents
                    </p>
                  )}
                </div>

                {loading && (
                  <ChartSkeleton />
                )}

                {error && !loading && (
                  <div className="min-h-[200px]">
                    <ErrorState message={error} />
                  </div>
                )}

                {!loading && !error && chartData && (
                  <div ref={chartRef} className="min-h-[360px] w-full">
                    <ChartVisualizer
                      chartType={chartType}
                      data={chartData}
                      options={displayOptions}
                    />
                  </div>
                )}

                {!loading && !error && !chartData && (
                  <div className="flex min-h-[280px] items-center justify-center text-sm text-slate-400">
                    Click Generate to build the chart
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {!selectedVar && !schemaLoading && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col items-center justify-center px-6 py-24 text-center text-slate-500">
              <BarChart3 size={48} className="mb-3 text-slate-300" />
              <p className="font-medium">Choose a question to see your chart here</p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
