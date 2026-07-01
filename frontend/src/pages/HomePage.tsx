import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Briefcase,
  Circle,
  ClipboardList,
  DollarSign,
  FileText,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react'
import { TEAM_USERS, useAuth } from '../auth/AuthContext'
import {
  api,
  type MyTaskRow,
  type PmClient,
  type PmFinanceSummary,
  type PmPipelineProject,
  type PmProposal,
  type Project,
  type ProjectTask,
  type ProjectWorkflow,
} from '../api/client'
import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS } from '../lib/workflowAccess'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

const TASK_PREVIEW = 5
const PROJECT_PREVIEW = 6

function ModuleCard({
  title,
  icon: Icon,
  href,
  actionLabel,
  children,
  badge,
}: {
  title: string
  icon: typeof ClipboardList
  href: string
  actionLabel?: string
  children: React.ReactNode
  badge?: number
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--et-teal-light)]/50 text-[var(--et-teal-dark)]">
            <Icon size={16} />
          </span>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {badge != null && badge > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {badge}
            </span>
          )}
        </div>
        <Link to={href} className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline">
          {actionLabel ?? 'Open'}
          <ArrowRight size={12} className="ml-0.5 inline" />
        </Link>
      </div>
      <div className="flex-1 p-4">{children}</div>
    </section>
  )
}

