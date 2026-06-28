import { lazy, Suspense, useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { BannerResult, ProfileResult } from '../../api/client'
import type { ChartTypeId } from '../../lib/chartTypes'
import type { ChartDisplayOptions } from '../../lib/chartDataHelpers'
import { wordsAsValues } from '../../lib/chartDataHelpers'
import { getPalette } from '../../lib/chartPalettes'
import {
  ArrayHeatmap,
  Bar100Chart,
  BoxPlotChart,
  CategoryHeatmapStrip,
  ComboChart,
  FunnelChart,
  GaugeChart,
  LollipopChart,
  RadarChartView,
  RadialBarChartView,
  StackedAreaChart,
  TreemapChart,
  WaterfallChart,
} from './ExtendedCharts'
import { ErrorState } from '../States'
import { Loader2 } from 'lucide-react'

export type { ChartDisplayOptions } from '../../lib/chartDataHelpers'

const LocationMap = lazy(() =>
  import('./LocationMap').then((m) => ({ default: m.LocationMap })),
)

function chartColors(options: ChartDisplayOptions): string[] {
  return getPalette(options.paletteId).colors
}

function barFill(options: ChartDisplayOptions, index: number): string {
  const colors = chartColors(options)
  return options.colorMode === 'multi' ? colors[index % colors.length] : colors[0]
}

interface Props {
  chartType: ChartTypeId
  data: ProfileResult | BannerResult
  options: ChartDisplayOptions
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function isBannerData(data: ProfileResult | BannerResult): data is BannerResult {
  return Boolean((data as BannerResult).headers && (data as BannerResult).rows)
}

function ValueTooltipContent({
  valueMode,
  active,
  payload,
  label,
}: {
  valueMode: 'count' | 'percent'
  active?: boolean
  payload?: readonly { payload?: { fullLabel?: string; count?: number; pct?: number; value?: number } }[]
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-800">{row?.fullLabel ?? label}</p>
      {valueMode === 'percent' ? (
        <p className="text-slate-600">{row?.value ?? row?.pct}% ({row?.count} responses)</p>
      ) : (
        <p className="text-slate-600">
          {row?.value ?? row?.count} ({row?.pct ?? 0}%)
        </p>
      )}
    </div>
  )
}

function CategoryBarChart({
  values,
  options,
  layout,
}: {
  values: { label: string; code?: string; count: number; percentage: number }[]
  options: ChartDisplayOptions
  layout: 'vertical' | 'horizontal'
}) {
  const chartData = values.slice(0, options.maxItems).map((v) => ({
    name: truncate(v.label || v.code || '', layout === 'vertical' ? 28 : 36),
    fullLabel: v.label || v.code || '',
    value: options.valueMode === 'percent' ? v.percentage : v.count,
    count: v.count,
    pct: v.percentage,
  }))

  const height = layout === 'horizontal' ? Math.max(280, chartData.length * 28) : 320

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout={layout === 'horizontal' ? 'vertical' : 'horizontal'}
          margin={
            layout === 'horizontal'
              ? { left: 8, right: 16, top: 8, bottom: 8 }
              : { bottom: 70, left: 8, right: 8, top: 8 }
          }
        >
          <CartesianGrid strokeDasharray="3 3" vertical={layout !== 'horizontal'} horizontal />
          {layout === 'horizontal' ? (
            <>
              <XAxis type="number" allowDecimals={options.valueMode === 'percent'} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
            </>
          ) : (
            <>
              <XAxis
                dataKey="name"
                angle={-30}
                textAnchor="end"
                interval={0}
                height={70}
                tick={{ fontSize: 11 }}
              />
              <YAxis allowDecimals={options.valueMode === 'percent'} />
            </>
          )}
          <Tooltip
            content={(props) => <ValueTooltipContent valueMode={options.valueMode} {...props} />}
          />
          <Bar
            dataKey="value"
            radius={layout === 'horizontal' ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={barFill(options, i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function PieDonutChart({
  values,
  options,
  donut,
}: {
  values: { label: string; code?: string; count: number; percentage: number }[]
  options: ChartDisplayOptions
  donut?: boolean
}) {
  const chartData = values.slice(0, Math.min(options.maxItems, 12)).map((v) => ({
    name: v.label || v.code || '',
    value: options.valueMode === 'percent' ? v.percentage : v.count,
    count: v.count,
    pct: v.percentage,
  }))

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={donut ? 55 : 0}
            outerRadius={100}
            paddingAngle={1}
            label={({ name, percent }) =>
              `${truncate(String(name), 16)} (${((percent ?? 0) * 100).toFixed(0)}%)`
            }
            labelLine={false}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={chartColors(options)[i % chartColors(options).length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, _name, item) => [
              options.valueMode === 'percent'
                ? `${value}%`
                : `${value} (${(item?.payload as { pct?: number })?.pct ?? 0}%)`,
              'Value',
            ]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function BannerGroupedChart({
  data,
  stacked,
  options,
}: {
  data: BannerResult
  stacked?: boolean
  options: ChartDisplayOptions
}) {
  const colors = chartColors(options)
  const headers = data.headers ?? []
  const rows = (data.rows ?? []).filter((r) => !r.is_total).slice(0, 25)
  const chartData = rows.map((row) => {
    const entry: Record<string, string | number> = { name: truncate(row.label, 32) }
    row.cells.forEach((cell, i) => {
      entry[headers[i]?.label ?? `Col ${i}`] = cell.col_pct ?? 0
    })
    return entry
  })

  return (
    <div className="h-96">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ bottom: 60, left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} height={60} tick={{ fontSize: 10 }} />
          <YAxis unit="%" />
          <Tooltip formatter={(v) => [`${v}%`, 'Column %']} />
          <Legend />
          {headers.map((h, i) => (
            <Bar
              key={h.key}
              dataKey={h.label}
              stackId={stacked ? 'stack' : undefined}
              fill={colors[i % colors.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function BannerHeatmap({ data, options }: { data: BannerResult; options: ChartDisplayOptions }) {
  const headers = data.headers ?? []
  const rows = (data.rows ?? []).filter((r) => !r.is_total).slice(0, 30)
  const [r, g, b] = getPalette(options.paletteId).heatmapRgb

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-50 px-3 py-2 font-semibold text-slate-700">Row</th>
            {headers.map((h) => (
              <th key={h.key} className="px-3 py-2 font-semibold text-slate-700">
                {truncate(h.label, 20)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code} className="border-t border-slate-100">
              <td className="sticky left-0 bg-white px-3 py-2 font-medium text-slate-800">
                {truncate(row.label, 40)}
              </td>
              {row.cells.map((cell, i) => {
                const pct = cell.col_pct ?? 0
                const intensity = Math.min(pct / 50, 1)
                return (
                  <td
                    key={i}
                    className="px-3 py-2 text-center tabular-nums text-slate-800"
                    style={{
                      backgroundColor: `rgba(${r}, ${g}, ${b}, ${intensity * 0.35})`,
                    }}
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

function NumericSummary({ data, options }: { data: ProfileResult; options: ChartDisplayOptions }) {
  const stats = [
    { label: 'N', value: data.count },
    { label: 'Mean', value: data.mean },
    { label: 'Median', value: data.median },
    { label: 'Std dev', value: data.std },
    { label: 'Min', value: data.min },
    { label: 'Max', value: data.max },
  ]
  const barData = stats
    .filter((s) => s.label !== 'N' && s.label !== 'Std dev' && s.value != null)
    .map((s) => ({ name: s.label, value: Number(s.value) }))

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-slate-50 p-4 text-center">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="mt-1 text-xl font-semibold">{s.value ?? '—'}</p>
          </div>
        ))}
      </div>
      {barData.length > 0 && (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill={chartColors(options)[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function NumericMultiBar({ data, options }: { data: ProfileResult; options: ChartDisplayOptions }) {
  const colors = chartColors(options)
  const chartData = (data.sections ?? [])
    .filter((s) => s.mean != null)
    .map((s) => ({
      name: truncate(s.subquestion || 'Item', 32),
      mean: s.mean,
      median: s.median,
    }))

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ bottom: 70, left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="mean" name="Mean" fill={colors[0]} radius={[4, 4, 0, 0]} />
          <Bar dataKey="median" name="Median" fill={colors[1] ?? colors[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ArrayGrid({ data, options }: { data: ProfileResult; options: ChartDisplayOptions }) {
  const sections = data.sections ?? []
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {sections.map((section, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-800">{section.subquestion}</h4>
          {section.values?.length ? (
            <CategoryBarChart values={section.values} options={options} layout="vertical" />
          ) : (
            <p className="text-sm text-slate-500">No data</p>
          )}
        </div>
      ))}
    </div>
  )
}

function RespondentScatterChart({
  data,
  options,
  bubble,
}: {
  data: ProfileResult
  options: ChartDisplayOptions
  bubble?: boolean
}) {
  const stroke = chartColors(options)[0]
  const xLabel = truncate(data.x_variable?.text || data.variable?.text || 'X', 40)
  const yLabel = truncate(data.y_variable?.text || 'Y', 40)
  const zLabel = data.z_variable?.text
  const points = (data.scatter_points ?? []).map((p) => ({
    x: p.x,
    y: p.y,
    z: p.z != null ? Math.max(p.z, 0.1) : 1,
  }))

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {data.base_n ?? points.length} respondents · X: {xLabel} · Y: {yLabel}
        {bubble && zLabel ? ` · Size: ${truncate(zLabel, 40)}` : ''}
      </p>
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ bottom: 20, left: 12, right: 16, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              tick={{ fontSize: 11 }}
              label={{ value: xLabel, position: 'insideBottom', offset: -8, fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              tick={{ fontSize: 11 }}
              label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 11 }}
            />
            {bubble && (
              <ZAxis type="number" dataKey="z" range={[60, 400]} name={zLabel || 'Size'} />
            )}
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as { x?: number; y?: number; z?: number }
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                    <p>
                      {xLabel}: {row?.x}
                    </p>
                    <p>
                      {yLabel}: {row?.y}
                    </p>
                    {bubble && row?.z != null && zLabel && (
                      <p>
                        {truncate(zLabel, 32)}: {row.z}
                      </p>
                    )}
                  </div>
                )
              }}
            />
            <Scatter data={points} fill={stroke} fillOpacity={bubble ? 0.65 : 0.85} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function BubbleChart({
  values,
  options,
}: {
  values: { label: string; code?: string; count: number; percentage: number }[]
  options: ChartDisplayOptions
}) {
  const colors = chartColors(options)
  const data = values.slice(0, options.maxItems).map((v, i) => ({
    x: i + 1,
    y: options.valueMode === 'percent' ? v.percentage : v.count,
    z: Math.max(v.count, 1),
    label: v.label || v.code || '',
    fill: colors[i % colors.length],
  }))

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ bottom: 20, left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey="x" name="Category" tick={{ fontSize: 11 }} />
          <YAxis
            type="number"
            dataKey="y"
            name={options.valueMode === 'percent' ? 'Percent' : 'Count'}
            tick={{ fontSize: 11 }}
          />
          <ZAxis type="number" dataKey="z" range={[80, 500]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0]?.payload as { label?: string; y?: number; z?: number }
              return (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                  <p className="font-medium">{row?.label}</p>
                  <p>
                    {row?.y}
                    {options.valueMode === 'percent' ? '%' : ''} · size {row?.z}
                  </p>
                </div>
              )
            }}
          />
          <Scatter data={data} fill={colors[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

function ScatterXYChart({
  values,
  options,
}: {
  values: { label: string; code?: string; count: number; percentage: number }[]
  options: ChartDisplayOptions
}) {
  const stroke = chartColors(options)[0]
  const data = values.slice(0, options.maxItems).map((v, i) => ({
    x: i + 1,
    y: options.valueMode === 'percent' ? v.percentage : v.count,
    label: v.label || v.code || '',
  }))

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ bottom: 20, left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey="x" name="Category #" tick={{ fontSize: 11 }} />
          <YAxis
            type="number"
            dataKey="y"
            name={options.valueMode === 'percent' ? 'Percent' : 'Count'}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0]?.payload as { label?: string; y?: number }
              return (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                  <p className="font-medium">{row?.label}</p>
                  <p>
                    {row?.y}
                    {options.valueMode === 'percent' ? '%' : ''}
                  </p>
                </div>
              )
            }}
          />
          <Scatter data={data} fill={stroke} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ChartVisualizer({ chartType, data, options }: Props) {
  const profile = useMemo(() => (isBannerData(data) ? null : data), [data])

  if (data.error) {
    const hasBanner = isBannerData(data) && data.headers
    const hasProfile =
      !isBannerData(data) &&
      Boolean(
        data.values?.length ||
          data.points?.length ||
          data.sections?.length ||
          data.top_words?.length ||
          data.scatter_points?.length,
      )
    if (!hasBanner && !hasProfile) {
      return <ErrorState message={data.error} />
    }
  }

  if (chartType === 'banner_grouped' && isBannerData(data)) {
    return <BannerGroupedChart data={data} options={options} />
  }
  if (chartType === 'banner_stacked' && isBannerData(data)) {
    return <BannerGroupedChart data={data} stacked options={options} />
  }
  if (chartType === 'banner_heatmap' && isBannerData(data)) {
    return <BannerHeatmap data={data} options={options} />
  }

  if (!profile) {
    return <ErrorState message="Unexpected chart data format" />
  }

  if (
    profile.analysis_type === 'scatter' &&
    profile.scatter_points?.length &&
    (chartType === 'scatter_xy' || chartType === 'bubble')
  ) {
    return (
      <RespondentScatterChart
        data={profile}
        options={options}
        bubble={chartType === 'bubble'}
      />
    )
  }

  if (profile.analysis_type === 'location' || chartType === 'map') {
    return (
      <Suspense
        fallback={
          <div className="flex h-72 items-center justify-center">
            <Loader2 className="animate-spin text-[var(--et-teal)]" size={24} />
          </div>
        }
      >
        <LocationMap points={profile.points ?? []} bounds={profile.bounds} />
      </Suspense>
    )
  }

  if (chartType === 'numeric_summary' && profile.analysis_type === 'numeric') {
    return <NumericSummary data={profile} options={options} />
  }

  if (chartType === 'boxplot' && profile.analysis_type === 'numeric') {
    return <BoxPlotChart data={profile} options={options} />
  }

  if (chartType === 'gauge' && profile.analysis_type === 'numeric') {
    return <GaugeChart data={profile} options={options} />
  }

  if (chartType === 'array_heatmap' && profile.analysis_type === 'array') {
    return <ArrayHeatmap data={profile} options={options} />
  }

  if (chartType === 'radar' && profile.analysis_type === 'array') {
    const sectionValues = (profile.sections ?? []).map((s) => {
      const vals = s.values ?? []
      const top =
        vals.length > 0
          ? vals.reduce(
              (best, v) => ((v.percentage ?? 0) > (best.percentage ?? 0) ? v : best),
              vals[0],
            )
          : undefined
      return {
        label: s.subquestion || 'Item',
        code: s.subquestion,
        count: top?.count ?? 0,
        percentage: top?.percentage ?? 0,
      }
    })
    return <RadarChartView values={sectionValues} options={options} />
  }

  if (chartType === 'histogram' && profile.values?.length) {
    return <CategoryBarChart values={profile.values} options={options} layout="vertical" />
  }

  if (chartType === 'numeric_multi_bar' || profile.analysis_type === 'numeric_multi') {
    return <NumericMultiBar data={profile} options={options} />
  }

  if (chartType === 'array_grid' || profile.analysis_type === 'array') {
    return <ArrayGrid data={profile} options={options} />
  }

  if (chartType === 'word_bar' || profile.analysis_type === 'text') {
    const words = wordsAsValues(profile, options.maxItems)
    if (chartType === 'word_treemap') {
      return <TreemapChart values={words} options={{ ...options, valueMode: 'count' }} />
    }
    return (
      <CategoryBarChart
        values={words}
        options={{ ...options, valueMode: 'count' }}
        layout="horizontal"
      />
    )
  }

  const values = profile.values ?? []
  if (!values.length && profile.analysis_type !== 'numeric') {
    return <ErrorState message="No chart data for this question" />
  }

  const valueRows = values.map((v) => ({
    label: v.label || v.code || '',
    code: v.code,
    count: v.count,
    percentage: v.percentage,
  }))

  if (chartType === 'lollipop') {
    return <LollipopChart values={valueRows} options={options} layout="vertical" />
  }
  if (chartType === 'bar_100') {
    return <Bar100Chart values={valueRows} options={options} layout="vertical" />
  }
  if (chartType === 'combo') {
    return <ComboChart values={valueRows} options={options} />
  }
  if (chartType === 'stacked_area') {
    return <StackedAreaChart values={valueRows} options={options} />
  }
  if (chartType === 'treemap') {
    return <TreemapChart values={valueRows} options={options} />
  }
  if (chartType === 'waterfall') {
    return <WaterfallChart values={valueRows} options={options} />
  }
  if (chartType === 'radar') {
    return <RadarChartView values={valueRows} options={options} />
  }
  if (chartType === 'radial_bar') {
    return <RadialBarChartView values={valueRows} options={options} />
  }
  if (chartType === 'funnel') {
    return <FunnelChart values={valueRows} options={options} />
  }
  if (chartType === 'category_heatmap') {
    return <CategoryHeatmapStrip values={valueRows} options={options} />
  }

  if (!values.length) {
    return <ErrorState message="No chart data for this question" />
  }

  if (chartType === 'bubble') {
    return <BubbleChart values={values} options={options} />
  }
  if (chartType === 'scatter_xy') {
    return <ScatterXYChart values={values} options={options} />
  }
  if (chartType === 'pie') {
    return <PieDonutChart values={values} options={options} />
  }
  if (chartType === 'donut') {
    return <PieDonutChart values={values} options={options} donut />
  }
  if (chartType === 'line') {
    const chartData = values.slice(0, options.maxItems).map((v) => ({
      name: truncate(v.label || v.code || '', 20),
      fullLabel: v.label || v.code || '',
      value: options.valueMode === 'percent' ? v.percentage : v.count,
      count: v.count,
      pct: v.percentage,
    }))
    const stroke = chartColors(options)[0]
    return (
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ bottom: 60, left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-20} textAnchor="end" height={50} tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={options.valueMode === 'percent'} />
            <Tooltip
              content={(props) => <ValueTooltipContent valueMode={options.valueMode} {...props} />}
            />
            <Line type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} dot={{ fill: stroke }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }
  if (chartType === 'step_line') {
    const chartData = values.slice(0, options.maxItems).map((v) => ({
      name: truncate(v.label || v.code || '', 20),
      fullLabel: v.label || v.code || '',
      value: options.valueMode === 'percent' ? v.percentage : v.count,
      count: v.count,
      pct: v.percentage,
    }))
    const stroke = chartColors(options)[0]
    return (
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ bottom: 60, left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-20} textAnchor="end" height={50} tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={options.valueMode === 'percent'} />
            <Tooltip
              content={(props) => <ValueTooltipContent valueMode={options.valueMode} {...props} />}
            />
            <Line type="stepAfter" dataKey="value" stroke={stroke} strokeWidth={2} dot={{ fill: stroke }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }
  if (chartType === 'area') {
    const chartData = values.slice(0, options.maxItems).map((v) => ({
      name: truncate(v.label || v.code || '', 20),
      fullLabel: v.label || v.code || '',
      value: options.valueMode === 'percent' ? v.percentage : v.count,
      count: v.count,
      pct: v.percentage,
    }))
    const stroke = chartColors(options)[0]
    return (
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ bottom: 60, left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-20} textAnchor="end" height={50} tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={options.valueMode === 'percent'} />
            <Tooltip
              content={(props) => <ValueTooltipContent valueMode={options.valueMode} {...props} />}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={stroke}
              fill={stroke}
              fillOpacity={0.25}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )
  }
  if (chartType === 'bar_horizontal') {
    return <CategoryBarChart values={values} options={options} layout="horizontal" />
  }

  return <CategoryBarChart values={values} options={options} layout="vertical" />
}
