import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download, Info } from 'lucide-react'
import type { AdvancedAnalysisResult } from '../../api/client'
import {
  analysisTitle,
  buildExportCsv,
  correlationColor,
  correlationTextColor,
  downloadCsv,
  formatPValue,
  significanceLabel,
  significanceLevel,
  strengthLabel,
} from '../../lib/multivariateHelpers'

interface Props {
  result: AdvancedAnalysisResult
}

export function MultivariateResults({ result }: Props) {
  const title = analysisTitle(result.analysis_type ?? '')

  function handleExport() {
    const csv = buildExportCsv(result)
    if (!csv) return
    downloadCsv(csv, `${result.analysis_type ?? 'analysis'}_results.csv`)
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {result.base_n != null && (
            <p className="mt-1 text-sm text-slate-500">
              Sample: <strong className="text-slate-700">{result.base_n.toLocaleString()}</strong>{' '}
              responses
              {result.pairwise_n != null && result.analysis_type === 'correlation' && (
                <> · pairwise complete cases: {result.pairwise_n.toLocaleString()}</>
              )}
              {result.n != null && result.analysis_type !== 'correlation' && (
                <> · analysis n: {result.n.toLocaleString()}</>
              )}
            </p>
          )}
        </div>
        {buildExportCsv(result) && (
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download size={14} />
            Export CSV
          </button>
        )}
      </div>

      {result.analysis_type === 'correlation' && <CorrelationResults result={result} />}
      {result.analysis_type === 'regression' && <RegressionResults result={result} />}
      {result.analysis_type === 'chi_square' && <ChiSquareResults result={result} />}
      {result.analysis_type === 'ttest' && <TTestResults result={result} />}
      {result.analysis_type === 'anova' && <AnovaResults result={result} />}
      {result.analysis_type === 'describe' && <DescribeResults result={result} />}
    </div>
  )
}

