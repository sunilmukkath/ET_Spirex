import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  FlaskConical,
  Grid3x3,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react'
import type { DataQualityResult } from '../../api/client'
import { EmptyState, ErrorState } from '../States'

interface Props {
  result: DataQualityResult | null
  loading: boolean
  error: string | null
  onRefresh?: () => void
}

type CheckId = 'speeders' | 'test_responses' | 'duplicate_phones' | 'straight_liners' | 'gibberish'

const CHECK_META: Record<
  CheckId,
  { title: string; icon: typeof Clock; description: string; tone: string }
> = {
  speeders: {
    title: 'Speeders',
    icon: Clock,
    description: 'Finished much faster than typical completion time',
    tone: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  test_responses: {
    title: 'Test / dummy',
    icon: FlaskConical,
    description: 'Names or text containing test, dummy, fake, asdf, etc.',
    tone: 'bg-orange-50 text-orange-700 ring-orange-200',
  },
  duplicate_phones: {
    title: 'Duplicate phones',
    icon: Copy,
    description: 'Same phone on multiple records — keep one, flag the rest',
    tone: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  straight_liners: {
    title: 'Straight-lining',
    icon: Grid3x3,
    description: 'Identical answers across all items in a grid question',
    tone: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  gibberish: {
    title: 'Gibberish text',
    icon: MessageSquareWarning,
    description: 'Keyboard mash or meaningless open-ended answers',
    tone: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
}

export function QualityPanel({ result, loading, error, onRefresh }: Props) {
  const [activeCheck, setActiveCheck] = useState<CheckId>('duplicate_phones')

  const metrics = useMemo(() => {
    if (!result) return null
    const total = result.total_responses ?? 0
    const flagged = result.flagged_count ?? 0
    const clean = result.clean_estimate ?? Math.max(0, total - flagged)
    const dupes = result.duplicate_exclude_count ?? 0
    const flaggedPct = total > 0 ? (flagged / total) * 100 : 0
    const cleanPct = total > 0 ? (clean / total) * 100 : 100
    const passRate = cleanPct
    const qualityScore = Math.round(cleanPct)
    return { total, flagged, clean, dupes, flaggedPct, cleanPct, passRate, qualityScore }
  }, [result])

  if (loading && !result) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-[var(--et-teal)]" size={32} />
          <p className="mt-4 text-sm text-slate-500">Running data quality checks…</p>
          <p className="mt-1 text-xs text-slate-400">This may take a moment on large surveys.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <ErrorState message={error} />
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            <RefreshCw size={16} />
            Retry scan
          </button>
        )}
      </div>
    )
  }

  if (!result || !metrics) {
    return (
      <EmptyState
        title="Data quality"
        description="Quality checks run automatically when you open this tab."
      />
    )
  }

  const checks = (result.checks ?? []) as { id: CheckId; title: string; count: number; severity: string }[]
  const totalIssues = checks.reduce((sum, c) => sum + c.count, 0)
  const speeders = result.speeders

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {loading && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <Loader2 className="animate-spin" size={14} />
            Refreshing quality report…
          </div>
        )}

        {/* QC outcome summary */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                QC outcome summary
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Completed interviews scanned · a record fails if it triggers any check below
              </p>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {metrics.passRate.toFixed(1)}% pass rate
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <QcSummaryTile
              label="Sample size"
              value={metrics.total}
              sub="Total completed interviews in dataset"
              icon={Users}
              tone="neutral"
            />
            <QcSummaryTile
              label="Passed QC"
              value={metrics.clean}
              sub={`${metrics.cleanPct.toFixed(1)}% cleared all checks`}
              icon={CheckCircle2}
              tone="pass"
            />
            <QcSummaryTile
              label="Failed QC"
              value={metrics.flagged}
              sub={`${metrics.flaggedPct.toFixed(1)}% flagged · at least one issue`}
              icon={ShieldAlert}
              tone="fail"
            />
          </div>
        </div>

        {/* Header + score */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-[var(--et-teal-light)] p-3 text-[var(--et-teal-dark)]">
                <ShieldAlert size={24} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Data quality report</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {metrics.total.toLocaleString()} completed responses scanned
                </p>
                {result.message && (
                  <p className="mt-1 text-xs text-amber-700">{result.message}</p>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  Use <strong>QC Approved</strong> in the dataset dropdown to analyze minus flagged rows.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              )}
              <QualityScoreRing score={metrics.qualityScore} />
            </div>
          </div>

          {/* Primary metrics */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Sample size"
              value={metrics.total}
              sub="Completed interviews scanned"
              tone="neutral"
            />
            <MetricCard
              label="Passed QC"
              value={metrics.clean}
              sub={`${metrics.cleanPct.toFixed(1)}% of sample`}
              tone="good"
            />
            <MetricCard
              label="Failed QC"
              value={metrics.flagged}
              sub={`${metrics.flaggedPct.toFixed(1)}% of sample`}
              tone="warn"
            />
            <MetricCard
              label="Dupes to exclude"
              value={metrics.dupes}
              sub="Extra duplicate phone rows"
              tone="warn"
            />
          </div>

          {/* Secondary metrics row */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SecondaryMetric
              label="Issue instances"
              value={totalIssues.toLocaleString()}
              hint="Total flags across all checks (may overlap)"
            />
            {speeders?.available !== false && speeders?.median_seconds != null && (
              <SecondaryMetric
                label="Median completion"
                value={`${Math.round(speeders.median_seconds)}s`}
                hint={
                  speeders.threshold_seconds != null
                    ? `Speeder threshold: ${Math.round(speeders.threshold_seconds)}s`
                    : 'Typical survey duration'
                }
              />
            )}
            <SecondaryMetric
              label="Checks run"
              value={String(checks.length)}
              hint={`${checks.filter((c) => c.count > 0).length} with findings`}
            />
          </div>

          {/* Health bar */}
          <div className="mt-5">
            <div className="mb-1.5 flex justify-between text-xs text-slate-500">
              <span>Sample health</span>
              <span className="font-medium text-slate-700">{metrics.qualityScore}% clean</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--et-teal)] to-emerald-400 transition-all"
                style={{ width: `${metrics.qualityScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* QC check types performed */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">QC checks performed</h3>
          <p className="mt-1 text-xs text-slate-500">
            Five automated quality checks run on every completed interview. Click a check below for
            flagged records.
          </p>
          <ul className="mt-4 space-y-3">
            {(Object.keys(CHECK_META) as CheckId[]).map((id) => {
              const meta = CHECK_META[id]
              const check = checks.find((c) => c.id === id)
              const count = check?.count ?? 0
              const available = isCheckAvailable(id, result)
              const Icon = meta.icon
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                >
                  <div className={`rounded-lg p-2 ring-1 ${meta.tone}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{meta.title}</p>
                      {!available && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          Not available
                        </span>
                      )}
                      {available && count === 0 && (
                        <span className="rounded-full bg-[var(--et-teal-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--et-teal-dark)]">
                          All clear
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{meta.description}</p>
                    {id === 'speeders' && result.speeders?.threshold_seconds != null && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Rule: completion under{' '}
                        {Math.round(result.speeders.threshold_seconds)}s (25% of median time)
                      </p>
                    )}
                    {id === 'duplicate_phones' && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Rule: same normalized phone on multiple records — keep earliest response
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums text-slate-900">
                      {available ? count : '—'}
                    </p>
                    <p className="text-[10px] text-slate-400">failed</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Check cards with share bars */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Quality checks</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {checks.map((c) => {
              const meta = CHECK_META[c.id]
              if (!meta) return null
              const Icon = meta.icon
              const active = activeCheck === c.id
              const share = metrics.total > 0 ? (c.count / metrics.total) * 100 : 0
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCheck(c.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    active
                      ? 'border-[var(--et-teal)] bg-[var(--et-teal-light)]/40 ring-2 ring-[var(--et-teal)]/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Icon size={18} className={c.count > 0 ? 'text-amber-600' : 'text-[var(--et-teal)]'} />
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                        c.count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {c.count}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{meta.title}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{share.toFixed(1)}% of sample</p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${c.count > 0 ? 'bg-amber-400' : 'bg-[var(--et-teal)]/40'}`}
                      style={{ width: `${Math.min(share * 4, 100)}%` }}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <CheckDetail checkId={activeCheck} result={result} total={metrics.total} />
      </div>
    </div>
  )
}

function isCheckAvailable(id: CheckId, result: DataQualityResult): boolean {
  if (id === 'speeders') return result.speeders?.available !== false
  if (id === 'duplicate_phones') return result.duplicate_phones?.available !== false
  return true
}

function QcSummaryTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  sub: string
  icon: typeof Users
  tone: 'neutral' | 'pass' | 'fail'
}) {
  const styles = {
    neutral: 'ring-slate-200 bg-white text-slate-900',
    pass: 'ring-emerald-200 bg-emerald-50 text-emerald-900',
    fail: 'ring-rose-200 bg-rose-50 text-rose-900',
  }
  const iconStyles = {
    neutral: 'text-slate-500',
    pass: 'text-emerald-600',
    fail: 'text-rose-600',
  }
  return (
    <div className={`rounded-xl px-5 py-4 ring-1 ${styles[tone]}`}>
      <div className="flex items-center gap-2">
        <Icon size={18} className={iconStyles[tone]} />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  )
}

function QualityScoreRing({ score }: { score: number }) {
  const tone =
    score >= 90 ? 'text-[var(--et-teal-dark)]' : score >= 75 ? 'text-amber-700' : 'text-rose-700'
  const ring =
    score >= 90 ? 'ring-[var(--et-teal)]/30' : score >= 75 ? 'ring-amber-200' : 'ring-rose-200'
  const bg =
    score >= 90 ? 'bg-[var(--et-teal-light)]' : score >= 75 ? 'bg-amber-50' : 'bg-rose-50'

  return (
    <div className={`flex flex-col items-center rounded-2xl px-5 py-3 ring-1 ${ring} ${bg}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Quality score</p>
      <p className={`text-3xl font-bold tabular-nums ${tone}`}>{score}</p>
      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
        {score >= 90 ? (
          <>
            <CheckCircle2 size={12} className="text-[var(--et-teal)]" />
            Good
          </>
        ) : score >= 75 ? (
          'Review recommended'
        ) : (
          'Needs attention'
        )}
      </p>
    </div>
  )
}

function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: number
  sub: string
  tone: 'neutral' | 'warn' | 'good'
}) {
  const styles = {
    neutral: 'bg-slate-50 ring-slate-200 text-slate-900',
    warn: 'bg-amber-50 ring-amber-200 text-amber-900',
    good: 'bg-[var(--et-teal-light)] ring-[var(--et-teal)]/20 text-[var(--et-teal-dark)]',
  }
  return (
    <div className={`rounded-xl px-4 py-3 ring-1 ${styles[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>
    </div>
  )
}

function SecondaryMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-800">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
    </div>
  )
}

function CheckDetail({
  checkId,
  result,
  total,
}: {
  checkId: CheckId
  result: DataQualityResult
  total: number
}) {
  const meta = CHECK_META[checkId]

  if (checkId === 'speeders') {
    const s = result.speeders ?? { count: 0, flags: [] }
    if (s.available === false) {
      return <InfoBox title={meta.title} message={s.message || 'Not available'} />
    }
    return (
      <DetailSection
        title={meta.title}
        description={meta.description}
        count={s.count ?? 0}
        total={total}
        tone={meta.tone}
      >
        {(s.flags ?? []).map((f, i) => (
          <FlagRow
            key={`sp-${i}`}
            primary={`Response ${f.response_id}`}
            secondary={f.reason ?? `${f.seconds}s vs median ${f.median_seconds ?? s.median_seconds}s`}
            badge="Speeder"
          />
        ))}
      </DetailSection>
    )
  }

  if (checkId === 'test_responses') {
    const s = result.test_responses ?? { count: 0, flags: [] }
    return (
      <DetailSection
        title={meta.title}
        description={meta.description}
        count={s.count ?? 0}
        total={total}
        tone={meta.tone}
      >
        {(s.flags ?? []).map((f, i) => (
          <FlagRow
            key={`tr-${i}`}
            primary={`Response ${f.response_id}`}
            secondary={`${f.field}: "${f.text}"`}
            badge="Test"
          />
        ))}
      </DetailSection>
    )
  }

  if (checkId === 'duplicate_phones') {
    const s = result.duplicate_phones ?? { count: 0, flags: [], groups: [] }
    if (s.available === false) {
      return <InfoBox title={meta.title} message={s.message || 'No phone columns found'} />
    }
    return (
      <div className="space-y-4">
        {(s.groups ?? []).length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900">
              <Users size={18} className="text-[var(--et-teal)]" />
              Duplicate groups ({s.groups!.length})
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Keep the highlighted response; exclude duplicates from analysis.
            </p>
            <ul className="mt-4 space-y-3">
              {s.groups!.map((g) => (
                <li key={`${g.phone}-${g.field}`} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <p className="font-medium text-slate-800">
                    {g.phone} <span className="font-normal text-slate-500">({g.field})</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Keep <strong>#{g.keep_response_id}</strong> · drop {g.duplicate_count} duplicate(s) · IDs:{' '}
                    {g.response_ids.map(String).join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <DetailSection
          title="Flagged duplicate records"
          description={meta.description}
          count={s.count ?? 0}
          total={total}
          tone={meta.tone}
        >
          {(s.flags ?? []).map((f, i) => (
            <FlagRow
              key={`dp-${i}`}
              primary={`Response ${f.response_id} — drop`}
              secondary={`Phone ${f.phone} · keep #${f.keep_response_id}`}
              badge="Duplicate"
            />
          ))}
        </DetailSection>
      </div>
    )
  }

  if (checkId === 'straight_liners') {
    const s = result.straight_liners ?? { count: 0, flags: [] }
    return (
      <DetailSection
        title={meta.title}
        description={meta.description}
        count={s.count ?? 0}
        total={total}
        tone={meta.tone}
      >
        {(s.flags ?? []).map((f, i) => (
          <FlagRow
            key={`sl-${i}`}
            primary={`Response ${f.response_id}`}
            secondary={`${f.question} · "${f.value}" × ${f.items}`}
            badge="Straight-line"
          />
        ))}
      </DetailSection>
    )
  }

  const s = result.gibberish ?? { count: 0, flags: [] }
  return (
    <DetailSection
      title={meta.title}
      description={meta.description}
      count={s.count ?? 0}
      total={total}
      tone={meta.tone}
    >
      {(s.flags ?? []).map((f, i) => (
        <FlagRow
          key={`gb-${i}`}
          primary={`Response ${f.response_id}`}
          secondary={`${f.question}: "${f.text}"`}
          badge="Gibberish"
        />
      ))}
    </DetailSection>
  )
}

function DetailSection({
  title,
  description,
  count,
  total,
  tone,
  children,
}: {
  title: string
  description: string
  count: number
  total: number
  tone: string
  children: React.ReactNode
}) {
  const share = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            <p className="mt-1 text-[11px] text-slate-400">{share}% of scanned sample</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ring-1 ${tone}`}
          >
            {count}
          </span>
        </div>
      </div>
      {count > 0 ? (
        <ul className="divide-y divide-slate-100">{children}</ul>
      ) : (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-slate-400">
          <CheckCircle2 size={16} className="text-[var(--et-teal)]" />
          No issues detected
        </p>
      )}
    </section>
  )
}

function InfoBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <AlertTriangle className="mt-0.5 shrink-0 text-slate-400" size={20} />
      <div>
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{message}</p>
      </div>
    </div>
  )
}

function FlagRow({
  primary,
  secondary,
  badge,
}: {
  primary: string
  secondary: string
  badge: string
}) {
  return (
    <li className="flex items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{primary}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{secondary}</p>
      </div>
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
        {badge}
      </span>
    </li>
  )
}
