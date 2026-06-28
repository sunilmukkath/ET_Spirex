import { Loader2, ShieldAlert } from 'lucide-react'
import type { DataQualityResult } from '../../api/client'
import { EmptyState, ErrorState } from '../States'

interface Props {
  result: DataQualityResult | null
  loading: boolean
  error: string | null
}

export function QualityPanel({ result, loading, error }: Props) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-[var(--et-teal)]" size={32} />
          <p className="mt-4 text-sm text-slate-500">Scanning response quality…</p>
        </div>
      </div>
    )
  }

  if (error) return <div className="p-6"><ErrorState message={error} /></div>
  if (!result) {
    return (
      <EmptyState
        title="Data quality"
        description="Run a quality scan to flag speeders, straight-lining, and low-quality text."
      />
    )
  }

  const { speeders, straight_liners, gibberish } = result

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[var(--et-teal-light)] p-3 text-[var(--et-teal-dark)]">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Data hygiene scan</h2>
              <p className="mt-1 text-sm text-slate-500">
                {(result.total_responses ?? 0).toLocaleString()} responses ·{' '}
                <strong className="text-slate-700">{(result.flagged_count ?? 0).toLocaleString()}</strong> flagged
              </p>
            </div>
          </div>
        </div>

        <QualitySection
          title="Speeders"
          description={
            speeders.available
              ? `Completed faster than ${speeders.threshold_seconds ?? '—'}s (median ${speeders.median_seconds ?? '—'}s)`
              : speeders.message || 'Not available for this survey'
          }
          count={speeders.count ?? 0}
        >
          {(speeders.flags ?? []).map((f, i) => (
            <FlagRow
              key={`speeder-${f.response_id}-${i}`}
              primary={`Response ${formatId(f.response_id)}`}
              secondary={`${f.seconds}s (median ${f.median_seconds ?? speeders.median_seconds ?? '—'}s)`}
            />
          ))}
        </QualitySection>

        <QualitySection
          title="Straight-lining"
          description="Same answer across all items in a grid/matrix question"
          count={straight_liners.count ?? 0}
        >
          {(straight_liners.flags ?? []).map((f, i) => (
            <FlagRow
              key={`straight-${f.response_id}-${f.variable_id}-${i}`}
              primary={`Response ${formatId(f.response_id)}`}
              secondary={`${formatLabel(f.question)} · "${formatLabel(f.value)}" × ${f.items}`}
            />
          ))}
        </QualitySection>

        <QualitySection
          title="Gibberish text"
          description="Keyboard mash, repeated characters, or meaningless short answers"
          count={gibberish.count ?? 0}
        >
          {(gibberish.flags ?? []).map((f, i) => (
            <FlagRow
              key={`gibberish-${f.response_id}-${f.variable_id}-${i}`}
              primary={`Response ${formatId(f.response_id)}`}
              secondary={`${formatLabel(f.question)}: "${formatLabel(f.text)}"`}
            />
          ))}
        </QualitySection>
      </div>
    </div>
  )
}

function QualitySection({
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

function FlagRow({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <li className="px-5 py-3">
      <p className="text-sm font-medium text-slate-800">{primary}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{secondary}</p>
    </li>
  )
}

function formatId(value: string | number | undefined): string {
  if (value === undefined || value === null) return '—'
  return String(value)
}

function formatLabel(value: string | number | undefined): string {
  if (value === undefined || value === null) return '—'
  return String(value)
}
