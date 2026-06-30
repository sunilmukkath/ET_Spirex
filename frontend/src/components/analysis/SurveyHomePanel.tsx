import { useEffect, useState } from 'react'
import {
  BarChart3,
  ClipboardList,
  Database,
  FileText,
  Kanban,
  Layers,
  Loader2,
  ShieldCheck,
  Sigma,
  SlidersHorizontal,
  Table2,
  Users,
} from 'lucide-react'
import { api, type SurveyOverview } from '../../api/client'

interface Props {
  surveyId: number
  onNavigate: (mode: string, view?: string) => void
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

function QuickLink({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[var(--et-teal)]/40 hover:bg-[var(--et-teal-light)]/20"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
      </div>
    </button>
  )
}

function LinkSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

export function SurveyHomePanel({ surveyId, onNavigate }: Props) {
  const [overview, setOverview] = useState<SurveyOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .getSurveyOverview(surveyId)
      .then((data) => {
        if (!cancelled) setOverview(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load overview')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [surveyId])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
      </div>
    )
  }

  if (error || !overview) {
    return <p className="p-8 text-sm text-rose-700">{error ?? 'No overview data'}</p>
  }

  const qs = overview.quota_summary

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--canvas-subtle)] p-4 sm:p-6 et-scroll">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <h2 className="font-display text-xl font-semibold text-slate-900">Survey home</h2>
          <p className="mt-1 text-sm text-slate-500">
            Mission control — sample health, quotas, and shortcuts to every part of this study.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Completed" value={overview.response_count.toLocaleString()} />
          <StatCard
            label="QC approved"
            value={overview.qc_approved_count.toLocaleString()}
            sub={`${overview.qc_excluded_count} excluded`}
          />
          <StatCard label="Questions" value={overview.question_count} sub={`${overview.banner_ready_count} banner-ready`} />
          <StatCard label="Incomplete" value={overview.incomplete_count.toLocaleString()} />
        </div>

        {qs && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Quota snapshot</h3>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">
                {qs.fields_ok} met
              </span>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">
                {qs.fields_under} under
              </span>
              <span className="rounded-full bg-rose-100 px-2.5 py-1 font-semibold text-rose-800">
                {qs.fields_over} over
              </span>
              <span className="text-slate-500">
                {qs.total_completes.toLocaleString()} checked · {overview.quota_field_count} fields ·{' '}
                {overview.quota_layer_count} layers
              </span>
            </div>
          </div>
        )}

        <LinkSection title="Analyze">
          <QuickLink
            icon={<Layers size={18} />}
            title="Question profiles"
            desc="Single-question distributions and summary stats"
            onClick={() => onNavigate('explore', 'profile')}
          />
          <QuickLink
            icon={<Table2 size={18} />}
            title="Crosstabs"
            desc="Multi-banner tables with significance testing"
            onClick={() => onNavigate('explore', 'compare')}
          />
          <QuickLink
            icon={<BarChart3 size={18} />}
            title="Charts"
            desc="Build and export visualisations"
            onClick={() => onNavigate('charts')}
          />
          <QuickLink
            icon={<Sigma size={18} />}
            title="Statistics"
            desc="Correlations, regression, and advanced analysis"
            onClick={() => onNavigate('multivariate')}
          />
          <QuickLink
            icon={<FileText size={18} />}
            title="Reports"
            desc="Assemble exportable report decks"
            onClick={() => onNavigate('reports')}
          />
        </LinkSection>

        <LinkSection title="Field & project">
          <QuickLink
            icon={<ClipboardList size={18} />}
            title="Fielding & quotas"
            desc="Monitor pace and configure quota targets"
            onClick={() => onNavigate('fields', 'fielding')}
          />
          <QuickLink
            icon={<ShieldCheck size={18} />}
            title="Response quality"
            desc="QC scan, flagged records, GPS proximity checks"
            onClick={() => onNavigate('fields', 'quality')}
          />
          <QuickLink
            icon={<Users size={18} />}
            title="Interviewers"
            desc="Throughput and rejection rates by field team member"
            onClick={() => onNavigate('fields', 'team')}
          />
          <QuickLink
            icon={<Kanban size={18} />}
            title="Workflow & tasks"
            desc="Team assignments, module access, and task tracker"
            onClick={() => onNavigate('workflow')}
          />
        </LinkSection>

        <LinkSection title="Data">
          <QuickLink
            icon={<SlidersHorizontal size={18} />}
            title="Data setup"
            desc="Question types, weights, recodes, and derived variables"
            onClick={() => onNavigate('variables')}
          />
          <QuickLink
            icon={<Database size={18} />}
            title="Raw data"
            desc="Browse and export response-level records"
            onClick={() => onNavigate('data')}
          />
        </LinkSection>
      </div>
    </div>
  )
}
