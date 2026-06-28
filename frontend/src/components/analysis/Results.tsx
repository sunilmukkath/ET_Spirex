import { lazy, Suspense, useEffect, useState } from 'react'
import type { BannerResult, FilterSpec, ProfileResult, SurveyVariable, TableCell } from '../../api/client'
import { ErrorState } from '../States'
import { FilterEditor } from './FilterEditor'
import { Loader2 } from 'lucide-react'
import { ChevronDown } from 'lucide-react'

const LocationMap = lazy(() =>
  import('./LocationMap').then((m) => ({ default: m.LocationMap })),
)

function ChartFallback() {
  return (
    <div className="flex h-72 items-center justify-center text-slate-400">
      <Loader2 className="animate-spin" size={24} />
    </div>
  )
}

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
    return (
      <div className="space-y-6">
        <ResultHeader result={result} />
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
        <Suspense fallback={<ChartFallback />}>
          <LocationMap points={result.points ?? []} bounds={result.bounds} />
        </Suspense>
        <p className="text-sm text-slate-500">
          {result.base_n ?? 0} responses with valid GPS coordinates
          {(result.points?.length ?? 0) >= 5000 && ' (showing first 5,000)'}
        </p>
      </div>
    )
  }

  return <ErrorState message="Unsupported analysis result" />
}

export interface MultiCrosstabControls {
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  globalFilters: FilterSpec[]
  tableFilters: Record<string, FilterSpec[]>
  onTableFiltersChange: (rowId: string, filters: FilterSpec[]) => void
  onRefreshTable: (rowId: string, tableIndex: number) => void
  refreshingTableId: string | null
}

export function CrosstabsResults({
  result,
  multiControls,
}: {
  result: BannerResult
  multiControls?: MultiCrosstabControls
}) {
  if (result.error && !result.tables) return <ErrorState message={result.error} />

  if (result.table_type === 'multi' && result.tables?.length) {
    return <MultiCrosstabList result={result} controls={multiControls} />
  }

  return <BannerTable result={result} />
}

function crosstabTableTitle(table: BannerResult, index: number) {
  return table.row_variable?.text || table.row_header || `Table ${index + 1}`
}

function MultiCrosstabList({
  result,
  controls,
}: {
  result: BannerResult
  controls?: MultiCrosstabControls
}) {
  const tables = result.tables ?? []
  const [allExpanded, setAllExpanded] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(tables.map((_, i) => i)))

  useEffect(() => {
    setExpanded(allExpanded ? new Set(tables.map((_, i) => i)) : new Set())
  }, [allExpanded, tables.length])

  function toggle(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      setAllExpanded(next.size === tables.length)
      return next
    })
  }

  function setExpandAll(expandedState: boolean) {
    setAllExpanded(expandedState)
    setExpanded(expandedState ? new Set(tables.map((_, i) => i)) : new Set())
  }

  const tableProps = {
    confidence_level: result.confidence_level,
    show_counts: result.show_counts,
    show_col_pct: result.show_col_pct,
    show_row_pct: result.show_row_pct,
    show_significance: result.show_significance,
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-medium text-slate-700">
          {tables.length} crosstab {tables.length === 1 ? 'table' : 'tables'}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <span className="font-medium">Expand all tables</span>
          <button
            type="button"
            role="switch"
            aria-checked={allExpanded}
            onClick={() => setExpandAll(!allExpanded)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              allExpanded ? 'bg-[var(--et-teal)]' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                allExpanded ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      </div>

      {tables.map((table, index) => {
        const isOpen = expanded.has(index)
        const title = crosstabTableTitle(table, index)
        const rowId = table.row_variable?.id
        const tableFilterList =
          rowId && controls?.tableFilters[rowId] !== undefined
            ? controls.tableFilters[rowId]
            : controls?.globalFilters ?? []
        const hasCustomFilters = Boolean(
          rowId &&
            controls?.tableFilters[rowId] !== undefined &&
            JSON.stringify(controls.tableFilters[rowId]) !==
              JSON.stringify(controls.globalFilters ?? []),
        )
        const refreshing = Boolean(rowId && controls?.refreshingTableId === rowId)

        return (
          <div key={rowId ?? index} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => toggle(index)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Table {index + 1}
                  {hasCustomFilters && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 normal-case">
                      filtered
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-sm font-medium text-slate-800">{title}</span>
              </span>
              <ChevronDown
                size={18}
                className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div className="border-t border-slate-200 p-4">
                {controls && rowId && (
                  <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                    <FilterEditor
                      surveyId={controls.surveyId}
                      completionStatus={controls.completionStatus}
                      variables={controls.variables}
                      filters={tableFilterList}
                      onChange={(next) => controls.onTableFiltersChange(rowId, next)}
                      compact
                      heading="Table filters"
                      applyLabel="Apply to this table"
                      onApply={() => controls.onRefreshTable(rowId, index)}
                      applying={refreshing}
                    />
                    {!hasCustomFilters && controls.globalFilters.length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        Using default filters from the toolbar. Change filters here and apply to override for this table only.
                      </p>
                    )}
                  </div>
                )}
                {table.error ? (
                  <ErrorState message={table.error} />
                ) : refreshing ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                    <Loader2 className="animate-spin text-[var(--et-teal)]" size={20} />
                    Updating table…
                  </div>
                ) : (
                  <BannerTable result={{ ...table, ...tableProps }} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
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
