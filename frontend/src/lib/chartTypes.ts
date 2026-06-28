import type { SurveyVariable } from '../api/client'

export type ChartCategoryId =
  | 'bars'
  | 'circular'
  | 'trend'
  | 'scatter'
  | 'distribution'
  | 'compare'
  | 'segmented'
  | 'specialty'

export type ChartTypeId =
  | 'bar_vertical'
  | 'bar_horizontal'
  | 'bar_100'
  | 'lollipop'
  | 'combo'
  | 'pie'
  | 'donut'
  | 'radial_bar'
  | 'funnel'
  | 'line'
  | 'step_line'
  | 'area'
  | 'stacked_area'
  | 'histogram'
  | 'scatter_xy'
  | 'bubble'
  | 'treemap'
  | 'waterfall'
  | 'boxplot'
  | 'radar'
  | 'gauge'
  | 'category_heatmap'
  | 'array_grid'
  | 'array_heatmap'
  | 'numeric_summary'
  | 'numeric_multi_bar'
  | 'word_bar'
  | 'word_treemap'
  | 'map'
  | 'banner_grouped'
  | 'banner_stacked'
  | 'banner_heatmap'

export type ChartTier = 'basic' | 'advanced'

export interface ChartTypeOption {
  id: ChartTypeId
  label: string
  shortLabel: string
  description: string
  category: ChartCategoryId
  kinds: string[]
  tier: ChartTier
  needsBanner?: boolean
  needsYVariable?: boolean
  needsZVariable?: boolean
  minCategories?: number
  maxCategories?: number
}

export const CHART_CATEGORIES: { id: ChartCategoryId; label: string }[] = [
  { id: 'bars', label: 'Bars' },
  { id: 'circular', label: 'Circular' },
  { id: 'trend', label: 'Trend' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'compare', label: 'Compare' },
  { id: 'segmented', label: 'Segmented' },
  { id: 'specialty', label: 'Specialty' },
]

