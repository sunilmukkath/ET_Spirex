import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ChevronRight, Search, Sparkles, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { api, type ConnectionStatus, type Project } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

const PAGE_SIZE = 24
const STATS_BATCH = 40

function parseCreated(value: string | null | undefined): number {
  if (!value || value.startsWith('0000')) return 0
  const t = Date.parse(value)
  return Number.isNaN(t) ? 0 : t
}

function sortByCreated(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const da = parseCreated(a.created_date) || a.id
    const db = parseCreated(b.created_date) || b.id
    return db - da
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
  const [page, setPage] = useState(1)
  const statsStarted = useRef(false)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const [conn, data] = await Promise.all([api.getConnection(), api.getProjects()])
        setConnection(conn)
        setProjects(data.projects)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Load completed sample sizes + creation dates in batches (background)
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
          setProjects((prev) => {
            const updated = prev.map((p) => {
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
            })
            return sortByCreated(updated)
          })
        } catch {
          // continue with next batch
        }
      }
      if (!cancelled) setStatsLoading(false)
    }

    loadStats()
    return () => { cancelled = true }
  }, [loading, projects.length])

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [projects, search, statusFilter])

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  useEffect(() => setPage(1), [search, statusFilter])

  const counts = useMemo(() => ({
    all: projects.length,
    active: projects.filter((p) => p.status === 'active').length,
    inactive: projects.filter((p) => p.status === 'inactive').length,
    expired: projects.filter((p) => p.status === 'expired').length,
  }), [projects])

  if (loading) return <LoadingState message="Loading surveys..." />
  if (error) return <ErrorState message={error} />

  return (
    <div className="space-y-8 animate-fade-in">
      <section className="et-hero overflow-hidden rounded-2xl px-6 py-8 text-white shadow-xl sm:px-8 sm:py-10">
        <div className="relative z-10">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-[var(--et-teal-light)]">
            <Sparkles size={14} />
            Welcome back, {user?.username}
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Your surveys</h2>
          <p className="mt-2 max-w-xl text-sm text-white/70">
            Sorted by newest first. Open a survey to explore, chart, crosstab, or run quality checks.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {connection && (
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                connection.connected
                  ? 'bg-[var(--et-teal)]/30 text-[var(--et-teal-light)] ring-1 ring-white/20'
                  : 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-300/30'
              }`}>
                {connection.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
                {connection.connected
                  ? `Connected · ${connection.survey_count} surveys`
                  : connection.message || 'Not connected'}
              </div>
            )}
            {statsLoading && (
              <span className="text-xs text-white/50">Loading sample sizes…</span>
            )}
          </div>
        </div>
        <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[var(--et-teal)]/20 blur-2xl" />
      </section>

      <section className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="search"
            placeholder="Search by survey name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm shadow-sm outline-none ring-[var(--et-teal)] focus:ring-2"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'active', 'inactive', 'expired'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                statusFilter === s
                  ? 'bg-[var(--et-navy)] text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              <span className="ml-1.5 opacity-60">{counts[s]}</span>
            </button>
          ))}
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState title="No surveys found" description="Try a different search or filter." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginated.map((project) => (
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

          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page * PAGE_SIZE >= filtered.length}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
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
