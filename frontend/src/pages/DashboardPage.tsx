import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpDown,
  BarChart3,
  Calendar,
  ChevronRight,
  Globe,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  User,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { api, type ConnectionStatus, type Project } from '../api/client'
import { loadFavoriteSurveyIds, toggleFavoriteSurveyId } from '../lib/dashboardFavorites'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, LoadingState, SkeletonBlock } from '../components/States'

const STATS_BATCH = 40

type StatusFilter = 'all' | 'active' | 'inactive' | 'expired'
type SortKey = 'newest' | 'oldest' | 'name' | 'responses' | 'expiring'
type ViewMode = 'grid' | 'table'

function parseCreated(value: string | null | undefined): number {
  if (!value || value.startsWith('0000')) return 0
  const t = Date.parse(value)
  return Number.isNaN(t) ? 0 : t
}

function parseDate(value: string | null | undefined): number {
  if (!value || value.startsWith('0000')) return 0
  const t = Date.parse(value)
  return Number.isNaN(t) ? 0 : t
}

function formatDate(value: string | null) {
  if (!value || value.startsWith('0000')) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatRelativeExpiry(expireDate: string | null): string | null {
  if (!expireDate || expireDate.startsWith('0000')) return null
  const exp = new Date(expireDate)
  if (Number.isNaN(exp.getTime())) return null
  const days = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (days < 0) return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  if (days <= 14) return `Expires in ${days}d`
  return null
}

function matchesSearch(project: Project, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (project.title.toLowerCase().includes(q)) return true
  if (String(project.id).includes(q)) return true
  if (String(project.owner).toLowerCase().includes(q)) return true
  if (project.language.toLowerCase().includes(q)) return true
  return false
}

function sortProjects(projects: Project[], sortKey: SortKey, favoriteIds: number[]): Project[] {
  const favSet = new Set(favoriteIds)
  return [...projects].sort((a, b) => {
    const aFav = favSet.has(a.id) ? 0 : 1
    const bFav = favSet.has(b.id) ? 0 : 1
    if (aFav !== bFav) return aFav - bFav

    switch (sortKey) {
      case 'name':
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      case 'oldest': {
        const ca = parseCreated(a.created_date) || a.id
        const cb = parseCreated(b.created_date) || b.id
        return ca - cb || a.id - b.id
      }
      case 'responses':
        return (
          (b.responses.completed ?? 0) - (a.responses.completed ?? 0) ||
          (b.responses.total ?? 0) - (a.responses.total ?? 0)
        )
      case 'expiring': {
        const ea = parseDate(a.expire_date) || Number.MAX_SAFE_INTEGER
        const eb = parseDate(b.expire_date) || Number.MAX_SAFE_INTEGER
        return ea - eb || b.id - a.id
      }
      case 'newest':
      default: {
        const ca = parseCreated(a.created_date)
        const cb = parseCreated(b.created_date)
        if (ca > 0 && cb > 0) return cb - ca
        if (ca > 0) return -1
        if (cb > 0) return 1
        return b.id - a.id
      }
    }
  })
}

function mergeStats(projects: Project[], stats: Record<string, { completed: number; incomplete: number; total: number; created_date?: string | null }>): Project[] {
  return projects.map((p) => {
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
}

export function DashboardPage() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsLoaded, setStatsLoaded] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [favorites, setFavorites] = useState<number[]>(() => loadFavoriteSurveyIds())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const loadGeneration = useRef(0)

  const loadProjects = useCallback(async (generation: number) => {
    const [conn, data] = await Promise.all([api.getConnection(), api.getProjects()])
    if (generation !== loadGeneration.current) return
    setConnection(conn)
    setProjects(data.projects)
    setStatsLoaded(0)
    return data.projects
  }, [])

  const loadStats = useCallback(async (projectList: Project[], generation: number) => {
    const pending = projectList.map((p) => p.id)
    if (!pending.length) return

    setStatsLoading(true)
    let loaded = 0
    for (let i = 0; i < pending.length; i += STATS_BATCH) {
      if (generation !== loadGeneration.current) return
      const batch = pending.slice(i, i + STATS_BATCH)
      try {
        const { stats } = await api.getProjectStats(batch)
        if (generation !== loadGeneration.current) return
        loaded += batch.length
        setStatsLoaded(loaded)
        setProjects((prev) => mergeStats(prev, stats))
      } catch {
        loaded += batch.length
        setStatsLoaded(loaded)
      }
    }
    if (generation === loadGeneration.current) setStatsLoading(false)
  }, [])

  useEffect(() => {
    const generation = ++loadGeneration.current
    let cancelled = false

    async function init() {
      try {
        setLoading(true)
        setError(null)
        const list = await loadProjects(generation)
        if (cancelled || !list) return
        await loadStats(list, generation)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load projects')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [loadProjects, loadStats])

  const handleRefresh = useCallback(async () => {
    const generation = ++loadGeneration.current
    setRefreshing(true)
    setError(null)
    setStatsLoaded(0)
    try {
      const list = await loadProjects(generation)
      if (list) await loadStats(list, generation)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh surveys')
    } finally {
      if (generation === loadGeneration.current) setRefreshing(false)
    }
  }, [loadProjects, loadStats])

  const favoriteSet = useMemo(() => new Set(favorites), [favorites])

  const filtered = useMemo(() => {
    const rows = projects.filter((p) => {
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter
      const matchesFav = !showFavoritesOnly || favoriteSet.has(p.id)
      return matchesSearch(p, search) && matchesStatus && matchesFav
    })
    return sortProjects(rows, sortKey, showFavoritesOnly ? [] : favorites)
  }, [projects, search, statusFilter, showFavoritesOnly, favoriteSet, sortKey, favorites])

  const counts = useMemo(
    () => ({
      all: projects.length,
      active: projects.filter((p) => p.status === 'active').length,
      inactive: projects.filter((p) => p.status === 'inactive').length,
      expired: projects.filter((p) => p.status === 'expired').length,
    }),
    [projects],
  )

  const totalResponses = useMemo(
    () => projects.reduce((sum, p) => sum + (p.responses.loaded ? p.responses.completed : 0), 0),
    [projects],
  )

  const hasActiveFilters =
    search.trim() !== '' || statusFilter !== 'all' || showFavoritesOnly || sortKey !== 'newest'

  const statsProgress = projects.length ? Math.round((statsLoaded / projects.length) * 100) : 0

  if (loading) return <LoadingState message="Loading surveys..." />
  if (error && !projects.length) return <ErrorState message={error} />

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="rounded-xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">
              Welcome back, <span className="text-slate-700">{user?.username}</span>
            </p>
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Your surveys
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {connection && (
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  connection.connected
                    ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                    : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                }`}
              >
                {connection.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
                {connection.connected
                  ? `${connection.survey_count} surveys`
                  : connection.message || 'Not connected'}
              </div>
            )}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing || statsLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
            >
              <RefreshCw size={13} className={refreshing || statsLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
        {statsLoading && (
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[var(--et-teal)] transition-all duration-300"
                style={{ width: `${statsProgress}%` }}
              />
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{statsProgress}%</span>
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Total surveys', value: counts.all, tone: 'text-slate-900' },
          { label: 'Active', value: counts.active, tone: 'text-emerald-700' },
          { label: 'Inactive', value: counts.inactive, tone: 'text-slate-600' },
          { label: 'Expired', value: counts.expired, tone: 'text-amber-700' },
          {
            label: 'Completed responses',
            value: statsLoading && totalResponses === 0 ? '…' : totalResponses.toLocaleString(),
            tone: 'text-sky-700',
          },
        ].map((stat) => (
          <div key={stat.label} className="et-metric-card px-4 py-3">
            <p className="et-kicker">{stat.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="et-panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="search"
              placeholder="Search by name, ID, owner, or language…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="et-input et-input-with-icon pr-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="survey-sort">
              Sort surveys
            </label>
            <div className="relative">
              <ArrowUpDown size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                id="survey-sort"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="et-select appearance-none py-2 pl-8 pr-8 text-xs"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A–Z</option>
                <option value="responses">Most responses</option>
                <option value="expiring">Expiring soon</option>
              </select>
            </div>
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`rounded-md p-2 transition ${viewMode === 'grid' ? 'bg-white text-[var(--et-teal-dark)] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`rounded-md p-2 transition ${viewMode === 'table' ? 'bg-white text-[var(--et-teal-dark)] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                aria-label="Table view"
                aria-pressed={viewMode === 'table'}
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            onClick={() => setShowFavoritesOnly((v) => !v)}
            className={`et-chip ${showFavoritesOnly ? 'et-chip-active' : 'et-chip-inactive'}`}
          >
            <Star size={14} className={showFavoritesOnly ? 'fill-current' : ''} />
            Favorites
            <span className="opacity-60">{favorites.length}</span>
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setStatusFilter('all')
                setShowFavoritesOnly(false)
                setSortKey('newest')
              }}
              className="et-chip et-chip-inactive text-slate-500"
            >
              <X size={14} />
              Clear filters
            </button>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of{' '}
          {projects.length} surveys
          {!showFavoritesOnly && favorites.length > 0 && sortKey === 'newest' && (
            <span className="text-slate-400"> · Favorites pinned to top</span>
          )}
        </p>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          title="No surveys found"
          description={
            showFavoritesOnly
              ? 'Star surveys to add them to your favorites, or turn off the favorites filter.'
              : 'Try a different search term or status filter.'
          }
        />
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project) => (
            <SurveyCard
              key={project.id}
              project={project}
              isFavorite={favoriteSet.has(project.id)}
              onToggleFavorite={() => setFavorites(toggleFavoriteSurveyId(project.id))}
            />
          ))}
        </div>
      ) : (
        <SurveyTable
          projects={filtered}
          favoriteSet={favoriteSet}
          onToggleFavorite={(id) => setFavorites(toggleFavoriteSurveyId(id))}
        />
      )}
    </div>
  )
}

