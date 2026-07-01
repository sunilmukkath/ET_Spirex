import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Inbox,
  Link2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  User,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import {
  api,
  type GmailConnectionStatus,
  type GmailMessageSummary,
  type GmailTaskSuggestion,
  type MyTaskRow,
  type Project,
} from '../api/client'
import { TEAM_USERS } from '../auth/AuthContext'
import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS } from '../lib/workflowAccess'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

function formatEmailDate(ms: number | null | undefined) {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function MyWorkPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [gmailStatus, setGmailStatus] = useState<GmailConnectionStatus | null>(null)
  const [inbox, setInbox] = useState<GmailMessageSummary[]>([])
  const [myTasks, setMyTasks] = useState<MyTaskRow[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<GmailMessageSummary | null>(null)
  const [suggestion, setSuggestion] = useState<GmailTaskSuggestion | null>(null)
  const [surveyId, setSurveyId] = useState<number | ''>('')
  const [assignee, setAssignee] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const gmailConnected = gmailStatus?.connected === true

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statusResult, tasksResult, projectsResult] = await Promise.allSettled([
        api.getGmailStatus(),
        api.getMyTasks(),
        api.getProjects(),
      ])

      const status =
        statusResult.status === 'fulfilled'
          ? statusResult.value
          : { configured: false, connected: false, message: 'Gmail status unavailable' }
      setGmailStatus(status)

      if (tasksResult.status === 'fulfilled') {
        setMyTasks(tasksResult.value.tasks)
      } else {
        setMyTasks([])
      }

      if (projectsResult.status === 'fulfilled') {
        setProjects(projectsResult.value.projects)
      } else {
        setProjects([])
      }

      if (status.connected) {
        try {
          const messages = await api.getGmailInbox(false)
          setInbox(messages)
        } catch {
          setInbox([])
        }
      } else {
        setInbox([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load My Work')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const gmail = searchParams.get('gmail')
    if (gmail === 'connected') {
      setBanner('Gmail connected — your inbox will sync here.')
      searchParams.delete('gmail')
      setSearchParams(searchParams, { replace: true })
      void load()
    }
    if (gmail === 'error') {
      setBanner('Gmail connection failed. Try again from Settings or below.')
      searchParams.delete('gmail')
      searchParams.delete('reason')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams, load])

  async function handleConnectGmail() {
    setConnecting(true)
    setError(null)
    try {
      const { url } = await api.getGmailOAuthUrl()
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start Gmail connection')
      setConnecting(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setError(null)
    try {
      const messages = await api.getGmailInbox(true)
      setInbox(messages)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inbox sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function openCreateTask(email: GmailMessageSummary) {
    setSelectedEmail(email)
    setSurveyId(email.linked_survey_id ?? '')
    try {
      const sug = await api.getGmailTaskSuggestion(email.id)
      setSuggestion(sug)
      setAssignee(sug.assignee ?? user?.username ?? '')
    } catch {
      setSuggestion(null)
      setAssignee(user?.username ?? '')
    }
  }

  async function handleCreateTask(e: FormEvent) {
    e.preventDefault()
    if (!selectedEmail || surveyId === '') return
    setCreating(true)
    setError(null)
    try {
      const subjectPreview = selectedEmail.subject.slice(0, 60)
      await api.createTaskFromEmail(selectedEmail.id, {
        survey_id: Number(surveyId),
        title: suggestion?.title,
        description: suggestion?.description,
        category: suggestion?.category,
        assignee: assignee || null,
        priority: suggestion?.priority,
      })
      setSelectedEmail(null)
      setSuggestion(null)
      setBanner(`Task created from “${subjectPreview}”`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setCreating(false)
    }
  }

  const openTasks = useMemo(() => myTasks.filter((r) => r.task.status !== 'done'), [myTasks])

  if (loading) {
    return <LoadingState message="Loading your work…" />
  }

  return (
    <div className="et-page et-page-wide space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--et-teal)]">My work</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Tasks & inbox{user?.username ? ` — ${user.username}` : ''}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Assigned project tasks plus Gmail — turn client and vendor emails into tracked tasks on the right study.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="et-btn-secondary">
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {banner && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {banner}
          <button type="button" className="ml-3 underline" onClick={() => setBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      {error && <ErrorState message={error} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <User size={18} className="text-[var(--et-navy)]" />
              <h2 className="text-sm font-semibold text-slate-800">Assigned to me</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {openTasks.length}
              </span>
            </div>
            <Link to="/dashboard" className="text-xs font-medium text-[var(--et-teal)] hover:underline">
              All projects
            </Link>
          </div>

          {openTasks.length === 0 ? (
            <EmptyState
              title="No open tasks"
              description="Tasks assigned to you in project workflows will appear here."
            />
          ) : (
            <ul className="space-y-2">
              {openTasks.map((row) => (
                <li
                  key={`${row.survey_id}-${row.task.id}`}
                  className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
                >
                  <div className="flex items-start gap-2">
                    {row.task.status === 'done' ? (
                      <CheckCircle2 size={16} className="mt-0.5 text-emerald-600" />
                    ) : (
                      <Circle size={16} className="mt-0.5 text-slate-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/projects/${row.survey_id}?mode=workflow`}
                        className="font-medium text-[var(--et-navy)] hover:underline"
                      >
                        {row.task.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {row.survey_title}
                        {row.client_name ? ` · ${row.client_name}` : ''}
                        {' · '}
                        {TASK_CATEGORY_LABELS[row.task.category]}
                        {' · '}
                        {TASK_STATUS_LABELS[row.task.status]}
                        {row.task.source === 'email' && ' · from email'}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Inbox size={18} className="text-[var(--et-navy)]" />
              <h2 className="text-sm font-semibold text-slate-800">Gmail inbox</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {gmailConnected ? (
                <button type="button" onClick={() => void handleSync()} className="et-btn-secondary" disabled={syncing}>
                  {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Sync
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConnectGmail()}
                  className="et-btn-primary"
                  disabled={connecting || gmailStatus?.configured === false}
                >
                  {connecting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                  Connect Gmail
                </button>
              )}
            </div>
          </div>

          {gmailStatus?.configured === false && (
            <p className="text-sm text-amber-700">
              Gmail is not configured on the server. Ask your admin to set Google OAuth credentials.
            </p>
          )}

          {gmailStatus?.configured && !gmailConnected && (
            <p className="text-sm text-slate-600">{gmailStatus.message}</p>
          )}

          {gmailConnected && (
            <p className="text-xs text-slate-500">
              {gmailStatus?.email ? `Connected as ${gmailStatus.email}` : 'Gmail connected'}
              {gmailStatus?.last_sync_at
                ? ` · Last sync ${formatEmailDate(gmailStatus.last_sync_at * 1000)}`
                : ''}
            </p>
          )}

          {gmailConnected && inbox.length === 0 && (
            <EmptyState title="Inbox empty" description="No recent messages match the sync filter, or click Sync." />
          )}

          {gmailConnected && inbox.length > 0 && (
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
              {inbox.map((msg) => (
                <li
                  key={msg.id}
                  className={`rounded-xl border px-3 py-2.5 ${
                    msg.is_unread ? 'border-[var(--et-teal)]/30 bg-[var(--et-teal-light)]/20' : 'border-slate-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{msg.subject}</p>
                      <p className="text-xs text-slate-500">
                        {msg.from_name || msg.from_email} · {formatEmailDate(msg.internal_date)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">{msg.snippet}</p>
                    </div>
                    {msg.has_task ? (
                      <Link
                        to={`/projects/${msg.linked_survey_id}?mode=workflow`}
                        className="shrink-0 et-chip et-chip-inactive text-[10px]"
                      >
                        <Link2 size={12} />
                        Task
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void openCreateTask(msg)}
                        className="shrink-0 et-btn-secondary py-1 text-xs"
                      >
                        <Plus size={12} />
                        Task
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {selectedEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateTask}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-slate-900">Create task from email</h3>
            <p className="mt-1 truncate text-sm text-slate-500">{selectedEmail.subject}</p>

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Project (LimeSurvey study)</span>
                <select
                  className="et-input w-full"
                  value={surveyId}
                  onChange={(e) => setSurveyId(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select study…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (#{p.id})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Assign to</span>
                <select
                  className="et-input w-full"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {TEAM_USERS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              {suggestion && (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <p>
                    <strong>Suggested:</strong> {TASK_CATEGORY_LABELS[suggestion.category]} ·{' '}
                    {suggestion.priority} priority
                  </p>
                  {suggestion.description && <p className="mt-1 line-clamp-3">{suggestion.description}</p>}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="et-btn-secondary"
                onClick={() => {
                  setSelectedEmail(null)
                  setSuggestion(null)
                }}
              >
                Cancel
              </button>
              <button type="submit" className="et-btn-primary" disabled={creating || surveyId === ''}>
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create task
              </button>
            </div>
          </form>
        </div>
      )}

      <p className="text-center text-xs text-slate-400">
        <a
          href="https://mail.google.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-[var(--et-teal)]"
        >
          Open Gmail <ExternalLink size={12} />
        </a>
        {' · '}
        Use labels like <code className="rounded bg-slate-100 px-1">ET/Client</code> in Gmail; map team addresses in server config.
      </p>
    </div>
  )
}
