import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  ClipboardList,
  Database,
  FileText,
  Kanban,
  Layers,
  Loader2,
  MessageSquare,
  Scale,
  ShieldCheck,
  Sigma,
  Table2,
  Users,
  Variable,
} from 'lucide-react'
import { api, type ProjectPhase, type StudyType, type SurveyOverview } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { PROJECT_PHASE_LABELS } from '../../lib/workflowPhases'
import { ET_SURVEY_HOME_TAGLINE, ET_SURVEY_HOME_TITLE, NAV_GROUP_LABELS } from '../../lib/etCopy'

interface Props {
  surveyId: number
  onNavigate: (mode: string, view?: string) => void
  /** When set, shortcut cards link to the survey workspace instead of in-app navigation. */
  buildHref?: (mode: string, view?: string) => string
  projectLabel?: string
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
  href,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  onClick?: () => void
  href?: string
}) {
  const className =
    'flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[var(--et-teal)]/40 hover:bg-[var(--et-teal-light)]/20'
  const inner = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
      </div>
    </>
  )
  if (href) {
    return (
      <Link to={href} className={className}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
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

export function SurveyHomePanel({ surveyId, onNavigate, buildHref, projectLabel }: Props) {
  const { user } = useAuth()
  const [overview, setOverview] = useState<SurveyOverview | null>(null)
  const [phase, setPhase] = useState<ProjectPhase | null>(null)
  const [studyType, setStudyType] = useState<StudyType>('quant')
  const [myOpenTasks, setMyOpenTasks] = useState(0)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatsLoading(true)
    setError(null)
    void api.getProjectWorkflow(surveyId).then((workflowData) => {
      if (cancelled) return
      setPhase(workflowData.workflow.phase ?? 'field')
      setStudyType(workflowData.workflow.study_type ?? 'quant')
      const username = user?.username
      const open =
        username != null
          ? workflowData.workflow.tasks.filter(
              (t) => t.assignee === username && t.status !== 'done',
            ).length
          : 0
      setMyOpenTasks(open)
    }).catch(() => {})

    void api
      .getSurveyOverview(surveyId)
      .then((overviewData) => {
        if (!cancelled) setOverview(overviewData)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load overview')
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [surveyId, user?.username])

  const qs = overview?.quota_summary
  const showQuant = studyType !== 'qual'

  const go = (mode: string, view?: string) => {
    if (buildHref) return { href: buildHref(mode, view) }
    return { onClick: () => onNavigate(mode, view) }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--canvas-subtle)] p-4 sm:p-6 et-scroll">
      <div className="mx-auto max-w-5xl space-y-8">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold text-slate-900">{ET_SURVEY_HOME_TITLE}</h2>
            {projectLabel && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {projectLabel}
              </span>
            )}
            {phase && (
              <span className="rounded-full bg-[var(--et-teal-light)] px-2.5 py-0.5 text-xs font-semibold text-[var(--et-teal-dark)] ring-1 ring-[var(--et-teal)]/20">
                {PROJECT_PHASE_LABELS[phase]}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {ET_SURVEY_HOME_TAGLINE}
            {myOpenTasks > 0 && (
              <>
                {' '}
                {buildHref ? (
                  <Link to={buildHref('workflow')} className="font-medium text-[var(--et-teal-dark)] hover:underline">
                    {myOpenTasks} open task{myOpenTasks === 1 ? '' : 's'} assigned to you
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate('workflow')}
                    className="font-medium text-[var(--et-teal-dark)] hover:underline"
                  >
                    {myOpenTasks} open task{myOpenTasks === 1 ? '' : 's'} assigned to you
                  </button>
                )}
              </>
            )}
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Sample stats could not be loaded ({error}). Shortcuts below still work.
          </div>
        )}

        {statsLoading && !overview && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            <Loader2 className="animate-spin text-[var(--et-teal)]" size={16} />
            Loading sample stats…
          </div>
        )}

        {overview && showQuant && (
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
        )}

        {qs && overview && showQuant && (
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

        {(studyType === 'qual' || studyType === 'mixed') && (
          <LinkSection title={NAV_GROUP_LABELS.Qual}>
            <QuickLink
              icon={<MessageSquare size={18} />}
              title="Qual library"
              desc="Upload transcripts, search sessions, and generate AI thematic summaries"
              {...go('qual')}
            />
            <QuickLink
              icon={<FileText size={18} />}
              title="Report builder"
              desc="Assemble qual and quant sections into client decks"
              {...go('reports')}
            />
          </LinkSection>
        )}

        {showQuant && (
        <LinkSection title={NAV_GROUP_LABELS.Analyze}>
          <QuickLink
            icon={<Layers size={18} />}
            title="Questions"
            desc="Distributions, summary stats, and per-question analysis setup"
            {...go('explore', 'profile')}
          />
          <QuickLink
            icon={<Table2 size={18} />}
            title="Crosstabs"
            desc="Multi-banner tables with significance testing"
            {...go('explore', 'compare')}
          />
          <QuickLink
            icon={<BarChart3 size={18} />}
            title="Charts"
            desc="Build and export visualisations"
            {...go('charts')}
          />
          <QuickLink
            icon={<Sigma size={18} />}
            title="Advanced statistics"
            desc="Correlations, regression, and advanced analysis"
            {...go('multivariate')}
          />
          <QuickLink
            icon={<FileText size={18} />}
            title="Report builder"
            desc="Assemble exportable report decks"
            {...go('reports')}
          />
        </LinkSection>
        )}

        {showQuant && (
        <LinkSection title={NAV_GROUP_LABELS.Field}>
          <QuickLink
            icon={<ClipboardList size={18} />}
            title="Fielding & quotas"
            desc="Monitor pace and configure quota targets"
            {...go('fields', 'fielding')}
          />
          <QuickLink
            icon={<ShieldCheck size={18} />}
            title="QC review"
            desc="Flagged responses, speeders, GPS checks, and exclusions"
            {...go('fields', 'quality')}
          />
          <QuickLink
            icon={<Users size={18} />}
            title="Field team"
            desc="Interviewer throughput, approvals, and rejection rates"
            {...go('fields', 'team')}
          />
        </LinkSection>
        )}

        {showQuant && (
        <LinkSection title={NAV_GROUP_LABELS.Data}>
          <QuickLink
            icon={<Variable size={18} />}
            title="Custom variables"
            desc="Recodes, nets, and combined questions"
            {...go('variables', 'custom')}
          />
          <QuickLink
            icon={<Scale size={18} />}
            title="Weighting"
            desc="Survey weight variable configuration"
            {...go('variables', 'weighting')}
          />
          <QuickLink
            icon={<Database size={18} />}
            title="Raw data"
            desc="Browse and export response-level records"
            {...go('data')}
          />
        </LinkSection>
        )}

        <LinkSection title="Project">
          <QuickLink
            icon={<Kanban size={18} />}
            title="Project workflow"
            desc={
              myOpenTasks > 0
                ? `Team roster, phase, and tasks · ${myOpenTasks} open for you`
                : 'Team roster, study phase, tasks, and translations'
            }
            {...go('workflow')}
          />
        </LinkSection>
      </div>
    </div>
  )
}
