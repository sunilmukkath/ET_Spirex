import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BannerResult, ProfileResult, TableCell } from '../../api/client'
import { ErrorState } from '../States'
import { LocationMap } from './LocationMap'

const KIND_COLORS: Record<string, string> = {
  single: 'bg-blue-100 text-blue-800',
  multi: 'bg-purple-100 text-purple-800',
  array: 'bg-indigo-100 text-indigo-800',
  numeric: 'bg-amber-100 text-amber-800',
  text: 'bg-slate-100 text-slate-600',
  rank: 'bg-pink-100 text-pink-800',
  location: 'bg-emerald-100 text-emerald-800',
}

export function KindBadge({ kind, label }: { kind: string; label?: string }) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${KIND_COLORS[kind] || 'bg-slate-100 text-slate-600'}`}
    >
      {label || kind}
    </span>
  )
}

export function ProfileResults({ result }: { result: ProfileResult }) {
  if (result.error) return <ErrorState message={result.error} />

  if (result.analysis_type === 'distribution' && result.values) {
    const chartData = result.values.slice(0, 20).map((v) => ({
      name: truncate(v.label || v.code, 28),
      fullLabel: v.label || v.code,
      count: v.count,
      pct: v.percentage,
    }))
    return (
      <div className="space-y-6">
        <ResultHeader result={result} />
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
                  (payload?.[0]?.payload as { fullLabel?: string })?.fullLabel ?? String(_label)
                }
                formatter={(value, _name, item) => [
                  `${value ?? 0} (${(item?.payload as { pct?: number })?.pct ?? 0}%)`,
                  'Count',
                ]}
              />
              <Bar dataKey="count" fill="var(--et-teal)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <DistributionTable values={result.values} baseN={result.base_n || 0} />
      </div>
    )
  }

  if (result.analysis_type === 'checkbox_rate' && result.values) {
    return (
      <div className="space-y-4">
        <ResultHeader result={result} />
        <DistributionTable values={result.values} baseN={result.base_n || 0} labelHeader="Option" />
      </div>
    )
  }

  if (result.analysis_type === 'array' && result.sections) {
    return (
      <div className="space-y-8">
        <ResultHeader result={result} />
        {result.sections.map((section, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-4 font-medium text-slate-800">{section.subquestion}</h4>
            <ProfileResults result={section} />
          </div>
        ))}
      </div>
    )
  }

  if (result.analysis_type === 'numeric') {
    const stats = [
      { label: 'N', value: result.count },
      { label: 'Mean', value: result.mean },
      { label: 'Median', value: result.median },
      { label: 'Std dev', value: result.std },
      { label: 'Min', value: result.min },
      { label: 'Max', value: result.max },
    ]
    return (
      <div className="space-y-4">
        <ResultHeader result={result} />
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="mt-1 text-xl font-semibold">{s.value ?? '—'}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (result.analysis_type === 'text') {
    const maxWord = Math.max(...(result.top_words || []).map((w) => w.count), 1)
    return (
      <div className="space-y-4">
        <ResultHeader result={result} />
        <p className="text-sm text-slate-600">{result.response_count} text responses</p>
        {(result.top_words?.length ?? 0) > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-700">Top words</h4>
            <div className="flex flex-wrap gap-2">
              {result.top_words!.map((w) => (
                <span
                  key={w.word}
                  className="rounded-full bg-[var(--et-teal-light)] px-2.5 py-1 text-[var(--et-teal-dark)] ring-1 ring-[var(--et-teal)]/20"
                  style={{ fontSize: `${Math.max(11, Math.min(18, 11 + (w.count / maxWord) * 7))}px` }}
                >
                  {w.word} <span className="opacity-60">({w.count})</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Sample verbatims</h4>
          <ul className="space-y-2 text-sm text-slate-700">
            {(result.samples || []).map((s, i) => (
              <li key={i} className="rounded-lg bg-slate-50 px-3 py-2">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  if (result.analysis_type === 'location') {
    return (
      <div className="space-y-4">
        <ResultHeader result={result} />
        <LocationMap points={result.points ?? []} bounds={result.bounds} />
        <p className="text-sm text-slate-500">
          {result.base_n ?? 0} responses with valid GPS coordinates
          {(result.points?.length ?? 0) >= 5000 && ' (showing first 5,000)'}
        </p>
      </div>
    )
  }

  return <ErrorState message="Unsupported analysis result" />
}

export function CrosstabsResults({ result }: { result: BannerResult }) {
  if (result.error && !result.tables) return <ErrorState message={result.error} />

  if (result.table_type === 'multi' && result.tables?.length) {
    return (
      <div className="space-y-10">
        {result.tables.map((table, i) => (
          <div key={i} className={i > 0 ? 'border-t border-slate-200 pt-8' : ''}>
            {table.error ? (
              <ErrorState message={table.error} />
            ) : (
              <BannerTable result={{ ...table, confidence_level: result.confidence_level ?? table.confidence_level, show_counts: result.show_counts ?? table.show_counts, show_col_pct: result.show_col_pct ?? table.show_col_pct, show_row_pct: result.show_row_pct ?? table.show_row_pct, show_significance: result.show_significance ?? table.show_significance }} />
            )}
          </div>
        ))}
      </div>
    )
  }

  return <BannerTable result={result} />
}

export function BannerTable({ result }: { result: BannerResult }) {
  if (result.error) return <ErrorState message={result.error} />

  if (result.table_type === 'array' && result.sections) {
    return (
      <div className="space-y-8">
        <BannerMeta result={result} />
        {result.sections.map((section, i) => (
          <div key={i}>
            <h4 className="mb-3 font-medium text-slate-800">{section.subquestion || section.row_header}</h4>
            <BannerTable result={{ ...section, confidence_level: result.confidence_level, show_counts: result.show_counts, show_col_pct: result.show_col_pct, show_row_pct: result.show_row_pct, show_significance: result.show_significance }} />
          </div>
        ))}
      </div>
    )
  }

  if (!result.headers || !result.rows) return null

  const isMetric = ['mean', 'top2box', 'bottom2box'].includes(result.table_type || '')
  const showCounts = result.show_counts !== false
  const showColPct = result.show_col_pct !== false
  const showRowPct = Boolean(result.show_row_pct)
  const conf = result.confidence_level ?? 0.95

  return (
    <div className="space-y-4">
      <BannerMeta result={result} />
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="sticky left-0 z-10 min-w-[180px] bg-slate-50 px-3 py-2.5 font-semibold text-slate-700">
                {result.row_header}
              </th>
              {result.headers.map((h) => (
                <th key={h.key} className="min-w-[90px] px-3 py-2.5 font-semibold text-slate-700">
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr
                key={row.code}
                className={`border-b border-slate-100 ${row.is_total ? 'bg-slate-50 font-semibold' : ''}`}
              >
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-800">
                  {row.label}
                </td>
                {row.cells.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-slate-700">
                    <CellDisplay
                      cell={cell}
                      isMetric={isMetric}
                      showCounts={showCounts}
                      showColPct={showColPct}
                      showRowPct={showRowPct}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isMetric && result.show_significance && (
        <p className="text-xs text-slate-500">
          Chi-square standardized residuals at {Math.round(conf * 100)}%: + higher than expected, − lower (suffix shows level).
        </p>
      )}
    </div>
  )
}

function CellDisplay({
  cell,
  isMetric,
  showCounts = true,
  showColPct = true,
  showRowPct = false,
}: {
  cell: TableCell
  isMetric: boolean
  showCounts?: boolean
  showColPct?: boolean
  showRowPct?: boolean
}) {
  if (isMetric) {
    return <span className="font-medium">{cell.value ?? '—'}</span>
  }
  const sig = cell.sig
  const sigPositive = sig?.startsWith('+')
  const sigEl = sig ? (
    <sup className={`ml-0.5 font-bold ${sigPositive ? 'text-[var(--et-teal)]' : 'text-red-600'}`}>
      {sig}
    </sup>
  ) : null
  return (
    <span>
      {showCounts && <span>{cell.count}</span>}
      {showCounts && showColPct && ' '}
      {showColPct && (
        <span className={showCounts ? 'text-slate-400' : ''}>({cell.col_pct}%)</span>
      )}
      {showRowPct && cell.row_pct != null && (
        <span className="ml-1 text-slate-400">[{cell.row_pct}%]</span>
      )}
      {sigEl}
    </span>
  )
}

function BannerMeta({ result }: { result: BannerResult }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm text-slate-600">
      {result.row_variable && (
        <span>
          Side: <strong>{truncate(result.row_variable.text || result.row_variable.code, 50)}</strong>
        </span>
      )}
      <span>
        Base: <strong>{result.filtered_n ?? result.base_n}</strong> respondents
      </span>
      {result.metric && (
        <span>
          Metric: <strong>{result.metric.replace('_', ' ')}</strong>
        </span>
      )}
      {result.banner_variables?.map((b) => (
        <span key={b.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
          Banner: {truncate(b.text, 40)}
        </span>
      ))}
    </div>
  )
}

function ResultHeader({ result }: { result: ProfileResult }) {
  if (!result.variable) return null
  return (
    <div>
      <div className="flex items-center gap-2">
        <KindBadge kind={result.variable.kind} label={result.variable.type_label} />
        <span className="text-xs text-slate-500">{result.variable.code}</span>
      </div>
      <h3 className="mt-2 text-lg font-semibold text-slate-900">{result.variable.text}</h3>
      {result.base_n !== undefined && (
        <p className="mt-1 text-sm text-slate-500">Base: {result.base_n} respondents</p>
      )}
    </div>
  )
}

function DistributionTable({
  values,
  baseN,
  labelHeader = 'Answer',
}: {
  values: { label: string; count: number; percentage: number }[]
  baseN: number
  labelHeader?: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium">{labelHeader}</th>
            <th className="px-4 py-2.5 text-right font-medium">Count</th>
            <th className="px-4 py-2.5 text-right font-medium">%</th>
            <th className="hidden w-40 px-4 py-2.5 sm:table-cell" />
          </tr>
        </thead>
        <tbody>
          {values.map((v) => (
            <tr key={v.label} className="border-t border-slate-100">
              <td className="px-4 py-2.5 text-slate-800">{v.label || (v as { code?: string }).code}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{v.count}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-medium">{v.percentage}%</td>
              <td className="hidden px-4 py-2.5 sm:table-cell">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[var(--et-teal)]"
                    style={{ width: `${Math.min(v.percentage, 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 bg-slate-50 font-medium">
            <td className="px-4 py-2.5">Total</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{baseN}</td>
            <td className="px-4 py-2.5 text-right">100%</td>
            <td className="hidden sm:table-cell" />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}…` : value
}
