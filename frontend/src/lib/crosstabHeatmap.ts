import type { TableCell, TableRow } from '../api/client'

export type CrosstabHeatmapMetric = 'col_pct' | 'row_pct' | 'count' | 'value'

export function cellHeatmapValue(
  cell: TableCell,
  metric: CrosstabHeatmapMetric,
  isMetric: boolean,
): number | null {
  if (isMetric || metric === 'value') {
    return cell.value != null && Number.isFinite(cell.value) ? cell.value : null
  }
  if (metric === 'count') {
    return cell.count != null && Number.isFinite(cell.count) ? cell.count : null
  }
  if (metric === 'col_pct') {
    return cell.col_pct != null && Number.isFinite(cell.col_pct) ? cell.col_pct : null
  }
  if (metric === 'row_pct') {
    return cell.row_pct != null && Number.isFinite(cell.row_pct) ? cell.row_pct : null
  }
  return null
}

export function heatmapUsesRowScale(metric: CrosstabHeatmapMetric): boolean {
  return metric === 'row_pct'
}

export function buildColumnHeatmapMaxes(
  rows: TableRow[],
  metric: CrosstabHeatmapMetric,
  isMetric: boolean,
): number[] {
  const dataRows = rows.filter((r) => !r.is_total)
  if (!dataRows.length) return []
  const colCount = Math.max(...dataRows.map((r) => r.cells.length), 0)
  const maxes = new Array(colCount).fill(0)
  for (const row of dataRows) {
    row.cells.forEach((cell, ci) => {
      const value = cellHeatmapValue(cell, metric, isMetric)
      if (value != null && value > maxes[ci]) maxes[ci] = value
    })
  }
  return maxes
}

export function buildRowHeatmapMaxes(
  rows: TableRow[],
  metric: CrosstabHeatmapMetric,
  isMetric: boolean,
): number[] {
  const dataRows = rows.filter((r) => !r.is_total)
  return dataRows.map((row) => {
    let max = 0
    for (const cell of row.cells) {
      const value = cellHeatmapValue(cell, metric, isMetric)
      if (value != null && value > max) max = value
    }
    return max
  })
}

export function heatmapCellBackground(
  value: number | null,
  max: number,
  rgb: [number, number, number],
  alpha = 0.38,
): string | undefined {
  if (value == null || max <= 0) return undefined
  const intensity = Math.min(Math.max(value / max, 0), 1)
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${intensity * alpha})`
}
