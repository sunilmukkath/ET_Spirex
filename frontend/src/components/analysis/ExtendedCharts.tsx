import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  Rectangle,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts'
import type { ProfileResult } from '../../api/client'
import { resolveChartColors, resolveHeatmapRgb } from '../../lib/chartPalettes'
import {
  funnelRows,
  radarRows,
  toChartRows,
  treemapNodes,
  truncate,
  type ChartDisplayOptions,
  type ValueRow,
  waterfallRows,
} from '../../lib/chartDataHelpers'
import { BarValueLabel, formatChartPct } from '../../lib/chartLabelHelpers'

function colors(options: ChartDisplayOptions) {
  return resolveChartColors(options, options.userPalettes)
}

function heatmapRgb(options: ChartDisplayOptions): [number, number, number] {
  return resolveHeatmapRgb(options, options.userPalettes)
}

function fillAt(options: ChartDisplayOptions, i: number) {
  const c = colors(options)
  return options.colorMode === 'multi' ? c[i % c.length] : c[0]
}

export function LollipopChart({
  values,
  options,
  layout,
}: {
  values: ValueRow[]
  options: ChartDisplayOptions
  layout: 'vertical' | 'horizontal'
}) {
  const data = toChartRows(values, options)
  const height = layout === 'horizontal' ? Math.max(300, data.length * 32) : 340

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          layout={layout === 'horizontal' ? 'vertical' : 'horizontal'}
          margin={layout === 'horizontal' ? { left: 8, right: 48 } : { bottom: 70, top: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          {layout === 'horizontal' ? (
            <>
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" angle={-28} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
              <YAxis />
            </>
          )}
          <Tooltip />
          <Bar dataKey="value" barSize={2} fill={colors(options)[0]}>
            {options.showDataLabels && (
              <LabelList
                dataKey="value"
                content={(props) => (
                  <BarValueLabel
                    {...props}
                    layout={layout}
                    valueMode={options.valueMode}
                    show={options.showDataLabels}
                  />
                )}
              />
            )}
          </Bar>
          <Scatter dataKey="value" fill={colors(options)[1] ?? colors(options)[0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ComboChart({
  values,
  lineValues,
  options,
  lineLabel,
}: {
  values: ValueRow[]
  lineValues?: ValueRow[]
  options: ChartDisplayOptions
  lineLabel?: string
}) {
  const barRows = toChartRows(values, options)
  const lineRows = lineValues?.map((v) => ({
    value:
      options.valueMode === 'percent' ? v.percentage : v.count,
  }))
  const data = barRows.map((row, i) => ({
    ...row,
    lineValue:
      lineRows?.[i]?.value ??
      (lineValues
        ? options.valueMode === 'percent'
          ? (lineValues[i]?.percentage ?? 0)
          : (lineValues[i]?.count ?? 0)
        : row.value),
  }))
  const stroke = colors(options)[0]
  const lineStroke = colors(options)[2] ?? colors(options)[1] ?? stroke
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ bottom: 70 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="value" name="Bars" fill={stroke} radius={[4, 4, 0, 0]}>
            {options.showDataLabels && (
              <LabelList
                dataKey="value"
                content={(props) => (
                  <BarValueLabel
                    {...props}
                    layout="vertical"
                    valueMode={options.valueMode}
                    show={options.showDataLabels}
                  />
                )}
              />
            )}
          </Bar>
          <Line
            type="monotone"
            dataKey="lineValue"
            name={lineLabel ? truncate(lineLabel, 28) : 'Line series'}
            stroke={lineStroke}
            strokeWidth={2}
            dot
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function FunnelChart({ values, options }: { values: ValueRow[]; options: ChartDisplayOptions }) {
  const data = funnelRows(values, options)
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="mx-auto max-w-lg space-y-1 py-4">
      {data.map((row, i) => {
        const widthPct = Math.max(20, (row.value / max) * 100)
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-28 shrink-0 truncate text-right text-xs text-slate-600" title={row.fullLabel}>
              {row.fullLabel}
            </div>
            <div className="flex-1">
              <div
                className="mx-auto rounded-md py-2 text-center text-xs font-semibold text-white"
                style={{ width: `${widthPct}%`, backgroundColor: fillAt(options, i), minWidth: '4rem' }}
              >
                {options.valueMode === 'percent'
                  ? formatChartPct(row.value)
                  : `${row.value} (${formatChartPct(row.pct)})`}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TreemapChart({ values, options }: { values: ValueRow[]; options: ChartDisplayOptions }) {
  const data = treemapNodes(values, options)

  return (
    <div className="h-96">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="size"
          nameKey="name"
          stroke="#fff"
          content={({ x, y, width, height, name, index }) => {
            if (!width || !height || width < 4 || height < 4) {
              return <g />
            }
            const idx = typeof index === 'number' ? index : 0
            return (
              <g>
                <Rectangle
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={fillAt(options, idx)}
                  stroke="#fff"
                  radius={4}
                />
                {width > 50 && height > 24 && (
                  <text x={(x ?? 0) + 6} y={(y ?? 0) + 16} fill="#fff" fontSize={11} fontWeight={600}>
                    {truncate(String(name ?? ''), Math.floor(width / 7))}
                  </text>
                )}
              </g>
            )
          }}
        />
      </ResponsiveContainer>
    </div>
  )
}

export function RadarChartView({ values, options }: { values: ValueRow[]; options: ChartDisplayOptions }) {
  const data = radarRows(values, options)
  const stroke = colors(options)[0]

  return (
    <div className="h-96">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
          <PolarRadiusAxis tick={{ fontSize: 9 }} />
          <Radar dataKey="value" stroke={stroke} fill={stroke} fillOpacity={0.35}>
            {options.showDataLabels && (
              <LabelList
                dataKey="value"
                formatter={(v) => {
                  const n = typeof v === 'number' ? v : Number(v)
                  return options.valueMode === 'percent' ? formatChartPct(n) : String(v ?? '')
                }}
                className="fill-slate-600 text-[9px] font-semibold"
              />
            )}
          </Radar>
          <Tooltip />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function RadialBarChartView({ values, options }: { values: ValueRow[]; options: ChartDisplayOptions }) {
  const data = toChartRows(values, options)
    .slice(0, 10)
    .map((row, i) => ({ name: row.name, value: row.value, fill: fillAt(options, i) }))

  return (
    <div className="h-96">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" data={data} startAngle={90} endAngle={-270}>
          <RadialBar dataKey="value" background cornerRadius={4}>
            {options.showDataLabels && (
              <LabelList
                dataKey="value"
                position="insideStart"
                formatter={(v) => {
                  const n = typeof v === 'number' ? v : Number(v)
                  return options.valueMode === 'percent' && Number.isFinite(n)
                    ? formatChartPct(n)
                    : String(v ?? '')
                }}
                className="fill-slate-700 text-[9px] font-semibold"
              />
            )}
          </RadialBar>
          <Legend />
          <Tooltip />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function GaugeChart({ data, options }: { data: ProfileResult; options: ChartDisplayOptions }) {
  const mean = data.mean ?? 0
  const maxVal = (data.max ?? mean * 1.5) || 100
  const pct = Math.min(100, Math.round((mean / maxVal) * 100))
  const fill = colors(options)[0]
  const gaugeData = [{ name: 'Mean', value: pct, fill }]

  return (
    <div className="mx-auto max-w-md py-6 text-center">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="70%" innerRadius="60%" outerRadius="100%" startAngle={180} endAngle={0} data={gaugeData}>
            <RadialBar dataKey="value" cornerRadius={8} background />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-3xl font-bold tabular-nums text-slate-900">{mean}</p>
      <p className="text-sm text-slate-500">Mean · {pct}% of max ({maxVal})</p>
    </div>
  )
}

export function WaterfallChart({ values, options }: { values: ValueRow[]; options: ChartDisplayOptions }) {
  const rows = waterfallRows(values, options)

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ bottom: 70 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="start" stackId="wf" fill="transparent" />
          <Bar dataKey="step" stackId="wf" radius={[4, 4, 0, 0]}>
            {rows.map((_, i) => (
              <Cell key={i} fill={fillAt(options, i)} />
            ))}
            {options.showDataLabels && (
              <LabelList
                dataKey="value"
                content={(props) => (
                  <BarValueLabel
                    {...props}
                    layout="vertical"
                    valueMode={options.valueMode}
                    show={options.showDataLabels}
                  />
                )}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BoxPlotChart({ data, options }: { data: ProfileResult; options: ChartDisplayOptions }) {
  const min = data.min ?? 0
  const max = data.max ?? 0
  const median = data.median ?? 0
  const mean = data.mean ?? 0
  const q1 = mean - (median - min) * 0.5
  const q3 = mean + (max - median) * 0.5
  const fill = colors(options)[0]

  return (
    <div className="flex h-72 flex-col items-center justify-center">
      <svg viewBox="0 0 320 180" className="h-48 w-full max-w-md">
        <line x1="60" y1="90" x2="260" y2="90" stroke="#cbd5e1" strokeWidth="2" />
        <line x1="60" y1="40" x2="60" y2="140" stroke={fill} strokeWidth="2" />
        <line x1="260" y1="40" x2="260" y2="140" stroke={fill} strokeWidth="2" />
        <rect x="110" y="55" width="100" height="70" fill={fill} fillOpacity="0.25" stroke={fill} rx="4" />
        <line x1="160" y1="55" x2="160" y2="125" stroke={fill} strokeWidth="3" />
        <text x="160" y="165" textAnchor="middle" fontSize="11" fill="#64748b">
          min {min} · Q1 {q1.toFixed(1)} · med {median} · Q3 {q3.toFixed(1)} · max {max}
        </text>
      </svg>
    </div>
  )
}

export function CategoryHeatmapStrip({ values, options }: { values: ValueRow[]; options: ChartDisplayOptions }) {
  const [r, g, b] = heatmapRgb(options)
  const rows = toChartRows(values, options)
  const max = Math.max(...rows.map((row) => row.value), 1)

  return (
    <div className="overflow-x-auto py-2">
      <div className="flex min-w-max gap-1">
        {rows.map((row, i) => {
          const intensity = row.value / max
          return (
            <div key={i} className="min-w-[72px] flex-1 text-center">
              <div
                className="mx-auto flex h-16 w-full items-center justify-center rounded-lg text-xs font-semibold text-slate-800"
                style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${0.15 + intensity * 0.55})` }}
              >
                {options.valueMode === 'percent' ? formatChartPct(row.value) : `${row.value} (${formatChartPct(row.pct)})`}
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] text-slate-500" title={row.fullLabel}>
                {row.fullLabel}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ArrayHeatmap({ data, options }: { data: ProfileResult; options: ChartDisplayOptions }) {
  const [r, g, b] = heatmapRgb(options)
  const sections = data.sections ?? []
  const headers = sections[0]?.values?.map((v) => v.label || v.code) ?? []

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">Row</th>
            {headers.map((h, i) => (
              <th key={i} className="px-2 py-2 font-medium text-slate-600">
                {truncate(String(h), 16)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((section, si) => (
            <tr key={si} className="border-t border-slate-100">
              <td className="sticky left-0 bg-white px-3 py-2 font-medium">{section.subquestion}</td>
              {(section.values ?? []).map((cell, ci) => {
                const pct = cell.percentage ?? 0
                const intensity = Math.min(pct / 50, 1)
                return (
                  <td
                    key={ci}
                    className="px-2 py-2 text-center tabular-nums"
                    style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${intensity * 0.4})` }}
                  >
                    {pct}%
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Bar100Chart({
  values,
  options,
  layout,
}: {
  values: ValueRow[]
  options: ChartDisplayOptions
  layout: 'vertical' | 'horizontal'
}) {
  const total = values.reduce((s, v) => s + v.count, 0) || 1
  const normalized = values.map((v) => ({
    ...v,
    percentage: Math.round((1000 * v.count) / total) / 10,
  }))
  return (
    <CategoryBarChart100
      values={normalized}
      options={{ ...options, valueMode: 'percent' }}
      layout={layout}
    />
  )
}

function CategoryBarChart100({
  values,
  options,
  layout,
}: {
  values: ValueRow[]
  options: ChartDisplayOptions
  layout: 'vertical' | 'horizontal'
}) {
  const data = toChartRows(values, options)
  const height = layout === 'horizontal' ? Math.max(280, data.length * 28) : 320

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout === 'horizontal' ? 'vertical' : 'horizontal'}
          margin={layout === 'horizontal' ? { left: 8, right: 48 } : { bottom: 70, top: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          {layout === 'horizontal' ? (
            <>
              <XAxis type="number" unit="%" domain={[0, 100]} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" angle={-28} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
              <YAxis unit="%" domain={[0, 100]} />
            </>
          )}
          <Tooltip />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={fillAt(options, i)} />
            ))}
            {options.showDataLabels && (
              <LabelList
                dataKey="value"
                content={(props) => (
                  <BarValueLabel
                    {...props}
                    layout={layout}
                    valueMode="percent"
                    show={options.showDataLabels}
                  />
                )}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function StackedAreaChart({ values, options }: { values: ValueRow[]; options: ChartDisplayOptions }) {
  const data = toChartRows(values, options)
  let cumulative = 0
  const stacked = data.map((row) => {
    const base = cumulative
    cumulative += row.value
    return { ...row, base, total: cumulative }
  })
  const stroke = colors(options)[0]

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={stacked} margin={{ bottom: 70 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="base" stackId="a" fill="transparent" />
          <Bar dataKey="value" stackId="a" fill={stroke} fillOpacity={0.7} />
          <Line type="monotone" dataKey="total" stroke={colors(options)[2] ?? stroke} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