function SurveyCard({
  project,
  isFavorite,
  onToggleFavorite,
}: {
  project: Project
  isFavorite: boolean
  onToggleFavorite: () => void
}) {
  const expiryHint = formatRelativeExpiry(project.expire_date)
  const loaded = project.responses.loaded

  return (
    <article className="et-card group relative flex flex-col p-5">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          onToggleFavorite()
        }}
        className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-300 hover:bg-slate-50 hover:text-amber-500"
        aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
      >
        <Star size={16} className={isFavorite ? 'fill-amber-400 text-amber-500' : ''} />
      </button>

      <Link
        to={`/projects/${project.id}?mode=home`}
        state={{ title: project.title }}
        className="flex flex-1 flex-col"
      >
        <div className="flex items-start justify-between gap-2 pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={project.status} />
            {expiryHint && project.status === 'active' && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
                {expiryHint}
              </span>
            )}
          </div>
          <span className="shrink-0 font-mono text-xs text-slate-400">#{project.id}</span>
        </div>

        <h3 className="mt-3 line-clamp-2 flex-1 text-base font-semibold leading-snug text-slate-900 group-hover:text-[var(--et-teal-dark)]">
          {project.title}
        </h3>

        <div className="mt-3">
          {!loaded ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-5 w-32 rounded-full" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-semibold tabular-nums text-slate-800">
                {project.responses.completed.toLocaleString()}{' '}
                <span className="font-normal text-slate-500">completed</span>
              </p>
              {(project.responses.incomplete > 0 || project.responses.total > project.responses.completed) && (
                <p className="text-xs text-slate-500">
                  {project.responses.incomplete.toLocaleString()} incomplete ·{' '}
                  {project.responses.total.toLocaleString()} total
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {project.language && (
            <span className="inline-flex items-center gap-1">
              <Globe size={12} className="text-slate-400" />
              {project.language.toUpperCase()}
            </span>
          )}
          {project.owner != null && String(project.owner).trim() !== '' && (
            <span className="inline-flex items-center gap-1">
              <User size={12} className="text-slate-400" />
              {String(project.owner)}
            </span>
          )}
          {project.created_date && !project.created_date.startsWith('0000') ? (
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} className="text-slate-400" />
              {formatDate(project.created_date)}
            </span>
          ) : project.expire_date && !project.expire_date.startsWith('0000') ? (
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} className="text-slate-400" />
              Expires {formatDate(project.expire_date)}
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="flex gap-2 opacity-0 transition group-hover:opacity-100">
            <QuickAction to={`/projects/${project.id}?mode=charts`} icon={<BarChart3 size={12} />} label="Charts" />
            <QuickAction to={`/projects/${project.id}?mode=quality`} icon={<ShieldCheck size={12} />} label="QC" />
          </div>
          <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-[var(--et-teal)] opacity-0 transition group-hover:opacity-100">
            Open
            <ChevronRight size={14} />
          </span>
        </div>
      </Link>
    </article>
  )
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-[var(--et-teal-light)] hover:text-[var(--et-teal-dark)]"
    >
      {icon}
      {label}
    </Link>
  )
}