function CorrelationResults({ result }: { result: AdvancedAnalysisResult }) {
  const vars = result.variables ?? []
  const method = (result.method ?? 'pearson').charAt(0).toUpperCase() + (result.method ?? '').slice(1)

  return (
    <>
      <InsightBanner>
        {method} correlation — cells show strength from −1 (negative) to +1 (positive). Darker teal =
        stronger positive; rose = stronger negative.
      </InsightBanner>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-medium text-slate-500" />
              {vars.map((v) => (
                <th
                  key={v.id}
                  className="max-w-[88px] px-1 py-2 text-center font-medium text-slate-600"
                  title={v.label}
                >
                  <span className="line-clamp-2">{truncate(v.label || v.id, 28)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.matrix?.map((row) => (
              <tr key={row.variable_id}>
                <td
                  className="sticky left-0 z-10 max-w-[120px] bg-white px-2 py-1 font-medium text-slate-700"
                  title={row.label}
                >
                  {truncate(row.label || row.variable_id, 32)}
                </td>
                {vars.map((v) => {
                  const val = row.values[v.id]
                  const p = result.p_values?.[row.variable_id]?.[v.id]
                  const isDiag = row.variable_id === v.id
                  return (
                    <td key={v.id} className="p-0.5">
                      <div
                        className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-md px-1 py-1 tabular-nums"
                        style={{
                          backgroundColor: isDiag ? '#f1f5f9' : correlationColor(val),
                          color: isDiag ? '#64748b' : correlationTextColor(val),
                        }}
                        title={
                          val != null
                            ? `r = ${val.toFixed(3)}${p != null ? `, p = ${formatPValue(p)}` : ''}${!isDiag && val != null ? ` (${strengthLabel(val)})` : ''}`
                            : undefined
                        }
                      >
                        <span className="text-[11px] font-semibold">
                          {isDiag ? '1' : val != null ? val.toFixed(2) : '—'}
                        </span>
                        {!isDiag && p != null && significanceLevel(p) && (
                          <span className="text-[9px] opacity-80">
                            {significanceLevel(p) === 'high' ? '**' : '*'}
                          </span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[10px] text-slate-400">* p &lt; 0.05 · ** p &lt; 0.01</p>
      </div>
    </>
  )
}

function RegressionResults({ result }: { result: AdvancedAnalysisResult }) {
  const coefData = (result.coefficients ?? [])
    .filter((c) => c.name !== 'Intercept')
    .map((c) => ({
      name: truncate(c.name, 24),
      fullName: c.name,
      estimate: c.estimate,
    }))

  const r2Pct = ((result.r_squared ?? 0) * 100).toFixed(1)

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="R²" value={`${r2Pct}%`} sub="Variance explained" />
        <MetricCard
          label="Adj. R²"
          value={`${((result.adj_r_squared ?? 0) * 100).toFixed(1)}%`}
          sub="Adjusted"
        />
        <MetricCard label="RMSE" value={String(result.rmse ?? '—')} sub="Prediction error" />
        <MetricCard label="n" value={String(result.n ?? '—')} sub="Complete cases" />
      </div>

      <InsightBanner>
        {result.dependent?.label
          ? `"${truncate(result.dependent.label, 40)}" is modelled from ${result.independents?.length ?? 0} predictor(s). Bars show coefficient direction and magnitude.`
          : 'Positive coefficients increase the outcome; negative coefficients decrease it.'}
      </InsightBanner>

      {coefData.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Coefficients
          </p>
          <ResponsiveContainer width="100%" height={Math.max(180, coefData.length * 36)}>
            <BarChart data={coefData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v) => [Number(v ?? 0).toFixed(4), 'Estimate']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
              />
              <ReferenceLine x={0} stroke="#94a3b8" />
              <Bar dataKey="estimate" radius={[0, 4, 4, 0]}>
                {coefData.map((entry, i) => (
                  <Cell key={i} fill={entry.estimate >= 0 ? '#0d9488' : '#e11d48'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <CoefficientsTable coefficients={result.coefficients ?? []} />
    </>
  )
}

function ChiSquareResults({ result }: { result: AdvancedAnalysisResult }) {
  const sig = significanceLevel(result.p_value)
  const maxCount = Math.max(
    ...(result.table?.counts.flat() ?? [1]),
    1,
  )

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="χ²" value={String(result.chi2 ?? '—')} sub={`df = ${result.df ?? '—'}`} />
        <MetricCard
          label="p-value"
          value={formatPValue(result.p_value)}
          sub={significanceLabel(result.p_value)}
          highlight={sig === 'high' || sig === 'medium'}
        />
        <MetricCard label="Cramér's V" value={String(result.cramers_v ?? '—')} sub={result.interpretation} />
        <MetricCard label="n" value={String(result.n ?? '—')} sub="Valid pairs" />
      </div>

      <InsightBanner>
        {sig === 'high' || sig === 'medium'
          ? `There is a statistically significant association between "${truncate(result.variable_a?.label ?? '', 35)}" and "${truncate(result.variable_b?.label ?? '', 35)}".`
          : `No statistically significant association detected at the 95% confidence level.`}
      </InsightBanner>

      {result.table && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold text-slate-700">Contingency table (counts)</p>
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="px-2 py-2 text-left text-slate-500" />
                {result.table.col_labels.map((l) => (
                  <th key={l} className="px-2 py-2 text-center font-medium text-slate-600">
                    {truncate(l, 20)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.table.row_labels.map((rl, i) => (
                <tr key={rl} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-700">{truncate(rl, 24)}</td>
                  {(result.table?.counts[i] ?? []).map((c, j) => (
                    <td key={j} className="p-1">
                      <div
                        className="rounded-md px-2 py-2 text-center font-semibold tabular-nums text-slate-800"
                        style={{
                          backgroundColor: `rgba(13, 148, 136, ${0.12 + (c / maxCount) * 0.55})`,
                        }}
                      >
                        {c}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function TTestResults({ result }: { result: AdvancedAnalysisResult }) {
  const sig = significanceLevel(result.p_value)
  const chartData = [
    {
      name: truncate(result.group_a?.label ?? 'Group A', 20),
      mean: result.group_a?.mean ?? 0,
      n: result.group_a?.n ?? 0,
    },
    {
      name: truncate(result.group_b?.label ?? 'Group B', 20),
      mean: result.group_b?.mean ?? 0,
      n: result.group_b?.n ?? 0,
    },
  ]
  const diff = (result.group_a?.mean ?? 0) - (result.group_b?.mean ?? 0)

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="t statistic" value={String(result.t_statistic ?? '—')} />
        <MetricCard
          label="p-value"
          value={formatPValue(result.p_value)}
          sub={significanceLabel(result.p_value)}
          highlight={sig === 'high' || sig === 'medium'}
        />
        <MetricCard
          label="Mean difference"
          value={diff.toFixed(3)}
          sub={`${truncate(result.group_a?.label ?? 'A', 15)} − ${truncate(result.group_b?.label ?? 'B', 15)}`}
        />
      </div>

      <InsightBanner>
        {sig === 'high' || sig === 'medium'
          ? `The two groups differ significantly in "${truncate(result.numeric_variable?.label ?? 'outcome', 40)}".`
          : `No significant difference between groups at the 95% level.`}
      </InsightBanner>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold text-slate-700">Group means comparison</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, _n, props) => [Number(v ?? 0).toFixed(4), `Mean (n=${props.payload.n})`]} />
            <Bar dataKey="mean" fill="#0d9488" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

function AnovaResults({ result }: { result: AdvancedAnalysisResult }) {
  const sig = significanceLevel(result.p_value)
  const chartData = (result.groups ?? []).map((g) => ({
    name: truncate(g.label, 18),
    fullName: g.label,
    mean: g.mean,
    std: g.std,
    n: g.n,
  }))

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="F statistic" value={String(result.f_statistic ?? '—')} />
        <MetricCard
          label="p-value"
          value={formatPValue(result.p_value)}
          sub={significanceLabel(result.p_value)}
          highlight={sig === 'high' || sig === 'medium'}
        />
        <MetricCard label="Groups" value={String(chartData.length)} sub="Compared" />
      </div>

      <InsightBanner>
        {sig === 'high' || sig === 'medium'
          ? `At least one group mean differs significantly for "${truncate(result.numeric_variable?.label ?? 'outcome', 40)}".`
          : `Group means are not significantly different at the 95% level.`}
      </InsightBanner>

      {chartData.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold text-slate-700">Mean by group</p>
          <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 28)}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v, _n, props) => [
                  `${Number(v ?? 0).toFixed(4)} (±${Number(props.payload.std ?? 0).toFixed(3)})`,
                  `Mean, n=${props.payload.n}`,
                ]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
              />
              <Legend />
              <Bar dataKey="mean" name="Mean" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3 text-right">n</th>
              <th className="px-4 py-3 text-right">Mean</th>
              <th className="px-4 py-3 text-right">Std dev</th>
            </tr>
          </thead>
          <tbody>
            {(result.groups ?? []).map((g) => (
              <tr key={g.label} className="border-b border-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{g.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{g.n}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{g.mean}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{g.std}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function DescribeResults({ result }: { result: AdvancedAnalysisResult }) {
  const chartData = (result.rows ?? []).map((r) => ({
    name: truncate(r.label || r.variable_id, 16),
    fullName: r.label || r.variable_id,
    mean: r.mean,
  }))

  return (
    <>
      <InsightBanner>
        Summary statistics for {result.rows?.length ?? 0} numeric variable(s) in the filtered sample.
      </InsightBanner>

      {chartData.length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold text-slate-700">Mean comparison</p>
          <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v) => [Number(v ?? 0).toFixed(3), 'Mean']}
                labelFormatter={(_, p) => p?.[0]?.payload?.fullName ?? ''}
              />
              <Bar dataKey="mean" fill="#0d9488" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-4 py-3">Variable</th>
              <th className="px-4 py-3 text-right">n</th>
              <th className="px-4 py-3 text-right">Mean</th>
              <th className="px-4 py-3 text-right">Median</th>
              <th className="px-4 py-3 text-right">Std</th>
              <th className="px-4 py-3 text-right">Min</th>
              <th className="px-4 py-3 text-right">Max</th>
            </tr>
          </thead>
          <tbody>
            {(result.rows ?? []).map((r) => (
              <tr key={r.variable_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="max-w-[200px] px-4 py-2.5 font-medium text-slate-800">
                  {truncate(r.label || r.variable_id, 48)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{r.n}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.mean}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.median}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.std}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{r.min}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{r.max}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function MetricCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl px-4 py-3 ring-1 ${
        highlight
          ? 'bg-[var(--et-teal-light)]/50 ring-[var(--et-teal)]/30'
          : 'bg-white ring-slate-200'
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}

function InsightBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border border-[var(--et-teal)]/20 bg-[var(--et-teal-light)]/40 px-4 py-3 text-sm text-[var(--et-teal-dark)]">
      <Info size={16} className="mt-0.5 shrink-0 opacity-70" />
      <p>{children}</p>
    </div>
  )
}

function CoefficientsTable({
  coefficients,
}: {
  coefficients: { name: string; estimate: number }[]
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <th className="px-4 py-3">Term</th>
            <th className="px-4 py-3 text-right">Estimate</th>
          </tr>
        </thead>
        <tbody>
          {coefficients.map((c) => (
            <tr key={c.name} className="border-b border-slate-50">
              <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
              <td
                className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                  c.estimate >= 0 ? 'text-[var(--et-teal-dark)]' : 'text-rose-600'
                }`}
              >
                {c.estimate > 0 ? '+' : ''}
                {c.estimate}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}
