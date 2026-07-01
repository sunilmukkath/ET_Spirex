import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { BarChart3, Plus, RefreshCw } from 'lucide-react'
import {
  api,
  type PmFieldworkDashboard,
  type PmProject,
} from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

function pctBar(pct: number | null) {
  if (pct == null) return 0
  return Math.min(100, Math.max(0, pct))
}

function formatEntryDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function FieldworkTrackerPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [dbReady, setDbReady] = useState(true)
  const [projects, setProjects] = useState<PmProject[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const [dashboard, setDashboard] = useState<PmFieldworkDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [newName, setNewName] = useState('')
  const [completesToday, setCompletesToday] = useState('0')
  const [targetCompletes, setTargetCompletes] = useState('')

  const loadDashboard = useCallback(async (projectId: string) => {
    if (!projectId) {
      setDashboard(null)
      return
    }
    setDashboardLoading(true)
    try {
      const dash = await api.getPmFieldworkDashboard(projectId)
      setDashboard(dash)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  const load = useCallback(async (preferredId?: string, silent = false) => {
    if (!silent) {
      setLoading(true)
    }
    setError(null)
    try {
      const status = await api.getPmStatus()
      setEnabled(status.enabled)
      if (!status.enabled) {
        setProjects([])
        setDashboard(null)
        setDbReady(false)
        return
      }
      if (status.failed) {
        setDbReady(false)
        setProjects([])
        setDashboard(null)
        setError(status.error ?? 'Project database is unavailable. Remove or fix DATABASE_URL.')
        return
      }
      setDbReady(status.ready)
      if (!status.ready) {
        setProjects([])
        setDashboard(null)
        return
      }
      const rows = await api.listPmProjects()
      setProjects(rows)
      const nextId = preferredId ?? selectedIdRef.current ?? rows[0]?.project_id ?? ''
      setSelectedId(nextId)
      if (nextId) {
        await loadDashboard(nextId)
      } else {
        setDashboard(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fieldwork tracker')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [loadDashboard])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!enabled || dbReady || loading) return
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      if (attempts > 20) {
        window.clearInterval(timer)
        setError('Project database did not become ready. Check DATABASE_URL on the server.')
        return
      }
      void api.getPmStatus().then((status) => {
        if (status.ready) void load(selectedIdRef.current, true)
        else if (status.failed) {
          setError(status.error ?? 'Project database unavailable')
          window.clearInterval(timer)
        }
      })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [enabled, dbReady, loading, load])

  async function handleSelect(projectId: string) {
    setSelectedId(projectId)
    await loadDashboard(projectId)
  }

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const created = await api.createPmProject({
        project_name: newName.trim(),
        project_type: 'quant',
        engagement_type: 'tracking',
        stage: 'Fieldwork/Data Collection',
      })
      setNewName('')
      await load(created.project_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogDay(e: FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    setSaving(true)
    setError(null)
    try {
      await api.createPmFieldworkEntry(selectedId, {
        entry_date: new Date().toISOString().slice(0, 10),
        completes_today: Number(completesToday) || 0,
        target_completes: targetCompletes ? Number(targetCompletes) : dashboard?.target_completes ?? undefined,
      })
      setCompletesToday('0')
      setTargetCompletes('')
      await loadDashboard(selectedId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log fieldwork')
    } finally {
      setSaving(false)
    }
  }

  if (loading && enabled === null) {
    return <LoadingState message="Loading fieldwork tracker…" />
  }

  if (enabled === false) {
    return (
      <div className="et-page et-page-wide py-8">
        <EmptyState
          title="Postgres spine not configured"
          description="Set DATABASE_URL on the backend to enable the full project lifecycle tracker. ET Scout survey workspaces continue to work without it."
        />
      </div>
    )
  }

  if (enabled && !dbReady && !loading) {
    return (
      <div className="et-page et-page-wide py-8">
        <LoadingState message="Connecting to project database…" />
        {error && (
          <div className="mt-4">
            <ErrorState message={error} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="et-page et-page-wide space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--et-teal)]">
            Project management
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">Fieldwork tracker</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Daily completes vs. quota by PM project — the first module on the Postgres spine.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(selectedId)}
          className="et-btn-secondary"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {error && <ErrorState message={error} />}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">PM projects</h2>
          <form onSubmit={handleCreateProject} className="space-y-2">
            <input
              className="et-input w-full"
              placeholder="New project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="et-btn-primary w-full" disabled={saving || loading}>
              <Plus size={16} />
              Add project
            </button>
          </form>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {projects.map((p) => (
              <li key={p.project_id}>
                <button
                  type="button"
                  onClick={() => void handleSelect(p.project_id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selectedId === p.project_id
                      ? 'bg-[var(--et-navy)]/10 font-medium text-[var(--et-navy)]'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {p.project_name}
                  <span className="mt-0.5 block text-xs text-slate-500">{p.stage}</span>
                </button>
              </li>
            ))}
            {projects.length === 0 && !loading && (
              <li className="px-2 py-4 text-sm text-slate-500">No projects yet — create one above.</li>
            )}
          </ul>
        </aside>

        <section className="space-y-6">
          {dashboardLoading && !dashboard ? (
            <LoadingState message="Loading quota dashboard…" />
          ) : !dashboard ? (
            <EmptyState title="Select a project" description="Choose a PM project to view quota progress." />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase text-slate-500">Cumulative completes</p>
                  <p className="mt-1 text-3xl font-semibold text-[var(--et-navy)]">
                    {dashboard.cumulative_completes}
                    {dashboard.target_completes != null && (
                      <span className="text-lg font-normal text-slate-400">
                        {' '}
                        / {dashboard.target_completes}
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase text-slate-500">Overall progress</p>
                  <p className="mt-1 text-3xl font-semibold text-[var(--et-teal)]">
                    {dashboard.pct_complete != null ? `${dashboard.pct_complete}%` : '—'}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[var(--et-teal)]"
                      style={{ width: `${pctBar(dashboard.pct_complete)}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase text-slate-500">Latest day</p>
                  <p className="mt-1 text-lg font-semibold text-slate-800">
                    {dashboard.latest_entry_date
                      ? formatEntryDate(dashboard.latest_entry_date)
                      : 'No entries'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Rejects today: {dashboard.rejects_today}
                    {dashboard.flagged_for_qc && ' · QC flagged'}
                  </p>
                </div>
              </div>

              {dashboard.quota_cells.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <BarChart3 size={18} className="text-[var(--et-navy)]" />
                    <h2 className="text-sm font-semibold text-slate-800">Quota cells</h2>
                  </div>
                  <div className="space-y-3">
                    {dashboard.quota_cells.map((cell) => (
                      <div key={cell.cell_key}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium text-slate-700">{cell.label}</span>
                          <span className="text-slate-500">
                            {cell.cumulative_completes}
                            {cell.target_completes != null && ` / ${cell.target_completes}`}
                            {cell.pct_complete != null && ` (${cell.pct_complete}%)`}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[var(--et-navy)]"
                            style={{ width: `${pctBar(cell.pct_complete)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dashboard.daily_series.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-slate-800">Recent days</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[320px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs uppercase text-slate-500">
                          <th className="py-2 pr-4 font-medium">Date</th>
                          <th className="py-2 pr-4 font-medium">Today</th>
                          <th className="py-2 pr-4 font-medium">Cumulative</th>
                          <th className="py-2 font-medium">Rejects</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...dashboard.daily_series].reverse().map((row) => (
                          <tr key={row.entry_id} className="border-b border-slate-50">
                            <td className="py-2 pr-4 text-slate-700">{formatEntryDate(row.entry_date)}</td>
                            <td className="py-2 pr-4 text-slate-700">{row.completes_today}</td>
                            <td className="py-2 pr-4 text-slate-700">{row.cumulative_completes}</td>
                            <td className="py-2 text-slate-500">{row.rejects_today}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <form
                onSubmit={handleLogDay}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <h2 className="text-sm font-semibold text-slate-800">Log today&apos;s completes</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Saving again on the same day updates that day&apos;s entry instead of duplicating it.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Completes today</span>
                    <input
                      className="et-input w-full"
                      type="number"
                      min={0}
                      value={completesToday}
                      onChange={(e) => setCompletesToday(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Target (optional)</span>
                    <input
                      className="et-input w-full"
                      type="number"
                      min={0}
                      placeholder={dashboard.target_completes?.toString() ?? ''}
                      value={targetCompletes}
                      onChange={(e) => setTargetCompletes(e.target.value)}
                    />
                  </label>
                  <div className="flex items-end">
                    <button type="submit" className="et-btn-primary w-full" disabled={saving || dashboardLoading}>
                      Save entry
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
