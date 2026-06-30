import type { BannerResult, ProfileResult, SurveyVariable } from '../api/client'
import type { ChartPaletteId, ChartPaletteSelection } from './chartPalettes'
import type { ChartTypeId } from './chartTypes'

export interface ChartDisplayOptions {
  valueMode: 'count' | 'percent'
  maxItems: number
  paletteId: ChartPaletteId
  paletteSelection?: ChartPaletteSelection
  colorMode: 'single' | 'multi'
  showDataLabels: boolean
  primaryColor?: string
  seriesColors?: string[]
  chartTitle?: string
  showLegend: boolean
  showGrid: boolean
  /** Runtime only — used to resolve custom palette ids. */
  userPalettes?: import('./chartPaletteStore').UserChartPalette[]
}

const VALUE_MODE_EXCLUDED: ChartTypeId[] = [
  'map',
  'numeric_summary',
  'boxplot',
  'gauge',
  'bar_100',
  'word_bar',
  'word_treemap',
  'array_heatmap',
  'banner_heatmap',
]

export function chartSeriesLabels(
  data: ProfileResult | BannerResult | null,
  maxItems: number,
): string[] {
  if (!data || data.error) return []
  if ('headers' in data && data.headers?.length && data.rows?.length) {
    return (data.headers ?? []).slice(0, maxItems).map((h) => h.label)
  }
  if ('values' in data && data.values?.length) {
    return data.values.slice(0, maxItems).map((v) => v.label || v.code || '')
  }
  if ('sections' in data && data.sections?.length) {
    return data.sections.slice(0, maxItems).map((s) => s.subquestion || 'Item')
  }
  if ('top_words' in data && data.top_words?.length) {
    return data.top_words.slice(0, maxItems).map((w) => w.word)
  }
  return []
}

export function chartSupportsValueMode(chartType: ChartTypeId): boolean {
  return !VALUE_MODE_EXCLUDED.includes(chartType)
}

export interface ValueRow {
  label: string
  code?: string
  count: number
  percentage: number
}

export interface ChartRow {
  name: string
  fullLabel: string
  value: number
  count: number
  pct: number
}

export function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export function sliceValues(values: ValueRow[], maxItems: number) {
  return values.slice(0, maxItems)
}

export function toChartRows(values: ValueRow[], options: ChartDisplayOptions): ChartRow[] {
  return sliceValues(values, options.maxItems).map((v) => ({
    name: truncate(v.label || v.code || '', 24),
    fullLabel: v.label || v.code || '',
    value: options.valueMode === 'percent' ? v.percentage : v.count,
    count: v.count,
    pct: v.percentage,
  }))
}

export function normalizePercentages(values: ValueRow[]): ValueRow[] {
  const total = values.reduce((s, v) => s + v.count, 0)
  if (!total) return values
  return values.map((v) => ({
    ...v,
    percentage: Math.round((1000 * v.count) / total) / 10,
  }))
}

export function wordsAsValues(profile: ProfileResult, maxItems: number): ValueRow[] {
  const words = (profile.top_words ?? []).slice(0, maxItems)
  const total = words.reduce((s, w) => s + w.count, 0) || 1
  return words.map((w) => ({
    label: w.word,
    code: w.word,
    count: w.count,
    percentage: Math.round((1000 * w.count) / total) / 10,
  }))
}

export function funnelRows(values: ValueRow[], options: ChartDisplayOptions): ChartRow[] {
  return [...toChartRows(values, options)].sort((a, b) => b.value - a.value)
}

export function waterfallRows(values: ValueRow[], options: ChartDisplayOptions) {
  const rows = toChartRows(values, options)
  let cumulative = 0
  return rows.map((row, i) => {
    const start = cumulative
    cumulative += row.value
    return {
      ...row,
      start,
      end: cumulative,
      step: row.value,
      isTotal: i === rows.length - 1,
    }
  })
}

export function treemapNodes(values: ValueRow[], options: ChartDisplayOptions) {
  return sliceValues(values, options.maxItems).map((v, i) => ({
    name: truncate(v.label || v.code || '', 32),
    fullLabel: v.label || v.code || '',
    size: Math.max(v.count, 1),
    count: v.count,
    pct: v.percentage,
    index: i,
  }))
}

export function radarRows(values: ValueRow[], options: ChartDisplayOptions) {
  return sliceValues(values, Math.min(options.maxItems, 12)).map((v) => ({
    subject: truncate(v.label || v.code || '', 18),
    fullLabel: v.label || v.code || '',
    value: options.valueMode === 'percent' ? v.percentage : v.count,
    count: v.count,
  }))
}

export function apiChartType(
  chartType: string,
  kind: string,
  axisVars?: { y?: string; z?: string },
): string {
  if (['scatter_xy', 'bubble'].includes(chartType) && axisVars?.y) {
    return chartType
  }
  if (kind === 'numeric') {
    if (
      [
        'scatter_xy',
        'bubble',
        'boxplot',
        'waterfall',
        'treemap',
        'funnel',
        'radar',
        'radial_bar',
        'lollipop',
        'combo',
        'step_line',
        'stacked_area',
        'bar_100',
        'category_heatmap',
      ].includes(chartType)
    ) {
      return 'histogram'
    }
    if (chartType === 'histogram' || chartType === 'gauge') return 'histogram'
    if (chartType === 'numeric_summary') return 'auto'
  }
  if (['banner_grouped', 'banner_stacked', 'banner_heatmap'].includes(chartType)) {
    return chartType
  }
  return chartType === 'array_heatmap' ? 'array_grid' : chartType
}

export function needsBanner(chartType: string) {
  return ['banner_grouped', 'banner_stacked', 'banner_heatmap'].includes(chartType)
}

export function needsYVariable(chartType: string) {
  return chartType === 'scatter_xy' || chartType === 'bubble' || chartType === 'combo'
}

export function needsZVariable(chartType: string) {
  return chartType === 'bubble'
}

export function mergeComboLineValues(
  primary: { code: string; label: string; count: number; percentage: number }[],
  secondary: { code: string; label: string; count: number; percentage: number }[],
  maxItems: number,
) {
  const bars = primary.slice(0, maxItems)
  const byCode = new Map(secondary.map((v) => [v.code, v]))
  const byLabel = new Map(secondary.map((v) => [v.label, v]))
  const line = bars.map((p, i) => {
    const match =
      byCode.get(p.code) ?? byLabel.get(p.label) ?? secondary[i]
    return match ?? { code: p.code, label: p.label, count: 0, percentage: 0 }
  })
  return { bars, line }
}

export function scatterAxisVariables(variables: SurveyVariable[], excludeIds: string[] = []) {
  const excluded = new Set(excludeIds.filter(Boolean))
  return variables.filter(
    (v) =>
      !excluded.has(v.id) &&
      ['numeric', 'single', 'multi', 'rank', 'custom'].includes(v.kind),
  )
}

export function needsHistogramBins(
  chartType: string,
  kind: string,
  axisVars?: { y?: string },
) {
  if (['scatter_xy', 'bubble'].includes(chartType) && axisVars?.y) {
    return false
  }
  return (
    kind === 'numeric' &&
    (chartType === 'histogram' ||
      [
        'scatter_xy',
        'bubble',
        'boxplot',
        'waterfall',
        'treemap',
        'funnel',
        'radar',
        'radial_bar',
        'lollipop',
        'combo',
        'step_line',
        'stacked_area',
        'bar_100',
        'category_heatmap',
      ].includes(chartType))
  )
}
