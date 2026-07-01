import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpDown,
  Calendar,
  ChevronRight,
  ClipboardList,
  Globe,
  LayoutGrid,
  List,
  Pin,
  RefreshCw,
  RotateCcw,
  Search,
  Table2,
  User,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { api, type ConnectionStatus, type MyTaskRow, type Project } from '../api/client'
import { usePinnedSurveys } from '../hooks/usePinnedSurveys'
import {
  loadUserAppSession,
  resolveSurveyHref,
  saveUserAppSession,
} from '../lib/workspaceSession'
import { PROJECT_PHASE_LABELS } from '../lib/workflowPhases'
import { ET_DASHBOARD_SUBTITLE, ET_DASHBOARD_TITLE } from '../lib/etCopy'
import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS } from '../lib/workflowAccess'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState, ErrorState, LoadingState, SkeletonBlock } from '../components/States'

const STATS_BATCH = 50
const PRIORITY_STATS_COUNT = 30
const DASHBOARD_STRIP_LIMIT = 10

type StatusFilter = 'all' | 'active' | 'inactive' | 'expired'
type SortKey = 'newest' | 'oldest' | 'name' | 'responses' | 'expiring'
type ViewMode = 'strips' | 'table'

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

function sortProjects(projects: Project[], sortKey: SortKey, pinnedIds: number[]): Project[] {
  const pinOrder = new Map(pinnedIds.map((id, index) => [id, index]))
  const isPinned = (id: number) => pinOrder.has(id)
  return [...projects].sort((a, b) => {
    const aPinned = isPinned(a.id)
    const bPinned = isPinned(b.id)
    if (aPinned !== bPinned) return aPinned ? -1 : 1
    if (aPinned && bPinned) {
      return (pinOrder.get(a.id) ?? 0) - (pinOrder.get(b.id) ?? 0)
    }

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
  const appSession = useMemo(
    () => (user?.username ? loadUserAppSession(user.username) : null),
    [user?.username],
  )
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsLoaded, setStatsLoaded] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>(
    () => (appSession?.dashboardSortKey as SortKey | undefined) ?? 'newest',
  )
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = appSession?.dashboardViewMode as string | undefined
    if (saved === 'table') return 'table'
    return 'strips'
  })
  const { pinnedIds, pinnedSet, toggle: togglePinned } = usePinnedSurveys()
  const pinnedIdsRef = useRef(pinnedIds)
  pinnedIdsRef.current = pinnedIds
  const [showPinnedOnly, setShowPinnedOnly] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [myTasks, setMyTasks] = useState<MyTaskRow[]>([])
  const [myTasksLoading, setMyTasksLoading] = useState(true)
  const loadGeneration = useRef(0)

  useEffect(() => {
    if (!user?.username) return
    saveUserAppSession(user.username, {
      dashboardViewMode: viewMode,
      dashboardSortKey: sortKey,
    })
  }, [user?.username, viewMode, sortKey])

  const resumePath = useMemo(() => {
    if (!user?.username || !appSession?.lastSurveyId) return null
    return resolveSurveyHref(user.username, appSession.lastSurveyId)
  }, [user?.username, appSession?.lastSurveyId])

  const loadProjects = useCallback(async (generation: number) => {
    const data = await api.getProjects()
    if (generation !== loadGeneration.current) return
    setProjects(data.projects)
    setStatsLoaded(0)
    return data.projects
  }, [])

  const loadConnection = useCallback(async (generation: number) => {
    try {
      const conn = await api.getConnection()
      if (generation === loadGeneration.current) setConnection(conn)
    } catch {
      if (generation === loadGeneration.current) {
        setConnection({
          connected: false,
          configured: true,
          message: 'Could not reach LimeSurvey',
        })
      }
    }
  }, [])

  const loadStatsBatch = useCallback(async (ids: number[], generation: number) => {
    if (!ids.length || generation !== loadGeneration.current) return
    for (let i = 0; i < ids.length; i += STATS_BATCH) {
      if (generation !== loadGeneration.current) return
      const batch = ids.slice(i, i + STATS_BATCH)
      try {
        const { stats } = await api.getProjectStats(batch)
        if (generation !== loadGeneration.current) return
        setStatsLoaded((prev) => prev + batch.length)
        setProjects((prev) => mergeStats(prev, stats))
      } catch {
        if (generation !== loadGeneration.current) return
        setStatsLoaded((prev) => prev + batch.length)
      }
    }
  }, [])

  const loadStats = useCallback(
    async (projectList: Project[], generation: number, priorityIds: number[]) => {
      const allIds = projectList.map((p) => p.id)
      if (!allIds.length) return

      const prioritySet = new Set(priorityIds)
      const priority = [
        ...priorityIds.filter((id) => allIds.includes(id)),
        ...allIds.filter((id) => !prioritySet.has(id)).slice(0, PRIORITY_STATS_COUNT),
      ]
      const priorityUnique = [...new Set(priority)]
      const deferred = allIds.filter((id) => !priorityUnique.includes(id))

      setStatsLoading(true)
      setStatsLoaded(0)
      await loadStatsBatch(priorityUnique, generation)
      if (generation === loadGeneration.current) setStatsLoading(false)

      if (deferred.length) {
        void loadStatsBatch(deferred, generation)
      }
    },
    [loadStatsBatch],
  )

  useEffect(() => {
    const generation = ++loadGeneration.current
    let cancelled = false

    async function init() {
      try {
        setLoading(true)
        setError(null)
        void loadConnection(generation)
        const list = await loadProjects(generation)
        if (cancelled || !list) return
        setLoading(false)
        void loadStats(list, generation, pinnedIdsRef.current)
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load projects'
          setError(msg)
        }
        if (!cancelled) setLoading(false)
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [loadProjects, loadStats, loadConnection])

  useEffect(() => {
    let cancelled = false
    setMyTasksLoading(true)
    api
      .getMyTasks()
      .then((data) => {
        if (!cancelled) setMyTasks(data.tasks)
      })
      .catch(() => {
        if (!cancelled) setMyTasks([])
      })
      .finally(() => {
        if (!cancelled) setMyTasksLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    const generation = ++loadGeneration.current
    setRefreshing(true)
    setError(null)
    setStatsLoaded(0)
    try {
      void loadConnection(generation)
      const list = await loadProjects(generation)
      if (list) {
        setLoading(false)
        void loadStats(list, generation, pinnedIds)
      }
      const tasks = await api.getMyTasks()
      if (generation === loadGeneration.current) setMyTasks(tasks.tasks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh surveys')
    } finally {
      if (generation === loadGeneration.current) setRefreshing(false)
    }
  }, [loadProjects, loadStats, loadConnection, pinnedIds])

  const filtered = useMemo(() => {
    const rows = projects.filter((p) => {
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter
      const matchesPin = !showPinnedOnly || pinnedSet.has(p.id)
      return matchesSearch(p, search) && matchesStatus && matchesPin
    })
    return sortProjects(rows, sortKey, showPinnedOnly ? [] : pinnedIds)
  }, [projects, search, statusFilter, showPinnedOnly, pinnedSet, sortKey, pinnedIds])

  const pinnedProjects = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]))
    return pinnedIds.map((id) => byId.get(id)).filter((p): p is Project => Boolean(p))
  }, [projects, pinnedIds])

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

  const stripProjects = useMemo(
    () => filtered.slice(0, DASHBOARD_STRIP_LIMIT),
    [filtered],
  )

  const hasActiveFilters =
    search.trim() !== '' || statusFilter !== 'all' || showPinnedOnly || sortKey !== 'newest'

  const statsProgress = projects.length
    ? Math.min(100, Math.round((statsLoaded / projects.length) * 100))
    : 0

  if (loading) return <LoadingState message="Loading projects…" />
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
              {ET_DASHBOARD_TITLE}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{ET_DASHBOARD_SUBTITLE}</p>
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
                  ? `${connection.survey_count ?? projects.length} studies on LimeSurvey`
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

      {resumePath && appSession?.lastSurveyTitle && (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <RotateCcw size={16} className="shrink-0 text-[var(--et-teal)]" />
              <p className="text-sm text-slate-600">
                Continue where you left off:{' '}
                <span className="font-semibold text-slate-900">{appSession.lastSurveyTitle}</span>
              </p>
            </div>
            <Link
              to={resumePath}
              state={{ title: appSession.lastSurveyTitle }}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--et-teal)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              Resume
              <ChevronRight size={14} />
            </Link>
          </div>
        </section>
      )}

      {!myTasksLoading && myTasks.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm sm:px-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-0">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-[var(--et-teal)]" />
              <h3 className="text-sm font-semibold text-slate-900">My tasks</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {myTasks.length}
              </span>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            {myTasks.slice(0, 8).map((row) => (
              <li key={`${row.survey_id}-${row.task.id}`} className="px-4 py-3 sm:px-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{row.task.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{row.survey_title}</span>
                      {row.phase && (
                        <>
                          {' '}
                          · {PROJECT_PHASE_LABELS[row.phase]}
                        </>
                      )}
                      {' · '}
                      {TASK_CATEGORY_LABELS[row.task.category]}
                      {' · '}
                      {TASK_STATUS_LABELS[row.task.status]}
                      {row.task.due_date && (
                        <>
                          {' '}
                          · Due {formatDate(row.task.due_date)}
                        </>
                      )}
                    </p>
                  </div>
                  <Link
                    to={`/projects/${row.survey_id}?mode=workflow`}
                    state={{ title: row.survey_title }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-[var(--et-teal-dark)] hover:bg-[var(--et-teal-light)]/30"
                  >
                    Open workflow
                    <ChevronRight size={14} />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {myTasks.length > 8 && (
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 sm:px-0">
              +{myTasks.length - 8} more open tasks across your projects
            </p>
          )}
        </section>
      )}

      {pinnedProjects.length > 0 && !showPinnedOnly && !search.trim() && statusFilter === 'all' && (
        <section className="rounded-xl border border-[var(--et-teal)]/20 bg-[var(--et-teal-light)]/25 p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Pin size={16} className="text-[var(--et-teal-dark)]" />
              <h3 className="text-sm font-semibold text-slate-900">Pinned projects</h3>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                {pinnedProjects.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowPinnedOnly(true)}
              className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
            >
              View all pinned
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 et-scroll">
            {pinnedProjects.map((project) => (
              <PinnedSurveyChip
                key={project.id}
                project={project}
                openHref={resolveSurveyHref(user?.username, project.id)}
                isPinned
                onTogglePin={() => void togglePinned(project.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Total projects', value: counts.all, tone: 'text-slate-900' },
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
              placeholder="Search by study name, ID, owner, or language…"
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
              Sort projects
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
                onClick={() => setViewMode('strips')}
                className={`rounded-md p-2 transition ${viewMode === 'strips' ? 'bg-white text-[var(--et-teal-dark)] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                aria-label="Strip list view"
                aria-pressed={viewMode === 'strips'}
              >
                <List size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`rounded-md p-2 transition ${viewMode === 'table' ? 'bg-white text-[var(--et-teal-dark)] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                aria-label="Full table view"
                aria-pressed={viewMode === 'table'}
              >
                <LayoutGrid size={16} />
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
            onClick={() => setShowPinnedOnly((v) => !v)}
            className={`et-chip ${showPinnedOnly ? 'et-chip-active' : 'et-chip-inactive'}`}
          >
            <Pin size={14} className={showPinnedOnly ? 'fill-current' : ''} />
            Pinned
            <span className="opacity-60">{pinnedIds.length}</span>
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setStatusFilter('all')
                setShowPinnedOnly(false)
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
          {viewMode === 'strips' ? (
            <>
              Showing <span className="font-semibold text-slate-700">{stripProjects.length}</span> of{' '}
              {filtered.length} matching
              {filtered.length !== projects.length && (
                <>
                  {' '}
                  (<span className="font-semibold text-slate-700">{projects.length}</span> total)
                </>
              )}
              {filtered.length > DASHBOARD_STRIP_LIMIT && (
                <span className="text-slate-400"> · Switch to table view for all</span>
              )}
            </>
          ) : (
            <>
              Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of{' '}
              {projects.length} projects
            </>
          )}
          {!showPinnedOnly && pinnedIds.length > 0 && sortKey === 'newest' && viewMode === 'strips' && (
            <span className="text-slate-400"> · Pinned projects shown first</span>
          )}
        </p>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          title="No projects found"
          description={
            showPinnedOnly
              ? 'Pin projects from the list below, or turn off the pinned filter.'
              : 'Try a different search term or status filter.'
          }
        />
      ) : viewMode === 'strips' ? (
        <div className="space-y-2">
          {stripProjects.map((project) => (
            <SurveyStrip
              key={project.id}
              project={project}
              openHref={resolveSurveyHref(user?.username, project.id)}
              isPinned={pinnedSet.has(project.id)}
              onTogglePin={() => void togglePinned(project.id)}
            />
          ))}
        </div>
      ) : (
        <SurveyTable
          projects={filtered}
          pinnedSet={pinnedSet}
          surveyHref={(id) => resolveSurveyHref(user?.username, id)}
          onTogglePin={(id) => void togglePinned(id)}
        />
      )}
    </div>
  )
}

function PinnedSurveyChip({
  project,
  openHref,
  isPinned,
  onTogglePin,
}: {
  project: Project
  openHref: string
  isPinned: boolean
  onTogglePin: () => void
}) {
  return (
    <article className="relative w-[min(100%,18rem)] shrink-0 rounded-xl border border-white/80 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={onTogglePin}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-[var(--et-teal)] hover:bg-slate-50"
        aria-label={isPinned ? 'Unpin survey' : 'Pin survey'}
      >
        <Pin size={14} className={isPinned ? 'fill-current' : ''} />
      </button>
      <Link to={openHref} state={{ title: project.title }} className="block pr-8">
        <div className="flex items-center gap-2">
          <StatusBadge status={project.status} />
          <span className="font-mono text-[10px] text-slate-400">#{project.id}</span>
        </div>
        <h4 className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">{project.title}</h4>
        {project.responses.loaded && (
          <p className="mt-1 text-xs text-slate-500">
            {project.responses.completed.toLocaleString()} completed
          </p>
        )}
      </Link>
    </article>
  )
}

function SurveyStrip({
  project,
  openHref,
  isPinned,
  onTogglePin,
}: {
  project: Project
  openHref: string
  isPinned: boolean
  onTogglePin: () => void
}) {
  const expiryHint = formatRelativeExpiry(project.expire_date)
  const loaded = project.responses.loaded

  return (
    <article className="group flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm transition hover:border-[var(--et-teal)]/35 hover:shadow-md sm:gap-4 sm:px-4">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          onTogglePin()
        }}
        className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-slate-50 hover:text-[var(--et-teal)]"
        aria-label={isPinned ? 'Unpin project' : 'Pin project'}
      >
        <Pin size={15} className={isPinned ? 'fill-[var(--et-teal)] text-[var(--et-teal)]' : ''} />
      </button>

      <Link
        to={openHref}
        state={{ title: project.title }}
        className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <StatusBadge status={project.status} />
            {expiryHint && project.status === 'active' && (
              <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200 sm:inline">
                {expiryHint}
              </span>
            )}
            <span className="shrink-0 font-mono text-[10px] text-slate-400">#{project.id}</span>
          </div>
          <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 group-hover:text-[var(--et-teal-dark)] sm:text-base">
            {project.title}
          </h3>
        </div>

        <div className="hidden shrink-0 text-right tabular-nums sm:block sm:min-w-[7rem]">
          {!loaded ? (
            <SkeletonBlock className="ml-auto h-4 w-16" />
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-800">
                {project.responses.completed.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-500">completed</p>
            </>
          )}
        </div>

        <div className="hidden items-center gap-3 text-xs text-slate-500 lg:flex">
          {project.language && (
            <span className="inline-flex items-center gap-1">
              <Globe size={12} className="text-slate-400" />
              {project.language.toUpperCase()}
            </span>
          )}
          {project.owner != null && String(project.owner).trim() !== '' && (
            <span className="inline-flex max-w-[8rem] items-center gap-1 truncate">
              <User size={12} className="shrink-0 text-slate-400" />
              {String(project.owner)}
            </span>
          )}
          {(project.created_date && !project.created_date.startsWith('0000')) ||
          (project.expire_date && !project.expire_date.startsWith('0000')) ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Calendar size={12} className="text-slate-400" />
              {project.created_date && !project.created_date.startsWith('0000')
                ? formatDate(project.created_date)
                : `Exp ${formatDate(project.expire_date)}`}
            </span>
          ) : null}
        </div>
      </Link>

      <div className="hidden shrink-0 items-center gap-2 opacity-0 transition group-hover:opacity-100 md:flex">
        <QuickAction
          to={`/projects/${project.id}?mode=explore&view=compare`}
          icon={<Table2 size={12} />}
          label="Crosstabs"
        />
        <QuickAction
          to={`/projects/${project.id}?mode=workflow`}
          icon={<ClipboardList size={12} />}
          label="Workflow"
        />
      </div>

      <Link
        to={openHref}
        state={{ title: project.title }}
        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-[var(--et-teal-light)]/30 hover:text-[var(--et-teal-dark)]"
        aria-label="Open project"
      >
        <ChevronRight size={18} />
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
  pinnedSet,
  surveyHref,
  onTogglePin,
}: {
  projects: Project[]
  pinnedSet: Set<number>
  surveyHref: (id: number) => string
  onTogglePin: (id: number) => void
}) {
  return (
    <div className="et-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-3 py-3" aria-label="Pin" />
              <th className="px-4 py-3 font-semibold">Project</th>
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
              const isPinned = pinnedSet.has(project.id)
              const loaded = project.responses.loaded
              return (
                <tr key={project.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onTogglePin(project.id)}
                      className="rounded-md p-1 text-slate-300 hover:text-[var(--et-teal)]"
                      aria-label={isPinned ? 'Unpin survey' : 'Pin survey'}
                    >
                      <Pin size={15} className={isPinned ? 'fill-[var(--et-teal)] text-[var(--et-teal)]' : ''} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={surveyHref(project.id)}
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
                      to={surveyHref(project.id)}
                      state={{ title: project.title }}
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