export const CHART_TYPES: ChartTypeOption[] = [
  {
    id: 'bar_vertical',
    label: 'Vertical bar',
    shortLabel: 'Bar',
    description: 'Classic column chart for categories',
    category: 'bars',
    kinds: ['single', 'multi', 'rank', 'custom'],
    tier: 'basic',
  },
  {
    id: 'bar_horizontal',
    label: 'Horizontal bar',
    shortLabel: 'Bar (H)',
    description: 'Best when labels are long',
    category: 'bars',
    kinds: ['single', 'multi', 'rank', 'custom'],
    tier: 'basic',
  },
  {
    id: 'bar_100',
    label: '100% stacked bar',
    shortLabel: '100% Bar',
    description: 'Normalized proportions',
    category: 'bars',
    kinds: ['single', 'multi', 'rank', 'custom'],
    tier: 'advanced',
  },
  {
    id: 'lollipop',
    label: 'Lollipop chart',
    shortLabel: 'Lollipop',
    description: 'Minimal bar with emphasis dot',
    category: 'bars',
    kinds: ['single', 'multi', 'rank', 'custom'],
    tier: 'advanced',
  },
  {
    id: 'combo',
    label: 'Bar + line combo',
    shortLabel: 'Combo',
    description: 'Bars from one question, line trend from a second question',
    category: 'bars',
    kinds: ['single', 'multi', 'rank', 'custom'],
    tier: 'advanced',
    needsYVariable: true,
  },
  {
    id: 'pie',
    label: 'Pie chart',
    shortLabel: 'Pie',
    description: 'Share of total responses',
    category: 'circular',
    kinds: ['single', 'custom'],
    tier: 'basic',
    maxCategories: 12,
  },
  {
    id: 'donut',
    label: 'Donut chart',
    shortLabel: 'Donut',
    description: 'Pie with centre space',
    category: 'circular',
    kinds: ['single', 'multi', 'custom'],
    tier: 'basic',
    maxCategories: 12,
  },
  {
    id: 'radial_bar',
    label: 'Radial / rose',
    shortLabel: 'Rose',
    description: 'Circular bar lengths by category',
    category: 'circular',
    kinds: ['single', 'multi', 'rank', 'custom'],
    tier: 'advanced',
    maxCategories: 12,
  },
  {
    id: 'funnel',
    label: 'Funnel chart',
    shortLabel: 'Funnel',
    description: 'Descending stages by volume',
    category: 'circular',
    kinds: ['single', 'multi', 'rank', 'custom'],
    tier: 'advanced',
  },
  {
    id: 'line',
    label: 'Line chart',
    shortLabel: 'Line',
    description: 'Trend across answer order',
    category: 'trend',
    kinds: ['single', 'custom'],
    tier: 'basic',
  },
  {
    id: 'step_line',
    label: 'Step line',
    shortLabel: 'Step',
    description: 'Step-wise category trend',
    category: 'trend',
    kinds: ['single', 'multi', 'rank', 'custom'],
    tier: 'advanced',
  },
  {
    id: 'area',
    label: 'Area chart',
    shortLabel: 'Area',
    description: 'Filled line under categories',
    category: 'trend',
    kinds: ['single', 'custom'],
    tier: 'basic',
  },
  {
    id: 'stacked_area',
    label: 'Stacked area',
    shortLabel: 'Stack Area',
    description: 'Cumulative filled trend',
    category: 'trend',
    kinds: ['single', 'multi', 'rank', 'custom'],
    tier: 'advanced',
  },
  {
    id: 'scatter_xy',
    label: 'XY scatter',
    shortLabel: 'XY',
    description: 'Plot two variables per respondent (X vs Y)',
    category: 'scatter',
    kinds: ['single', 'multi', 'rank', 'numeric', 'custom'],
    tier: 'basic',
    needsYVariable: true,
  },
  {
    id: 'bubble',
    label: 'Bubble chart',
    shortLabel: 'Bubble',
    description: 'X and Y with optional third variable for bubble size',
    category: 'scatter',
    kinds: ['single', 'multi', 'rank', 'numeric', 'custom'],
    tier: 'basic',
    needsYVariable: true,
    needsZVariable: true,
  },
  {
    id: 'histogram',
    label: 'Histogram',
    shortLabel: 'Histogram',
    description: 'Numeric value distribution',
    category: 'distribution',
    kinds: ['numeric'],
    tier: 'basic',
  },
  {
    id: 'treemap',
    label: 'Treemap',
    shortLabel: 'Treemap',
    description: 'Nested rectangles by size',
    category: 'distribution',
    kinds: ['single', 'multi', 'rank', 'numeric', 'custom'],
    tier: 'advanced',
  },
  {
    id: 'waterfall',
    label: 'Waterfall',
    shortLabel: 'Waterfall',
    description: 'Running total by category',
    category: 'distribution',
    kinds: ['single', 'multi', 'rank', 'numeric', 'custom'],
    tier: 'advanced',
  },
  {
    id: 'boxplot',
    label: 'Box plot',
    shortLabel: 'Box plot',
    description: 'Numeric min / median / max',
    category: 'distribution',
    kinds: ['numeric'],
    tier: 'advanced',
  },
  {
    id: 'radar',
    label: 'Radar / spider',
    shortLabel: 'Radar',
    description: 'Multi-axis category profile',
    category: 'compare',
    kinds: ['single', 'multi', 'rank', 'array', 'custom'],
    tier: 'advanced',
    maxCategories: 12,
  },
  {
    id: 'gauge',
    label: 'Gauge',
    shortLabel: 'Gauge',
    description: 'Mean vs scale maximum',
    category: 'compare',
    kinds: ['numeric'],
    tier: 'advanced',
  },
  {
    id: 'numeric_summary',
    label: 'Summary stats',
    shortLabel: 'Stats',
    description: 'Mean, median, min, max cards',
    category: 'compare',
    kinds: ['numeric'],
    tier: 'basic',
  },
  {
    id: 'numeric_multi_bar',
    label: 'Subquestion means',
    shortLabel: 'Means',
    description: 'Compare numeric grid rows',
    category: 'compare',
    kinds: ['numeric'],
    tier: 'advanced',
  },
  {
    id: 'category_heatmap',
    label: 'Category heatmap',
    shortLabel: 'Heat strip',
    description: 'Single-row intensity by category',
    category: 'segmented',
    kinds: ['single', 'multi', 'rank', 'custom'],
    tier: 'advanced',
  },
  {
    id: 'banner_grouped',
    label: 'Grouped by banner',
    shortLabel: 'Grouped',
    description: 'Side-by-side banner columns',
    category: 'segmented',
    kinds: ['single', 'multi', 'rank', 'custom'],
    tier: 'advanced',
    needsBanner: true,
  },
  {
    id: 'banner_stacked',
    label: 'Stacked by banner',
    shortLabel: 'Stacked',
    description: '100% stacked banner columns',
    category: 'segmented',
    kinds: ['single', 'multi', 'custom'],
    tier: 'advanced',
    needsBanner: true,
  },
  {
    id: 'banner_heatmap',
    label: 'Banner heatmap',
    shortLabel: 'Heatmap',
    description: 'Row × banner column matrix',
    category: 'segmented',
    kinds: ['single', 'multi', 'custom'],
    tier: 'advanced',
    needsBanner: true,
  },
  {
    id: 'array_grid',
    label: 'Grid mini charts',
    shortLabel: 'Grid',
    description: 'One chart per grid row',
    category: 'specialty',
    kinds: ['array'],
    tier: 'advanced',
  },
  {
    id: 'array_heatmap',
    label: 'Array heatmap',
    shortLabel: 'Array map',
    description: 'Grid rows × answer heatmap',
    category: 'specialty',
    kinds: ['array'],
    tier: 'advanced',
  },
  {
    id: 'word_bar',
    label: 'Top words bar',
    shortLabel: 'Words',
    description: 'Most frequent open-end words',
    category: 'specialty',
    kinds: ['text'],
    tier: 'basic',
  },
  {
    id: 'word_treemap',
    label: 'Word treemap',
    shortLabel: 'Word map',
    description: 'Word frequency treemap',
    category: 'specialty',
    kinds: ['text'],
    tier: 'advanced',
  },
  {
    id: 'map',
    label: 'Location map',
    shortLabel: 'Map',
    description: 'GPS response points',
    category: 'specialty',
    kinds: ['location'],
    tier: 'basic',
  },
]

