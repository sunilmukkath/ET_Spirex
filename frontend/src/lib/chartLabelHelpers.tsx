import type { PieLabelRenderProps } from 'recharts'

/** Compact percentage for chart labels (e.g. 24%, 4.5%, 0.8%). */
export function formatChartPct(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 10) return `${Math.round(value)}%`
  if (value > 0) return `${value.toFixed(1)}%`
  return '0%'
}

type BarLabelProps = {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  payload?: { pct?: number }
  layout?: 'vertical' | 'horizontal'
}

function num(value: number | string | undefined, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? (n as number) : fallback
}

/** Bar end-cap label — always shows share %, not raw count. */
export function BarPercentLabel(props: BarLabelProps) {
  const { payload, layout = 'vertical' } = props
  const x = num(props.x)
  const y = num(props.y)
  const width = num(props.width)
  const height = num(props.height)
  const pct = payload?.pct
  if (pct == null || pct < 2) return null

  const label = formatChartPct(pct)

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

/** Pie slice callout — connector line + compact % badge. */
export function PiePercentCallout(props: PieLabelRenderProps) {
  const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, percent = 0, payload } = props
  const pct = (payload as { pct?: number } | undefined)?.pct ?? percent * 100

  if (pct < 3) return null

  const RADIAN = Math.PI / 180
  const angle = -midAngle * RADIAN
  const innerX = cx + (outerRadius + 2) * Math.cos(angle)
  const innerY = cy + (outerRadius + 2) * Math.sin(angle)
  const outerX = cx + (outerRadius + 16) * Math.cos(angle)
  const outerY = cy + (outerRadius + 16) * Math.sin(angle)
  const textX = cx + (outerRadius + 22) * Math.cos(angle)
  const textY = cy + (outerRadius + 22) * Math.sin(angle)
  const anchor = textX >= cx ? 'start' : 'end'
  const label = formatChartPct(pct)
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
