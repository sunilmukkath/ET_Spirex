import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import { api, type ProjectDetail, type Question } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'
import { ErrorState, LoadingState } from '../components/States'

export function ProjectDetailPage() {
  const { id } = useParams()
  const surveyId = Number(id)
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const [detail, qData] = await Promise.all([
          api.getProject(surveyId),
          api.getQuestions(surveyId),
        ])
        setProject(detail)
        setQuestions(qData.questions)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project')
      } finally {
        setLoading(false)
      }
    }
    if (surveyId) load()
  }, [surveyId])

  if (loading) return <LoadingState message="Loading project details..." />
  if (error) return <ErrorState message={error} />
  if (!project) return <ErrorState message="Project not found" />

  const completionRate =
    project.responses.total > 0
      ? Math.round((project.responses.completed / project.responses.total) * 100)
      : 0

  return (
    <div className="space-y-8">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        Back to projects
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold text-slate-900">{project.title}</h2>
              <StatusBadge status={project.status} />
            </div>
            <p className="mt-2 text-sm text-slate-500">Survey ID {project.id}</p>
            {project.description && (
              <p className="mt-4 max-w-3xl text-slate-600">{stripHtml(project.description)}</p>
            )}
          </div>
          <Link
            to={`/projects/${project.id}/analysis`}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <BarChart3 size={16} />
            Run analysis
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Completed" value={project.responses.completed} />
        <MetricCard label="Incomplete" value={project.responses.incomplete} />
        <MetricCard label="Total responses" value={project.responses.total} />
        <MetricCard label="Completion rate" value={`${completionRate}%`} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900">Schedule</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Start date" value={formatDate(project.start_date)} />
            <Row label="Expiry date" value={formatDate(project.expire_date)} />
            <Row label="Language" value={project.language || '—'} />
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900">Response breakdown</h3>
          <div className="mt-4 space-y-3">
            <ProgressBar
              label="Completed"
              value={project.responses.completed}
              total={project.responses.total}
              color="bg-emerald-500"
            />
            <ProgressBar
              label="Incomplete"
              value={project.responses.incomplete}
              total={project.responses.total}
              color="bg-amber-500"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-slate-900">Survey questions ({questions.length})</h3>
        <div className="mt-4 divide-y divide-slate-100">
          {questions.map((q) => (
            <div key={q.id} className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">{stripHtml(q.text) || q.code}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {q.group_title} · Code: {q.code} · Type: {q.type}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  )
}

function ProgressBar({
  label,
  value,
  total,
  color,
}: {
  label: string
  value: number
  total: number
  color: string
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value || value.startsWith('0000')) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, '').trim()
}