function isSimpleNumeric(variable: SurveyVariable) {
  return variable.ls_type !== 'K' && !(variable.subquestions?.length ?? 0)
}

function isNumericGrid(variable: SurveyVariable) {
  return variable.ls_type === 'K' || (variable.subquestions?.length ?? 0) > 0
}

export function chartTypesForVariable(
  variable: SurveyVariable | null,
  tier: ChartTier | 'all' = 'all',
): ChartTypeOption[] {
  if (!variable) return []
  return CHART_TYPES.filter((t) => {
    if (tier !== 'all' && t.tier !== tier) return false
    if (!t.kinds.includes(variable.kind)) return false

    if (variable.kind === 'numeric') {
      if (['numeric_multi_bar'].includes(t.id)) return isNumericGrid(variable)
      if (
        [
          'histogram',
          'scatter_xy',
          'numeric_summary',
          'boxplot',
          'gauge',
          'treemap',
          'waterfall',
          'funnel',
          'radar',
          'radial_bar',
          'lollipop',
          'combo',
          'step_line',
          'stacked_area',
          'bar_100',
          'category_heatmap',
        ].includes(t.id)
      ) {
        return isSimpleNumeric(variable)
      }
    }

    if (variable.kind === 'single' && t.id === 'histogram') return false

    if (t.id === 'radar' && variable.kind === 'array') {
      return (variable.subquestions?.length ?? 0) <= 12
    }

    return true
  })
}

export function chartTypesByCategory(
  variable: SurveyVariable | null,
  category: ChartCategoryId | 'all',
  tier: ChartTier | 'all' = 'all',
) {
  const types = chartTypesForVariable(variable, tier)
  if (category === 'all') return types
  return types.filter((t) => t.category === category)
}

export function getChartType(id: ChartTypeId): ChartTypeOption | undefined {
  return CHART_TYPES.find((t) => t.id === id)
}

export function defaultChartType(variable: SurveyVariable | null): ChartTypeId {
  if (!variable) return 'bar_vertical'
  switch (variable.kind) {
    case 'numeric':
      return isNumericGrid(variable) ? 'numeric_multi_bar' : 'histogram'
    case 'array':
      return 'array_grid'
    case 'text':
      return 'word_bar'
    case 'location':
      return 'map'
    case 'multi':
    case 'rank':
      return 'bar_horizontal'
    default:
      return 'bar_vertical'
  }
}