function SurveyTable({
  projects,
  favoriteSet,
  onToggleFavorite,
}: {
  projects: Project[]
  favoriteSet: Set<number>
  onToggleFavorite: (id: number) => void
}) {
  return (
    <div className="et-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-3 py-3" aria-label="Favorite" />
              <th className="px-4 py-3 font-semibold">Survey</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Responses</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Expires</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="w-24 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const isFavorite = favoriteSet.has(project.id)
              const loaded = project.responses.loaded
              return (
                <tr key={project.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(project.id)}
                      className="rounded-md p-1 text-slate-300 hover:text-amber-500"
                      aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
                    >
                      <Star size={15} className={isFavorite ? 'fill-amber-400 text-amber-500' : ''} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/projects/${project.id}?mode=home`}
                      state={{ title: project.title }}
                      className="font-medium text-slate-900 hover:text-[var(--et-teal-dark)]"
                    >
                      <span className="line-clamp-2">{project.title}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-slate-400">#{project.id}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={project.status} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">
                    {!loaded ? (
                      <SkeletonBlock className="h-4 w-16" />
                    ) : (
                      <div>
                        <span className="font-medium">{project.responses.completed.toLocaleString()}</span>
                        <span className="text-slate-400"> / {project.responses.total.toLocaleString()}</span>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {formatDate(project.created_date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {formatDate(project.expire_date)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{String(project.owner ?? '—')}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/projects/${project.id}?mode=home`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--et-teal)] hover:underline"
                    >
                      Open
                      <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
