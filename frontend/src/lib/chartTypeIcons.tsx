import {
  Activity,
  BarChart2,
  BarChart3,
  CircleDot,
  Gauge,
  Grid3x3,
  Layers,
  LineChart,
  MapPin,
  PieChart,
  Radar,
  ScatterChart,
  Table2,
  TrendingUp,
  Type,
  Waves,
} from 'lucide-react'
import type { ChartTypeId } from './chartTypes'

const ICON_MAP: Partial<Record<ChartTypeId, typeof BarChart2>> = {
  bar_vertical: BarChart2,
  bar_horizontal: BarChart3,
  bar_100: Layers,
  lollipop: Activity,
  combo: TrendingUp,
  pie: PieChart,
  donut: CircleDot,
  radial_bar: CircleDot,
  funnel: TrendingUp,
  line: LineChart,
  step_line: LineChart,
  area: Waves,
  stacked_area: Layers,
  histogram: BarChart2,
  scatter_xy: ScatterChart,
  bubble: ScatterChart,
  treemap: Grid3x3,
  waterfall: BarChart3,
  boxplot: BarChart2,
  radar: Radar,
  gauge: Gauge,
  category_heatmap: Grid3x3,
  array_grid: Table2,
  array_heatmap: Grid3x3,
  numeric_summary: BarChart2,
  numeric_multi_bar: BarChart3,
  word_bar: Type,
  word_treemap: Grid3x3,
  map: MapPin,
  banner_grouped: BarChart3,
  banner_stacked: Layers,
  banner_heatmap: Grid3x3,
}

export function ChartTypeIcon({
  typeId,
  size = 18,
  className = '',
}: {
  typeId: ChartTypeId
  size?: number
  className?: string
}) {
  const Icon = ICON_MAP[typeId] ?? BarChart2
  return <Icon size={size} className={className} strokeWidth={1.75} />
}
