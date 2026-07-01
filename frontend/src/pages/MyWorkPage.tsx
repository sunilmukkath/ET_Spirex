import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Circle,
  ExternalLink,
  Inbox,
  Link2,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Sparkles,
  User,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import {
  api,
  type GmailConnectionStatus,
  type GmailEmailBreakdown,
  type GmailMessageSummary,
  type GmailTaskDraft,
  type MyTaskRow,
  type Project,
  type TaskCategory,
} from '../api/client'
import { TEAM_USERS } from '../auth/AuthContext'
import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS } from '../lib/workflowAccess'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

type EditableDraft = Omit<GmailTaskDraft, 'survey_id'> & {
  survey_id: number | ''
}

function formatEmailDate(ms: number | null | undefined) {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function gmailUrl(messageId: string | null | undefined) {
  if (!messageId) return null
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`
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
  const [breakdown, setBreakdown] = useState<GmailEmailBreakdown | null>(null)
  const [drafts, setDrafts] = useState<EditableDraft[]>([])
  const [breakdownLoading, setBreakdownLoading] = useState(false)
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

  async function openBreakdown(email: GmailMessageSummary) {
    setSelectedEmail(email)
    setBreakdown(null)
    setDrafts([])
    setBreakdownLoading(true)
    setError(null)
    try {
      const result = await api.getGmailEmailBreakdown(email.id)
      setBreakdown(result)
      setDrafts(
        result.tasks.map((task) => ({
          ...task,
          survey_id: task.project_related ? '' : '',
          assignee: task.assignee ?? user?.username ?? null,
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not break down email')
      setSelectedEmail(null)
    } finally {
      setBreakdownLoading(false)
    }
  }

  function updateDraft(index: number, patch: Partial<EditableDraft>) {
    setDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function handleCreateTasks(e: FormEvent) {
    e.preventDefault()
    if (!selectedEmail || drafts.length === 0) return
    setCreating(true)
    setError(null)
    try {
      const result = await api.createTasksFromEmail(
        selectedEmail.id,
        {
          tasks: drafts.map((draft) => ({
            title: draft.title.trim(),
            note: draft.note.trim(),
            survey_id: draft.survey_id === '' ? null : Number(draft.survey_id),
            category: draft.category,
            assignee: draft.assignee,
            priority: draft.priority,
            billable: draft.billable,
          })),
        },
      )
      setSelectedEmail(null)
      setBreakdown(null)
      setDrafts([])
      setBanner(`Created ${result.count} task${result.count === 1 ? '' : 's'} from “${selectedEmail.subject.slice(0, 50)}”`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tasks')
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
            Scout reads your Gmail and turns emails into short tasks — linked back to the message, billable or
            non-billable, with or without a project.
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
            <Link to="/quantitative" className="text-xs font-medium text-[var(--et-teal)] hover:underline">
              All projects
            </Link>
          </div>

          {openTasks.length === 0 ? (
            <EmptyState
              title="No open tasks"
              description="Tasks from project workflows and Gmail will appear here."
            />
          ) : (
            <ul className="space-y-2">
              {openTasks.map((row) => {
                const emailLink = gmailUrl(row.task.gmail_message_id)
                return (
                  <li
                    key={`${row.personal ? 'p' : row.survey_id}-${row.task.id}`}
                    className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
                  >
                    <div className="flex items-start gap-2">
                      <Circle size={16} className="mt-0.5 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        {row.personal || row.survey_id == null ? (
                          <p className="font-medium text-[var(--et-navy)]">{row.task.title}</p>
                        ) : (
                          <Link
                            to={`/projects/${row.survey_id}?mode=workflow`}
                            className="font-medium text-[var(--et-navy)] hover:underline"
                          >
                            {row.task.title}
                          </Link>
                        )}
                        {row.task.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{row.task.description}</p>
                        )}
                        <p className="mt-1 text-xs text-slate-500">
                          {row.survey_title}
                          {' · '}
                          {TASK_CATEGORY_LABELS[row.task.category]}
                          {' · '}
                          {TASK_STATUS_LABELS[row.task.status]}
                          {row.task.billable === false ? ' · non-billable' : ' · billable'}
                          {row.task.source === 'email' && ' · from email'}
                        </p>
                        {emailLink && (
                          <a
                            href={emailLink}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--et-teal)] hover:underline"
                          >
                            <Mail size={12} />
                            Open source email
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
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
                    <div className="flex shrink-0 flex-col gap-1">
                      {msg.has_task ? (
                        <span className="et-chip et-chip-inactive text-[10px]">
                          <Link2 size={12} />
                          {msg.task_count} task{msg.task_count === 1 ? '' : 's'}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void openBreakdown(msg)}
                        className="et-btn-secondary py-1 text-xs"
                      >
                        <Sparkles size={12} />
                        Break down
                      </button>
                      <a
                        href={msg.email_url || gmailUrl(msg.id) || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
                      >
                        <ExternalLink size={10} />
                        Email
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(selectedEmail || breakdownLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateTasks}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-[var(--et-teal)]" />
                    <h3 className="text-lg font-semibold text-slate-900">Scout task breakdown</h3>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-500">{selectedEmail?.subject}</p>
                  {breakdown && (
                    <p className="mt-1 text-xs text-slate-500">
                      {breakdown.configured ? 'AI breakdown' : 'Rule-based breakdown (AI not configured)'}
                      {' · '}
                      {drafts.length} task{drafts.length === 1 ? '' : 's'}
                    </p>
                  )}
                </div>
                {selectedEmail && (
                  <a
                    href={selectedEmail.email_url || gmailUrl(selectedEmail.id) || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs text-[var(--et-teal)] hover:underline"
                  >
                    Open email
                  </a>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4 et-scroll">
              {breakdownLoading && (
                <div className="flex items-center gap-2 py-8 text-sm text-slate-600">
                  <Loader2 size={16} className="animate-spin text-[var(--et-teal)]" />
                  Scout is reading the email…
                </div>
              )}

              {!breakdownLoading &&
                drafts.map((draft, index) => (
                  <div key={`draft-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-600">Short task</span>
                      <input
                        className="et-input w-full"
                        value={draft.title}
                        onChange={(e) => updateDraft(index, { title: e.target.value })}
                        required
                      />
                    </label>
                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-600">Note</span>
                      <textarea
                        className="et-input w-full"
                        rows={2}
                        value={draft.note}
                        onChange={(e) => updateDraft(index, { note: e.target.value })}
                      />
                    </label>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Project (optional)</span>
                        <select
                          className="et-input w-full"
                          value={draft.survey_id}
                          onChange={(e) =>
                            updateDraft(index, {
                              survey_id: e.target.value ? Number(e.target.value) : '',
                            })
                          }
                        >
                          <option value="">General — no project</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title} (#{p.id})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Assign to</span>
                        <select
                          className="et-input w-full"
                          value={draft.assignee ?? ''}
                          onChange={(e) => updateDraft(index, { assignee: e.target.value || null })}
                        >
                          <option value="">Unassigned</option>
                          {TEAM_USERS.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={draft.billable}
                          onChange={(e) => updateDraft(index, { billable: e.target.checked })}
                        />
                        Billable activity
                      </label>
                      <select
                        className="et-select text-xs"
                        value={draft.category}
                        onChange={(e) => updateDraft(index, { category: e.target.value as TaskCategory })}
                      >
                        {Object.entries(TASK_CATEGORY_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                className="et-btn-secondary"
                onClick={() => {
                  setSelectedEmail(null)
                  setBreakdown(null)
                  setDrafts([])
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="et-btn-primary"
                disabled={creating || breakdownLoading || drafts.length === 0}
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create {drafts.length} task{drafts.length === 1 ? '' : 's'}
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
        Non-project tasks are stored as general activities for time tracking.
      </p>
    </div>
  )
}
