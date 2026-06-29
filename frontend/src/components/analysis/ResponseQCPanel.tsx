import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { api, type DataQualityResult } from '../../api/client'
import {
  aggregateFlaggedRows,
  checkCount,
  computeQcMetrics,
  disabledChecksFromEnabled,
  enabledChecksFromDisabled,
  exportFlaggedCsv,
  isCheckAvailable,
  QC_CHECKS,
  qcCacheKey,
  type QcCheckId,
  type QcFlaggedRow,
} from '../../lib/qcHelpers'
import { ErrorState } from '../States'

interface Props {
  surveyId: number
  onUseQcApproved?: () => void
}

function loadCached(surveyId: number): { result: DataQualityResult; at: number } | null {
  try {
    const raw = sessionStorage.getItem(qcCacheKey(surveyId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { result: DataQualityResult; at: number }
    if (!parsed?.result) return null
    return parsed
  } catch {
    return null
  }
}

function saveCached(surveyId: number, result: DataQualityResult) {
  try {
    sessionStorage.setItem(
      qcCacheKey(surveyId),
      JSON.stringify({ result, at: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

export function ResponseQCPanel({ surveyId, onUseQcApproved }: Props) {
  const cached = loadCached(surveyId)
  const [result, setResult] = useState<DataQualityResult | null>(cached?.result ?? null)
  const [lastRunAt, setLastRunAt] = useState<number | null>(cached?.at ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterCheck, setFilterCheck] = useState<QcCheckId | 'all'>('all')
  const [search, setSearch] = useState('')
  const [enabledChecks, setEnabledChecks] = useState<Set<QcCheckId>>(
    () => new Set(QC_CHECKS.map((c) => c.id)),
  )
  const [configLoading, setConfigLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setConfigLoading(true)
    api
      .getQcConfig(surveyId)
      .then((cfg) => {
        if (!cancelled) {
          setEnabledChecks(enabledChecksFromDisabled(cfg.disabled_checks ?? []))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabledChecks(new Set(QC_CHECKS.map((c) => c.id)))
        }
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [surveyId])

  const runScan = useCallback(
    async (refresh = true) => {
      if (!Number.isFinite(surveyId) || surveyId <= 0) return
      setLoading(true)
      setError(null)
      try {
        const data = await api.getDataQuality(surveyId, 'complete', refresh)
        setResult(data)
        const at = Date.now()
        setLastRunAt(at)
        saveCached(surveyId, data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'QC scan failed')
      } finally {
        setLoading(false)
      }
    },
    [surveyId],
  )

  const toggleCheck = useCallback(
    async (checkId: QcCheckId, include: boolean) => {
      const next = new Set(enabledChecks)
      if (include) next.add(checkId)
      else next.delete(checkId)
      setEnabledChecks(next)
      try {
        await api.setQcConfig(surveyId, disabledChecksFromEnabled(next))
      } catch {
        setEnabledChecks(enabledChecks)
      }
    },
    [enabledChecks, surveyId],
  )

  const metrics = useMemo(() => {
    if (!result) return null
    return computeQcMetrics(result, enabledChecks)
  }, [result, enabledChecks])

  const activeRows = useMemo(() => {
    if (!result) return []
    if (filterCheck !== 'all') {
      return aggregateFlaggedRows(result, new Set([filterCheck]))
    }
    return aggregateFlaggedRows(result, enabledChecks)
  }, [result, enabledChecks, filterCheck])

  const exportRows = useMemo(
    () => (result ? aggregateFlaggedRows(result, enabledChecks) : []),
    [result, enabledChecks],
  )

  const filteredRows = useMemo(() => {
    let rows = activeRows
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (r) =>
          r.response_id.toLowerCase().includes(q) ||
          r.detail.toLowerCase().includes(q) ||
          r.checks.some((c) => c.includes(q)),
      )
    }
    return rows
  }, [activeRows, search])

  if (!result && !loading && !error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]">
            <ShieldCheck size={28} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Response QC</h2>
          <p className="mt-2 text-sm text-slate-500">
            Scan completed interviews for speeders, test responses, duplicate phones,
            straight-lining, and gibberish text. Toggle checks on or off to control what
            counts toward <strong>QC Approved</strong>.
          </p>
          <button
            type="button"
            onClick={() => runScan(true)}
            disabled={loading}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--et-teal)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
          >
            <Play size={16} />
            Run scan
          </button>
          <p className="mt-3 text-xs text-slate-400">
            Large surveys may take 1–3 minutes on first run.
          </p>
        </div>
      </div>
    )
  }

  if (error && !result) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <ErrorState message={error} />
        <button
          type="button"
          onClick={() => runScan(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white"
        >
          <RefreshCw size={16} />
          Retry scan
        </button>
      </div>
    )
  }

  if (!result || !metrics) return null

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Response QC</h2>
            <p className="text-xs text-slate-500">
              {lastRunAt
                ? `Last scan ${new Date(lastRunAt).toLocaleString()} · completed interviews only`
                : 'Completed interviews only'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onUseQcApproved && metrics.flagged > 0 && (
              <button
                type="button"
                onClick={onUseQcApproved}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--et-teal)]/40 bg-[var(--et-teal-light)]/50 px-3 py-2 text-xs font-semibold text-[var(--et-teal-dark)] hover:bg-[var(--et-teal-light)]"
              >
                <CheckCircle2 size={14} />
                Use QC Approved sample
              </button>
            )}
            {exportRows.length > 0 && (
              <button
                type="button"
                onClick={() => exportFlaggedCsv(exportRows, `survey_${surveyId}_qc_flags.csv`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download size={14} />
                Export flags
              </button>
            )}
            <button
              type="button"
              onClick={() => runScan(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <RefreshCw size={14} />
              )}
              {loading ? 'Scanning…' : 'Run scan'}
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Loader2 className="animate-spin text-[var(--et-teal)]" size={16} />
            Running QC checks — this may take a few minutes on large surveys…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {result.message && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {result.message}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <SummaryTile label="Sample size" value={metrics.total} />
          <SummaryTile label="Passed QC" value={metrics.clean} tone="pass" />
          <SummaryTile label="Failed QC" value={metrics.flagged} tone="fail" />
          <SummaryTile label="Pass rate" value={`${metrics.passRate.toFixed(1)}%`} />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Issue type</h3>
            <p className="text-xs text-slate-500">
              Click a check to view only those flags. Disabled checks are excluded from pass/fail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <IssueChip
              label="All issues"
              count={aggregateFlaggedRows(result, enabledChecks).length}
              active={filterCheck === 'all'}
              onClick={() => setFilterCheck('all')}
            />
            {QC_CHECKS.map((check) => {
              const count = checkCount(check.id, result)
              const included = enabledChecks.has(check.id)
              return (
                <IssueChip
                  key={check.id}
                  label={check.title}
                  count={count}
                  active={filterCheck === check.id}
                  muted={!included}
                  onClick={() => setFilterCheck(filterCheck === check.id ? 'all' : check.id)}
                />
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-800">QC checks</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Turn off checks you do not want to count toward QC Approved (e.g. gibberish on name fields).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 font-semibold">Check</th>
                  <th className="px-5 py-2.5 font-semibold">Found</th>
                  <th className="px-5 py-2.5 font-semibold">Severity</th>
                  <th className="px-5 py-2.5 font-semibold">Include in QC</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {QC_CHECKS.map((check) => {
                  const count = checkCount(check.id, result)
                  const available = isCheckAvailable(check.id, result)
                  const included = enabledChecks.has(check.id)
                  const active = filterCheck === check.id
                  return (
                    <tr
                      key={check.id}
                      className={`border-b border-slate-50 transition hover:bg-slate-50/80 ${
                        active ? 'bg-[var(--et-teal-light)]/30' : ''
                      } ${!included ? 'opacity-70' : ''}`}
                    >
                      <td
                        className="cursor-pointer px-5 py-3"
                        onClick={() => setFilterCheck(active ? 'all' : check.id)}
                      >
                        <p className="font-medium text-slate-900">{check.title}</p>
                        <p className="text-xs text-slate-500">{check.description}</p>
                      </td>
                      <td className="px-5 py-3 tabular-nums font-semibold text-slate-800">
                        {count}
                      </td>
                      <td className="px-5 py-3">
                        <SeverityBadge severity={check.severity} />
                      </td>
                      <td className="px-5 py-3">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={included}
                            disabled={configLoading}
                            onChange={(e) => toggleCheck(check.id, e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-[var(--et-teal)] focus:ring-[var(--et-teal)]"
                          />
                          <span className="text-xs text-slate-600">
                            {included ? 'On' : 'Off'}
                          </span>
                        </label>
                      </td>
                      <td
                        className="cursor-pointer px-5 py-3 text-xs text-slate-500"
                        onClick={() => setFilterCheck(active ? 'all' : check.id)}
                      >
                        {!available
                          ? 'Not available'
                          : count === 0
                            ? 'All clear'
                            : included
                              ? 'View flags ↓'
                              : 'Excluded from QC'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-800">
              Flagged records ({filteredRows.length}
              {filterCheck !== 'all' || search ? ` of ${activeRows.length}` : ''})
            </h3>
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ID or detail…"
                className="w-48 rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
              />
            </div>
          </div>
          {filteredRows.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-8 text-sm text-slate-500">
              <CheckCircle2 size={18} className="text-[var(--et-teal)]" />
              {activeRows.length === 0
                ? 'No flagged records for the selected checks.'
                : 'No records match your filter.'}
            </p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-semibold">Response ID</th>
                    <th className="px-5 py-2 font-semibold">Checks</th>
                    <th className="px-5 py-2 font-semibold">Severity</th>
                    <th className="px-5 py-2 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <FlaggedTableRow key={row.response_id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function IssueChip({
  label,
  count,
  active,
  muted,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-[var(--et-teal)] bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]'
          : muted
            ? 'border-slate-200 bg-slate-50 text-slate-400'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
          active ? 'bg-white/80' : 'bg-slate-100'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone?: 'pass' | 'fail'
}) {
  const toneClass =
    tone === 'pass'
      ? 'border-emerald-200 bg-emerald-50/50'
      : tone === 'fail'
        ? 'border-rose-200 bg-rose-50/50'
        : 'border-slate-200 bg-white'
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const cls =
    severity === 'high'
      ? 'bg-rose-100 text-rose-800 ring-rose-200'
      : severity === 'medium'
        ? 'bg-amber-100 text-amber-900 ring-amber-200'
        : 'bg-slate-100 text-slate-700 ring-slate-200'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${cls}`}>
      {severity}
    </span>
  )
}

function FlaggedTableRow({ row }: { row: QcFlaggedRow }) {
  return (
    <tr className="border-t border-slate-50 hover:bg-slate-50/50">
      <td className="px-5 py-2.5 font-mono text-xs font-medium text-slate-800">
        {row.response_id}
      </td>
      <td className="px-5 py-2.5">
        <div className="flex flex-wrap gap-1">
          {row.checks.map((c) => (
            <span
              key={c}
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {QC_CHECKS.find((x) => x.id === c)?.title ?? c}
            </span>
          ))}
        </div>
      </td>
      <td className="px-5 py-2.5">
        <SeverityBadge severity={row.severity} />
      </td>
      <td className="max-w-md px-5 py-2.5 text-xs text-slate-600">{row.detail}</td>
    </tr>
  )
}
