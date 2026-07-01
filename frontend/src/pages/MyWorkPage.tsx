import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Circle, Briefcase, Loader2, Plus, RefreshCw, Sparkles, User, Users, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import {
  api,
  type GmailConnectionStatus,
  type GmailMessageSummary,
  type GmailProposalBriefHint,
  type GmailTaskDraft,
  type MyTaskRow,
  type Project,
} from '../api/client'
import { TEAM_USERS } from '../auth/AuthContext'
import { MyWorkEmailPanel } from '../components/mywork/MyWorkEmailPanel'
import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS } from '../lib/workflowAccess'
import { ErrorState, LoadingState } from '../components/States'

type EditableDraft = Omit<GmailTaskDraft, 'survey_id'> & {
  survey_id: number | ''
}

function gmailUrl(messageId: string | null | undefined) {
  if (!messageId) return null
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`
}

function TaskCard({ row, showAssignee }: { row: MyTaskRow; showAssignee?: boolean }) {
  const emailLink = gmailUrl(row.task.gmail_message_id)
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Circle size={14} className="mt-0.5 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          {row.personal || row.survey_id == null ? (
            <p className="text-sm font-medium text-[var(--et-navy)]">{row.task.title}</p>
          ) : (
            <Link
              to={`/projects/${row.survey_id}?mode=workflow`}
              className="text-sm font-medium text-[var(--et-navy)] hover:underline"
            >
              {row.task.title}
            </Link>
          )}
          {row.task.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{row.task.description}</p>
          )}
          <p className="mt-1 text-[11px] text-slate-500">
            {row.survey_title}
            {' · '}
            {TASK_CATEGORY_LABELS[row.task.category]}
            {' · '}
            {TASK_STATUS_LABELS[row.task.status]}
            {showAssignee && row.task.assignee ? ` · ${row.task.assignee}` : ''}
            {row.task.billable === false ? ' · non-billable' : ''}
          </p>
          {emailLink && (
            <a
              href={emailLink}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-block text-[11px] text-[var(--et-teal)] hover:underline"
            >
              Source email
            </a>
          )}
        </div>
      </div>
    </li>
  )
}

function TaskBox({
  title,
  icon: Icon,
  count,
  empty,
  rows,
  showAssignee,
  action,
}: {
  title: string
  icon: LucideIcon
  count: number
  empty: string
  rows: MyTaskRow[]
  showAssignee?: boolean
  action?: ReactNode
}) {
  return (
    <section className="flex min-h-[14rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-[var(--et-navy)]" />
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{count}</span>
        </div>
        {action}
      </div>
      <div className="flex-1 overflow-y-auto p-3 et-scroll">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <TaskCard key={`${row.personal ? 'p' : row.survey_id}-${row.task.id}`} row={row} showAssignee={showAssignee} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export function MyWorkPage() {
  const { user, gmailStatus: authGmailStatus, refreshGmailStatus } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [gmailStatus, setGmailStatus] = useState<GmailConnectionStatus | null>(authGmailStatus)
  const [inbox, setInbox] = useState<GmailMessageSummary[]>([])
  const [myTasks, setMyTasks] = useState<MyTaskRow[]>([])
  const [newTasks, setNewTasks] = useState<MyTaskRow[]>([])
  const [teamAssignedTasks, setTeamAssignedTasks] = useState<MyTaskRow[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<GmailMessageSummary | null>(null)
  const [drafts, setDrafts] = useState<EditableDraft[]>([])
  const [breakdownLoading, setBreakdownLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [creatingPipeline, setCreatingPipeline] = useState(false)
  const [proposalBrief, setProposalBrief] = useState<GmailProposalBriefHint | null>(null)
  const [pipelineProjectName, setPipelineProjectName] = useState('')
  const [pipelineClientName, setPipelineClientName] = useState('')
  const [pipelineOwner, setPipelineOwner] = useState('')
  const [banner, setBanner] = useState<string | null>(null)
  const [showNewTask, setShowNewTask] = useState(false)
  const [taskSurveyId, setTaskSurveyId] = useState<number | ''>('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statusResult, myTasksResult, newTasksResult, teamTasksResult, projectsResult] =
        await Promise.allSettled([
          api.getGmailStatus(),
          api.getMyTasks(),
          api.getUnassignedTasks(),
          api.getTeamAssignedTasks(),
          api.getProjects(),
        ])

      const status =
        statusResult.status === 'fulfilled'
          ? statusResult.value
          : { configured: false, connected: false, message: 'Gmail status unavailable' }
      setGmailStatus(status)

      setMyTasks(myTasksResult.status === 'fulfilled' ? myTasksResult.value.tasks : [])
      setNewTasks(newTasksResult.status === 'fulfilled' ? newTasksResult.value.tasks : [])
      setTeamAssignedTasks(teamTasksResult.status === 'fulfilled' ? teamTasksResult.value.tasks : [])
      setProjects(projectsResult.status === 'fulfilled' ? projectsResult.value.projects : [])

      if (status.connected) {
        try {
          setInbox(await api.getGmailInbox(false))
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
    if (authGmailStatus) setGmailStatus(authGmailStatus)
  }, [authGmailStatus])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const gmail = searchParams.get('gmail')
    if (gmail === 'connected') {
      setBanner('Gmail connected — your inbox is below your tasks.')
      searchParams.delete('gmail')
      setSearchParams(searchParams, { replace: true })
      void refreshGmailStatus()
      void load()
    }
    if (gmail === 'error') {
      setBanner('Gmail connection failed. Try again.')
      searchParams.delete('gmail')
      searchParams.delete('reason')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams, load, refreshGmailStatus])

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
      setInbox(await api.getGmailInbox(true))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inbox sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function openBreakdown(email: GmailMessageSummary) {
    setSelectedEmail(email)
    setDrafts([])
    setProposalBrief(null)
    setBreakdownLoading(true)
    setError(null)
    try {
      const result = await api.getGmailEmailBreakdown(email.id)
      const hint = result.proposal_brief?.detected ? result.proposal_brief : null
      setProposalBrief(hint)
      if (hint) {
        setPipelineProjectName(hint.project_name)
        setPipelineClientName(hint.client_name)
        setPipelineOwner(hint.assignee ?? user?.username ?? '')
      } else {
        setPipelineProjectName('')
        setPipelineClientName('')
        setPipelineOwner(user?.username ?? '')
      }
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

  async function handleCreatePipeline() {
    if (!selectedEmail || !pipelineProjectName.trim()) return
    setCreatingPipeline(true)
    setError(null)
    try {
      const result = await api.createPipelineFromEmail(selectedEmail.id, {
        project_name: pipelineProjectName.trim(),
        client_name: pipelineClientName.trim() || null,
        owner_name: pipelineOwner.trim() || null,
        create_tasks: true,
        tasks: drafts.map((draft) => ({
          title: draft.title.trim(),
          note: draft.note.trim(),
          survey_id: draft.survey_id === '' ? null : Number(draft.survey_id),
          category: draft.category,
          assignee: draft.assignee ?? (pipelineOwner.trim() || null),
          priority: draft.priority,
          billable: draft.billable,
        })),
      })
      setSelectedEmail(null)
      setDrafts([])
      setProposalBrief(null)
      setBanner(
        `Pipeline created — ${result.project_name} assigned to ${result.owner_name ?? 'you'} (${result.tasks_created} task${result.tasks_created === 1 ? '' : 's'})`,
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pipeline')
    } finally {
      setCreatingPipeline(false)
    }
  }

  async function handleCreateTasks(e: FormEvent) {
    e.preventDefault()
    if (!selectedEmail || drafts.length === 0) return
    setCreating(true)
    setError(null)
    try {
      const result = await api.createTasksFromEmail(selectedEmail.id, {
        tasks: drafts.map((draft) => ({
          title: draft.title.trim(),
          note: draft.note.trim(),
          survey_id: draft.survey_id === '' ? null : Number(draft.survey_id),
          category: draft.category,
          assignee: draft.assignee,
          priority: draft.priority,
          billable: draft.billable,
        })),
      })
      setSelectedEmail(null)
      setDrafts([])
      setBanner(`Created ${result.count} task${result.count === 1 ? '' : 's'} from email`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tasks')
    } finally {
      setCreating(false)
    }
  }

  const openMyTasks = useMemo(() => myTasks.filter((r) => r.task.status !== 'done'), [myTasks])
  const openNewTasks = useMemo(() => newTasks.filter((r) => r.task.status !== 'done'), [newTasks])
  const openTeamTasks = useMemo(
    () => teamAssignedTasks.filter((r) => r.task.status !== 'done'),
    [teamAssignedTasks],
  )

  useEffect(() => {
    if (user?.username) setTaskAssignee(user.username)
  }, [user?.username])

  async function handleCreateTask(e: FormEvent) {
    e.preventDefault()
    if (!taskTitle.trim()) return
    setCreatingTask(true)
    setError(null)
    try {
      await api.createTask({
        title: taskTitle.trim(),
        survey_id: taskSurveyId === '' ? null : Number(taskSurveyId),
        assignee: taskAssignee || null,
      })
      setShowNewTask(false)
      setTaskTitle('')
      setTaskSurveyId('')
      setBanner('Task created')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setCreatingTask(false)
    }
  }

  if (loading) return <LoadingState message="Loading your work…" />

  return (
    <div className="et-page et-page-wide space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--et-teal)]">My work</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Tasks first, then email{user?.username ? ` — ${user.username}` : ''}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Tasks up top. A full inbox below — search, read, reply, and turn briefs into pipeline work.
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

      <div className="grid gap-4 lg:grid-cols-3">
        <TaskBox
          title="My tasks"
          icon={User}
          count={openMyTasks.length}
          empty="Nothing assigned to you yet."
          rows={openMyTasks}
        />
        <TaskBox
          title="New tasks"
          icon={Circle}
          count={openNewTasks.length}
          empty="No unassigned tasks — add one or pick up from email."
          rows={openNewTasks}
          action={
            <button
              type="button"
              onClick={() => setShowNewTask(true)}
              className="et-btn-secondary py-1 px-2 text-xs"
            >
              <Plus size={12} />
              Add
            </button>
          }
        />
        <TaskBox
          title="Assigned tasks"
          icon={Users}
          count={openTeamTasks.length}
          empty="No open tasks assigned to teammates."
          rows={openTeamTasks}
          showAssignee
        />
      </div>

      <MyWorkEmailPanel
        gmailStatus={gmailStatus}
        inbox={inbox}
        syncing={syncing}
        connecting={connecting}
        onConnect={() => void handleConnectGmail()}
        onSync={() => void handleSync()}
        onBreakDown={(msg) => void openBreakdown(msg)}
      />

      {(selectedEmail || breakdownLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateTasks}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-[var(--et-teal)]" />
                <h3 className="text-lg font-semibold text-slate-900">Break email into tasks</h3>
              </div>
              <p className="mt-1 truncate text-sm text-slate-500">{selectedEmail?.subject}</p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4 et-scroll">
              {breakdownLoading && (
                <div className="flex items-center gap-2 py-8 text-sm text-slate-600">
                  <Loader2 size={16} className="animate-spin text-[var(--et-teal)]" />
                  Scout is reading the email…
                </div>
              )}
              {!breakdownLoading && proposalBrief && (
                <div className="rounded-xl border border-[var(--et-teal)]/30 bg-teal-50/50 p-4">
                  <div className="flex items-start gap-2">
                    <Briefcase size={18} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">New proposal or client brief</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Create a pipeline project in Proposal stage and assign follow-up tasks.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm sm:col-span-2">
                          <span className="mb-1 block text-xs font-medium text-slate-600">Project name</span>
                          <input
                            className="et-input w-full"
                            value={pipelineProjectName}
                            onChange={(e) => setPipelineProjectName(e.target.value)}
                            required
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block text-xs font-medium text-slate-600">Client</span>
                          <input
                            className="et-input w-full"
                            value={pipelineClientName}
                            onChange={(e) => setPipelineClientName(e.target.value)}
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="mb-1 block text-xs font-medium text-slate-600">Assign owner</span>
                          <select
                            className="et-input w-full"
                            value={pipelineOwner}
                            onChange={(e) => setPipelineOwner(e.target.value)}
                          >
                            {TEAM_USERS.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
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
                            updateDraft(index, { survey_id: e.target.value ? Number(e.target.value) : '' })
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
                    <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={draft.billable}
                        onChange={(e) => updateDraft(index, { billable: e.target.checked })}
                      />
                      Billable
                    </label>
                  </div>
                ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                className="et-btn-secondary"
                onClick={() => {
                  setSelectedEmail(null)
                  setDrafts([])
                  setProposalBrief(null)
                }}
              >
                Cancel
              </button>
              {proposalBrief && (
                <button
                  type="button"
                  className="et-btn-primary"
                  disabled={creatingPipeline || breakdownLoading || !pipelineProjectName.trim()}
                  onClick={() => void handleCreatePipeline()}
                >
                  {creatingPipeline ? <Loader2 size={14} className="animate-spin" /> : <Briefcase size={14} />}
                  Create pipeline & assign
                </button>
              )}
              <button
                type="submit"
                className={proposalBrief ? 'et-btn-secondary' : 'et-btn-primary'}
                disabled={creating || creatingPipeline || breakdownLoading || drafts.length === 0}
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {proposalBrief ? 'Tasks only' : `Create ${drafts.length} task${drafts.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {showNewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateTask}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-slate-900">New task</h3>
            <p className="mt-1 text-sm text-slate-500">
              Link to a study or leave project empty for general work. Leave assignee empty to put it in the New tasks
              box.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Study / project (optional)</span>
                <select
                  className="et-input w-full"
                  value={taskSurveyId}
                  onChange={(e) => setTaskSurveyId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">No project — general task</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (#{p.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Title</span>
                <input
                  className="et-input w-full"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="What needs doing?"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Assign to</span>
                <select
                  className="et-input w-full"
                  value={taskAssignee}
                  onChange={(e) => setTaskAssignee(e.target.value)}
                >
                  <option value="">Unassigned (new task queue)</option>
                  {TEAM_USERS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="et-btn-secondary" onClick={() => setShowNewTask(false)}>
                Cancel
              </button>
              <button type="submit" className="et-btn-primary" disabled={creatingTask || !taskTitle.trim()}>
                {creatingTask ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
