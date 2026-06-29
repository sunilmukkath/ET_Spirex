import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ChevronRight, Search, Sparkles, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { api, type ConnectionStatus, type Project } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

const STATS_BATCH = 40

function parseCreated(value: string | null | undefined): number {
  if (!value || value.startsWith('0000')) return 0
  const t = Date.parse(value)
  return Number.isNaN(t) ? 0 : t
}

function projectSortKey(project: Project): [number, number, number] {
  const statusRank = project.status === 'active' ? 0 : 1
  const created = parseCreated(project.created_date)
  return [statusRank, -created, -project.id]
}

function sortProjectsForDashboard(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const ka = projectSortKey(a)
    const kb = projectSortKey(b)
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] !== kb[i]) return ka[i] - kb[i]
    }
    return 0
  })
}

export function DashboardPage() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const statsStarted = useRef(false)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const [conn, data] = await Promise.all([api.getConnection(), api.getProjects()])
        setConnection(conn)
        setProjects(sortProjectsForDashboard(data.projects))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (loading || !projects.length || statsStarted.current) return
    statsStarted.current = true

    let cancelled = false
    const pending = projects.map((p) => p.id)

    async function loadStats() {
      setStatsLoading(true)
      for (let i = 0; i < pending.length; i += STATS_BATCH) {
        if (cancelled) break
        const batch = pending.slice(i, i + STATS_BATCH)
        try {
          const { stats } = await api.getProjectStats(batch)
          if (cancelled) break
          setProjects((prev) =>
            prev.map((p) => {
              const meta = stats[String(p.id)]
              if (!meta) return p
              return {
                ...p,
                created_date: meta.created_date ?? p.created_date,
                responses: {
                  completed: meta.completed,
                  incomplete: meta.incomplete,
                  total: meta.total,
                  loaded: true,
                },
              }
            }),
          )
        } catch {
          // continue with next batch
        }
      }
      if (!cancelled) setStatsLoading(false)
    }

    loadStats()
    return () => {
      cancelled = true
    }
  }, [loading, projects.length])

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [projects, search, statusFilter])

  const counts = useMemo(
    () => ({
      all: projects.length,
      active: projects.filter((p) => p.status === 'active').length,
      inactive: projects.filter((p) => p.status === 'inactive').length,
      expired: projects.filter((p) => p.status === 'expired').length,
    }),
    [projects],
  )

  if (loading) return <LoadingState message="Loading surveys..." />
  if (error) return <ErrorState message={error} />

  return (
    <div className="space-y-8 animate-fade-in">
      <section className="et-hero relative overflow-hidden rounded-2xl px-6 py-8 text-white shadow-xl sm:px-8 sm:py-10">
        <div className="relative z-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-[var(--et-teal-light)]">
            <Sparkles size={14} />
            Welcome back, {user?.username}
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Your surveys</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">
            Active surveys first, newest at the top. Open a survey to explore questions, build charts, run crosstabs, or review quality.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {connection && (
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                  connection.connected
                    ? 'bg-[var(--et-teal)]/30 text-[var(--et-teal-light)] ring-1 ring-white/20'
                    : 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-300/30'
                }`}
              >
                {connection.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
                {connection.connected
                  ? `Connected · ${connection.survey_count} surveys`
                  : connection.message || 'Not connected'}
              </div>
            )}
            {statsLoading && (
              <span className="text-xs text-white/50">Refreshing response counts…</span>
            )}
          </div>
        </div>
        <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[var(--et-teal)]/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-[var(--et-gold)]/10 blur-2xl" />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: counts.all, tone: 'text-slate-900' },
          { label: 'Active', value: counts.active, tone: 'text-emerald-700' },
          { label: 'Inactive', value: counts.inactive, tone: 'text-slate-600' },
          { label: 'Expired', value: counts.expired, tone: 'text-amber-700' },
        ].map((stat) => (
          <div key={stat.label} className="et-metric-card px-4 py-3">
            <p className="et-kicker">{stat.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="et-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="search"
            placeholder="Search by survey name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="et-input et-input-with-icon"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'active', 'inactive', 'expired'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`et-chip ${statusFilter === s ? 'et-chip-active' : 'et-chip-inactive'}`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              <span className="opacity-60">{counts[s]}</span>
            </button>
          ))}
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState title="No surveys found" description="Try a different search or filter." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              state={{ title: project.title }}
              className="et-card group flex flex-col p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={project.status} />
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${
                      !project.responses.loaded
                        ? 'bg-slate-100 text-slate-400 ring-1 ring-slate-200'
                        : project.responses.completed > 0
                          ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                          : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                    }`}
                  >
                    {project.responses.loaded
                      ? `${project.responses.completed.toLocaleString()} completed`
                      : '… loading'}
                  </span>
                </div>
                <span className="text-xs text-slate-400">#{project.id}</span>
              </div>
              <h3 className="mt-3 line-clamp-2 flex-1 text-base font-semibold text-slate-900 group-hover:text-[var(--et-teal-dark)]">
                {project.title}
              </h3>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="text-xs text-slate-500">
                  {project.created_date && !project.created_date.startsWith('0000')
                    ? `Created ${formatDate(project.created_date)}`
                    : project.expire_date && !project.expire_date.startsWith('0000')
                      ? `Expires ${formatDate(project.expire_date)}`
                      : 'No expiry'}
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--et-teal)] opacity-0 transition group-hover:opacity-100">
                  <BarChart3 size={14} />
                  Analyze
                  <ChevronRight size={14} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value || value.startsWith('0000')) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
