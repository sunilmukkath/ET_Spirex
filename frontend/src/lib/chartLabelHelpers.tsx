import type { PieLabelRenderProps } from 'recharts'
import type { ChartDisplayOptions } from './chartDataHelpers'

/** Compact percentage for chart labels (e.g. 24%, 4.5%, 0.8%). */
export function formatChartPct(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 10) return `${Math.round(value)}%`
  if (value > 0) return `${value.toFixed(1)}%`
  return '0%'
}

export function formatChartCount(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`
  return value.toLocaleString()
}

export function chartValueLabel(
  count: number | undefined,
  pct: number | undefined,
  valueMode: ChartDisplayOptions['valueMode'],
): string {
  return valueMode === 'percent' ? formatChartPct(pct) : formatChartCount(count)
}

export function shouldShowDataLabel(
  count: number | undefined,
  pct: number | undefined,
  valueMode: ChartDisplayOptions['valueMode'],
): boolean {
  if (valueMode === 'percent') return (pct ?? 0) >= 2
  return (count ?? 0) > 0 && (pct ?? 0) >= 1.5
}

type BarLabelProps = {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  payload?: { pct?: number; count?: number }
  layout?: 'vertical' | 'horizontal'
  valueMode?: ChartDisplayOptions['valueMode']
  show?: boolean
}

function num(value: number | string | undefined, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? (n as number) : fallback
}

/** Bar label — shows count or % based on display mode. */
export function BarValueLabel(props: BarLabelProps) {
  const { payload, layout = 'vertical', valueMode = 'percent', show = true } = props
  if (!show) return null

  const count = payload?.count
  const pct = payload?.pct
  if (!shouldShowDataLabel(count, pct, valueMode)) return null

  const label = chartValueLabel(count, pct, valueMode)

  const x = num(props.x)
  const y = num(props.y)
  const width = num(props.width)
  const height = num(props.height)

  if (layout === 'horizontal') {
    if (width < 24) return null
    return (
      <text
        x={x + width + 6}
        y={y + height / 2}
        dy={4}
        fill="#334155"
        fontSize={10}
        fontWeight={600}
        className="tabular-nums"
      >
        {label}
      </text>
    )
  }

  const cx = x + width / 2
  if (height >= 22) {
    return (
      <text
        x={cx}
        y={y + 14}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={10}
        fontWeight={600}
        className="tabular-nums"
        style={{ paintOrder: 'stroke', stroke: 'rgba(15,23,42,0.35)', strokeWidth: 2 }}
      >
        {label}
      </text>
    )
  }

  return (
    <text
      x={cx}
      y={y - 5}
      textAnchor="middle"
      fill="#334155"
      fontSize={10}
      fontWeight={600}
      className="tabular-nums"
    >
      {label}
    </text>
  )
}

/** @deprecated Use BarValueLabel */
export const BarPercentLabel = BarValueLabel

export type PointLabelProps = {
  x?: number | string
  y?: number | string
  value?: number | string | null
  payload?: { count?: number; pct?: number }
  valueMode?: ChartDisplayOptions['valueMode']
  show?: boolean
}

/** Line / area point label. */
export function PointValueLabel(props: PointLabelProps) {
  const { payload, valueMode = 'percent', show = true } = props
  if (!show) return null

  const count = payload?.count
  const pct = payload?.pct
  if (!shouldShowDataLabel(count, pct, valueMode)) return null

  const x = num(props.x)
  const y = num(props.y)
  const label = chartValueLabel(count, pct, valueMode)

  return (
    <text
      x={x}
      y={y - 8}
      textAnchor="middle"
      fill="#475569"
      fontSize={10}
      fontWeight={600}
      className="tabular-nums"
    >
      {label}
    </text>
  )
}

/** Pie slice callout — connector line + compact value badge. */
export function PieValueCallout(
  props: PieLabelRenderProps & {
    valueMode?: ChartDisplayOptions['valueMode']
    show?: boolean
  },
) {
  const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, percent = 0, payload, valueMode = 'percent', show = true } =
    props
  if (!show) return null

  const row = payload as { pct?: number; count?: number } | undefined
  const pct = row?.pct ?? percent * 100
  const count = row?.count
  if (!shouldShowDataLabel(count, pct, valueMode)) return null

  const RADIAN = Math.PI / 180
  const angle = -midAngle * RADIAN
  const innerX = cx + (outerRadius + 2) * Math.cos(angle)
  const innerY = cy + (outerRadius + 2) * Math.sin(angle)
  const outerX = cx + (outerRadius + 16) * Math.cos(angle)
  const outerY = cy + (outerRadius + 16) * Math.sin(angle)
  const textX = cx + (outerRadius + 22) * Math.cos(angle)
  const textY = cy + (outerRadius + 22) * Math.sin(angle)
  const anchor = textX >= cx ? 'start' : 'end'
  const label = chartValueLabel(count, pct, valueMode)
  const padX = anchor === 'start' ? 6 : -6
  const boxW = label.length * 6.5 + 12
  const boxX = anchor === 'start' ? textX + padX - 2 : textX + padX - boxW + 2

  return (
    <g className="pie-callout">
      <polyline
        points={`${innerX},${innerY} ${outerX},${outerY} ${textX},${textY}`}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={1}
      />
      <rect
        x={boxX}
        y={textY - 9}
        width={boxW}
        height={18}
        rx={4}
        fill="#ffffff"
        stroke="#e2e8f0"
        strokeWidth={1}
      />
      <text
        x={boxX + boxW / 2}
        y={textY + 4}
        textAnchor="middle"
        fill="#0f172a"
        fontSize={10}
        fontWeight={600}
        className="tabular-nums"
      >
        {label}
      </text>
    </g>
  )
}

/** @deprecated Use PieValueCallout */
export const PiePercentCallout = PieValueCallout
