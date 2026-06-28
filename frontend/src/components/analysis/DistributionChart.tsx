import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface ChartRow {
  name: string
  fullLabel: string
  count: number
  pct: number
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export function DistributionChart({
  values,
}: {
  values: { label: string; code?: string; count: number; percentage: number }[]
}) {
  const chartData: ChartRow[] = values.slice(0, 20).map((v) => ({
    name: truncate(v.label || v.code || '', 28),
    fullLabel: v.label || v.code || '',
    count: v.count,
    pct: v.percentage,
  }))

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ bottom: 70, left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            angle={-30}
            textAnchor="end"
            interval={0}
            height={70}
            tick={{ fontSize: 11 }}
          />
          <YAxis allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            labelFormatter={(_label, payload) =>
              (payload?.[0]?.payload as ChartRow | undefined)?.fullLabel ?? String(_label)
            }
            formatter={(value, _name, item) => [
              `${value ?? 0} (${(item?.payload as ChartRow | undefined)?.pct ?? 0}%)`,
              'Count',
            ]}
          />
          <Bar dataKey="count" fill="var(--et-teal)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