function TaskList({ rows, empty }: { rows: MyTaskRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{empty}</p>
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={`${row.survey_id}-${row.task.id}`}>
          <Link
            to={`/projects/${row.survey_id}?mode=workflow`}
            className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 transition hover:border-[var(--et-teal)]/30 hover:bg-[var(--et-teal-light)]/10"
          >
            <Circle size={14} className="mt-0.5 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{row.task.title}</p>
              <p className="text-xs text-slate-500">
                {row.survey_title} · {TASK_CATEGORY_LABELS[row.task.category] ?? row.task.category}
                {' · '}
                {TASK_STATUS_LABELS[row.task.status] ?? row.task.status}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function emptyTask(createdBy: string): ProjectTask {
  return {
    id: crypto.randomUUID().slice(0, 12),
    title: '',
    description: '',
    category: 'general',
    assignee: createdBy,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    created_by: createdBy,
    created_at: Date.now() / 1000,
    updated_at: Date.now() / 1000,
    comments: [],
    source: 'manual',
    gmail_message_id: null,
    gmail_thread_id: null,
  }
}

export function HomePage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [assignedTasks, setAssignedTasks] = useState<MyTaskRow[]>([])
  const [newTasks, setNewTasks] = useState<MyTaskRow[]>([])
  const [limeProjects, setLimeProjects] = useState<Project[]>([])
  const [pmEnabled, setPmEnabled] = useState(false)
  const [pmProjects, setPmProjects] = useState<PmPipelineProject[]>([])
  const [proposals, setProposals] = useState<PmProposal[]>([])
  const [clients, setClients] = useState<PmClient[]>([])
  const [financeSnapshots, setFinanceSnapshots] = useState<PmFinanceSummary[]>([])

  const [showNewTask, setShowNewTask] = useState(false)
  const [taskSurveyId, setTaskSurveyId] = useState<number | ''>('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [assignedRes, newRes, surveysRes, pmStatusRes] = await Promise.allSettled([
        api.getMyTasks(),
        api.getUnassignedTasks(),
        api.getProjects({ cachedOnly: true, limit: 50 }),
        api.getPmStatus(),
      ])

      if (assignedRes.status === 'fulfilled') setAssignedTasks(assignedRes.value.tasks)
      else setAssignedTasks([])

      if (newRes.status === 'fulfilled') setNewTasks(newRes.value.tasks)
      else setNewTasks([])

      if (surveysRes.status === 'fulfilled') {
        setLimeProjects(surveysRes.value.projects ?? [])
      } else {
        setLimeProjects([])
      }

      const pmOn =
        pmStatusRes.status === 'fulfilled' && pmStatusRes.value.enabled && pmStatusRes.value.ready
      setPmEnabled(pmOn)

      if (pmOn) {
        const [pipeRes, clientsRes, proposalsRes] = await Promise.allSettled([
          api.getPmPipeline(),
          api.listPmClients(),
          api.listPmProposals(),
        ])
        const pipe =
          pipeRes.status === 'fulfilled' ? pipeRes.value.projects : []
        setPmProjects(pipe)
        setClients(clientsRes.status === 'fulfilled' ? clientsRes.value : [])
        setProposals(proposalsRes.status === 'fulfilled' ? proposalsRes.value : [])

        const owned = pipe
          .filter((p) => !user?.username || p.owner_name === user.username)
          .slice(0, 3)
        const finances = await Promise.allSettled(
          owned.map((p) => api.getPmFinance(p.project_id)),
        )
        setFinanceSnapshots(
          finances
            .filter((r): r is PromiseFulfilledResult<PmFinanceSummary> => r.status === 'fulfilled')
            .map((r) => r.value),
        )
      } else {
        setPmProjects([])
        setClients([])
        setProposals([])
        setFinanceSnapshots([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load home')
    }
  }, [user?.username])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await load()
      setLoading(false)
    })()
  }, [load])

  useEffect(() => {
    if (user?.username) setTaskAssignee(user.username)
  }, [user?.username])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function handleCreateTask(e: FormEvent) {
    e.preventDefault()
    if (!taskTitle.trim() || taskSurveyId === '') return
    setCreatingTask(true)
    setError(null)
    try {
      const { workflow } = await api.getProjectWorkflow(Number(taskSurveyId))
      const task = emptyTask(user?.username ?? '')
      task.title = taskTitle.trim()
      task.assignee = taskAssignee || null
      const updated: ProjectWorkflow = {
        ...workflow,
        tasks: [task, ...workflow.tasks],
      }
      await api.setProjectWorkflow(Number(taskSurveyId), updated)
      setShowNewTask(false)
      setTaskTitle('')
      setTaskSurveyId('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setCreatingTask(false)
    }
  }

  const myPmProjects = useMemo(() => {
    if (!user?.username) return pmProjects.slice(0, PROJECT_PREVIEW)
    const mine = pmProjects.filter((p) => p.owner_name === user.username)
    return (mine.length ? mine : pmProjects).slice(0, PROJECT_PREVIEW)
  }, [pmProjects, user?.username])

  const proposalProjects = useMemo(
    () => pmProjects.filter((p) => p.stage === 'Proposal').slice(0, PROJECT_PREVIEW),
    [pmProjects],
  )

  const totalOutstanding = useMemo(
    () =>
      financeSnapshots.reduce((sum, f) => sum + (f.total_outstanding ?? 0), 0),
    [financeSnapshots],
  )

  const openAssigned = assignedTasks.filter((t) => t.task.status !== 'done')

  if (loading) return <LoadingState message="Loading your workspace…" />

  return (
    <div className="space-y-6 py-2 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--et-teal)]">
            Elastic Tree Scout
          </p>
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            Welcome back{user?.username ? `, ${user.username}` : ''}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Your hub for tasks, projects, proposals, CRM, and finance — pick up where you left off.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="et-btn-secondary"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      {error && <ErrorState message={error} />}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowNewTask(true)} className="et-btn-primary">
          <Plus size={16} />
          New task
        </button>
        <Link to="/my-work" className="et-btn-secondary">
          <ClipboardList size={16} />
          My work & inbox
        </Link>
        {pmEnabled && (
          <Link to="/operations?tab=pipeline" className="et-btn-secondary">
            <Sparkles size={16} />
            Draft proposal
          </Link>
        )}
        <Link to="/dashboard" className="et-btn-secondary">
          <LayoutGrid size={16} />
          All LimeSurvey studies
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ModuleCard
          title="Assigned to me"
          icon={ClipboardList}
          href="/my-work"
          actionLabel="My work"
          badge={openAssigned.length}
        >
          <TaskList
            rows={openAssigned.slice(0, TASK_PREVIEW)}
            empty="No open tasks assigned to you."
          />
        </ModuleCard>

        <ModuleCard
          title="New tasks"
          icon={Circle}
          href="/my-work"
          actionLabel="View inbox"
          badge={newTasks.length}
        >
          <p className="mb-3 text-xs text-slate-500">Unassigned tasks across studies — claim or assign from workflow.</p>
          <TaskList rows={newTasks.slice(0, TASK_PREVIEW)} empty="No unassigned tasks in the queue." />
        </ModuleCard>

        <ModuleCard
          title="My projects"
          icon={LayoutGrid}
          href="/dashboard"
          actionLabel="All studies"
          badge={myPmProjects.length || limeProjects.length}
        >
          {myPmProjects.length > 0 ? (
            <ul className="space-y-2">
              {myPmProjects.map((p) => (
                <li key={p.project_id}>
                  <Link
                    to={
                      p.limesurvey_survey_id
                        ? `/projects/${p.limesurvey_survey_id}`
                        : '/operations?tab=pipeline'
                    }
                    className="block rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm hover:border-[var(--et-teal)]/30"
                  >
                    <span className="font-medium text-slate-900">{p.project_name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {p.client_name ?? 'No client'} · {p.stage}
                      {p.limesurvey_survey_id ? ` · Survey #${p.limesurvey_survey_id}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : limeProjects.length > 0 ? (
            <ul className="space-y-2">
              {limeProjects.slice(0, PROJECT_PREVIEW).map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/projects/${p.id}`}
                    className="block rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm hover:border-[var(--et-teal)]/30"
                  >
                    <span className="font-medium text-slate-900">{p.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">LimeSurvey #{p.id}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No projects yet" description="Create a PM project in Operations or open LimeSurvey studies." />
          )}
        </ModuleCard>

        <ModuleCard
          title="Proposals"
          icon={FileText}
          href="/operations?tab=pipeline"
          badge={proposalProjects.length || proposals.length}
        >
          {!pmEnabled ? (
            <p className="text-sm text-slate-500">
              Connect the operations database to track proposals and run the proposal writing agent.
            </p>
          ) : proposalProjects.length > 0 ? (
            <ul className="space-y-2">
              {proposalProjects.map((p) => (
                <li key={p.project_id}>
                  <Link
                    to="/operations?tab=pipeline"
                    className="block rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm hover:border-[var(--et-teal)]/30"
                  >
                    <span className="font-medium text-slate-900">{p.project_name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {p.client_name ?? 'Client TBC'} · {p.proposal_status ?? 'draft'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : proposals.length > 0 ? (
            <p className="text-sm text-slate-600">
              {proposals.length} proposal version{proposals.length === 1 ? '' : 's'} on file across projects.
            </p>
          ) : (
            <EmptyState title="No proposals in pipeline" description="Add a project at Proposal stage in Operations." />
          )}
        </ModuleCard>

        <ModuleCard
          title="CRM"
          icon={Users}
          href="/operations?tab=clients"
          badge={clients.length}
        >
          {!pmEnabled ? (
            <p className="text-sm text-slate-500">CRM and marketing follow-ups live in Operations when DATABASE_URL is set.</p>
          ) : clients.length > 0 ? (
            <ul className="space-y-2">
              {clients.slice(0, TASK_PREVIEW).map((c) => (
                <li key={c.client_id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-900">{c.client_name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {c.project_count ?? 0} project{(c.project_count ?? 0) === 1 ? '' : 's'}
                    {c.repeat_client ? ' · Repeat client' : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No clients yet" description="Add clients in Operations → CRM & marketing." />
          )}
        </ModuleCard>

        <ModuleCard
          title="Finance"
          icon={DollarSign}
          href="/operations?tab=finance"
        >
          {!pmEnabled ? (
            <p className="text-sm text-slate-500">Budget tracking and the finance agent require the operations database.</p>
          ) : financeSnapshots.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Outstanding</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {totalOutstanding > 0 ? `£${totalOutstanding.toLocaleString()}` : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Your projects</p>
                  <p className="text-lg font-semibold text-slate-900">{myPmProjects.length}</p>
                </div>
              </div>
              <ul className="space-y-1 text-sm text-slate-600">
                {financeSnapshots.map((f) => (
                  <li key={f.project_id}>
                    {f.project_name}: budget{' '}
                    {f.budget_estimate != null ? `£${f.budget_estimate.toLocaleString()}` : 'TBC'}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <Briefcase size={16} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
              <p>
                {pmProjects.length} PM project{pmProjects.length === 1 ? '' : 's'} in pipeline. Open Finance for budgets,
                invoices, and the finance agent.
              </p>
            </div>
          )}
        </ModuleCard>
      </div>

      {showNewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateTask}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-slate-900">New task</h3>
            <p className="mt-1 text-sm text-slate-500">Add a task to a study workflow.</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Study</span>
                <select
                  className="et-input w-full"
                  value={taskSurveyId}
                  onChange={(e) => setTaskSurveyId(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Select study…</option>
                  {limeProjects.map((p) => (
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
              <button type="submit" className="et-btn-primary" disabled={creatingTask || taskSurveyId === ''}>
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
