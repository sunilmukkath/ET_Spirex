import { useState } from 'react'
import {
  AlertTriangle,
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
  { title: string; icon: typeof Clock; description: string }
> = {
  speeders: {
    title: 'Speeders',
    icon: Clock,
    description: 'Finished much faster than typical completion time',
  },
  test_responses: {
    title: 'Test / dummy responses',
    icon: FlaskConical,
    description: 'Names or text containing test, dummy, fake, asdf, etc.',
  },
  duplicate_phones: {
    title: 'Duplicate phone numbers',
    icon: Copy,
    description: 'Same phone on multiple records — keep one, flag the rest',
  },
  straight_liners: {
    title: 'Straight-lining',
    icon: Grid3x3,
    description: 'Identical answers across all items in a grid question',
  },
  gibberish: {
    title: 'Gibberish text',
    icon: MessageSquareWarning,
    description: 'Keyboard mash or meaningless open-ended answers',
  },
}

export function QualityPanel({ result, loading, error, onRefresh }: Props) {
  const [activeCheck, setActiveCheck] = useState<CheckId>('duplicate_phones')

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

  if (!result) {
    return (
      <EmptyState
        title="Data quality"
        description="Quality checks run automatically when you open this tab."
      />
    )
  }

  const checks = (result.checks ?? []) as { id: CheckId; title: string; count: number; severity: string }[]

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {loading && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <Loader2 className="animate-spin" size={14} />
            Refreshing quality report…
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-[var(--et-teal-light)] p-3 text-[var(--et-teal-dark)]">
                <ShieldAlert size={24} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Data quality report</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {(result.total_responses ?? 0).toLocaleString()} completed responses scanned
                </p>
                {result.message && (
                  <p className="mt-1 text-xs text-amber-700">{result.message}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  Use <strong>QC Approved</strong> in the dataset dropdown to analyze responses minus flagged rows.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
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
              <div className="grid grid-cols-3 gap-3 text-center">
                <StatPill label="Flagged" value={result.flagged_count ?? 0} tone="warn" />
                <StatPill label="Dupes to drop" value={result.duplicate_exclude_count ?? 0} tone="warn" />
                <StatPill label="Clean est." value={result.clean_estimate ?? 0} tone="good" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {checks.map((c) => {
            const meta = CHECK_META[c.id]
            if (!meta) return null
            const Icon = meta.icon
            const active = activeCheck === c.id
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
              </button>
            )
          })}
        </div>

        <CheckDetail checkId={activeCheck} result={result} />
      </div>
    </div>
  )
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'warn' | 'good'
}) {
  return (
    <div
      className={`rounded-xl px-3 py-2 ${
        tone === 'warn' ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-[var(--et-teal-light)] ring-1 ring-[var(--et-teal)]/20'
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone === 'warn' ? 'text-amber-900' : 'text-[var(--et-teal-dark)]'}`}>
        {value.toLocaleString()}
      </p>
    </div>
  )
}

function CheckDetail({ checkId, result }: { checkId: CheckId; result: DataQualityResult }) {
  const meta = CHECK_META[checkId]

  if (checkId === 'speeders') {
    const s = result.speeders ?? { count: 0, flags: [] }
    if (s.available === false) {
      return <InfoBox title={meta.title} message={s.message || 'Not available'} />
    }
    return (
      <DetailSection title={meta.title} description={meta.description} count={s.count ?? 0}>
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
      <DetailSection title={meta.title} description={meta.description} count={s.count ?? 0}>
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
        <DetailSection title="Flagged duplicate records" description={meta.description} count={s.count ?? 0}>
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
      <DetailSection title={meta.title} description={meta.description} count={s.count ?? 0}>
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
    <DetailSection title={meta.title} description={meta.description} count={s.count ?? 0}>
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
  children,
}: {
  title: string
  description: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
              count > 0
                ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                : 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)] ring-1 ring-[var(--et-teal)]/20'
            }`}
          >
            {count}
          </span>
        </div>
      </div>
      {count > 0 ? (
        <ul className="divide-y divide-slate-100">{children}</ul>
      ) : (
        <p className="px-5 py-4 text-sm text-slate-400">No issues detected</p>
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
