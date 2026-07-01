import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  Circle,
  ClipboardList,
  Landmark,
  Link2,
  Loader2,
  PenLine,
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
import { ET_HOME_SUBTITLE, ET_HOME_TAGLINE, ET_PRODUCT_NAME } from '../lib/etCopy'
import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS } from '../lib/workflowAccess'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

const PROJECT_PREVIEW = 6

const QUICK_LINK_TOOLS = [
  {
    id: 'limesurvey',
    label: 'LimeSurvey studies',
    description: 'Open fieldwork & analysis workspaces',
    href: '/quantitative?tab=studies',
    icon: BarChart3,
    group: 'Quantitative',
  },
  {
    id: 'studio',
    label: 'Survey Studio',
    description: 'Program ET native surveys',
    href: '/quantitative?tab=studio',
    icon: Sparkles,
    group: 'Quantitative',
  },
  {
    id: 'programming',
    label: 'Programming',
    description: 'Survey links & PM shortcuts',
    href: '/quantitative?tab=programming',
    icon: PenLine,
    group: 'Quantitative',
  },
  {
    id: 'survey-links',
    label: 'Survey links',
    description: 'Link LimeSurvey IDs to PM projects',
    href: '/quantitative?tab=links',
    icon: Link2,
    group: 'Quantitative',
  },
  {
    id: 'operations',
    label: 'PM projects',
    description: 'Pipeline, proposals & delivery stages',
    href: '/operations?tab=pipeline',
    icon: Briefcase,
    group: 'Operations',
  },
  {
    id: 'my-work',
    label: 'My work',
    description: 'Tasks & Gmail inbox',
    href: '/my-work',
    icon: ClipboardList,
    group: 'Operations',
  },
  {
    id: 'accounting',
    label: 'Accounting',
    description: 'Invoices, bills & Zoho migration',
    href: '/accounting',
    icon: Landmark,
    group: 'Operations',
  },
  {
    id: 'crm',
    label: 'CRM',
    description: 'Clients & marketing',
    href: '/operations?tab=clients',
    icon: Users,
    group: 'Operations',
  },
] as const

const QUICK_LINK_STORAGE_KEY = 'et_scout_home_quick_links'

function loadQuickLinkSelection(): string[] {
  try {
    const raw = localStorage.getItem(QUICK_LINK_STORAGE_KEY)
    if (!raw) return ['limesurvey', 'studio', 'operations', 'my-work']
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return ['limesurvey', 'studio', 'operations', 'my-work']
    return parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    return ['limesurvey', 'studio', 'operations', 'my-work']
  }
}

function saveQuickLinkSelection(ids: string[]) {
  localStorage.setItem(QUICK_LINK_STORAGE_KEY, JSON.stringify(ids))
}

function StageBadge({ stage }: { stage: string }) {
  const tone =
    stage === 'Delivered'
      ? 'bg-slate-100 text-slate-500'
      : stage === 'Proposal'
        ? 'bg-sky-100 text-sky-800'
        : stage.includes('Fieldwork') || stage === 'QC'
          ? 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]'
          : stage === 'Analysis' || stage === 'Reporting'
            ? 'bg-violet-100 text-violet-800'
            : 'bg-amber-50 text-amber-900'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>{stage}</span>
  )
}

function StatChip({
  label,
  value,
  href,
  accent,
}: {
  label: string
  value: number | string
  href?: string
  accent?: boolean
}) {
  const inner = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${accent ? 'text-[var(--et-yellow)]' : 'text-white'}`}>
        {value}
      </p>
    </>
  )
  if (href) {
    return (
      <Link
        to={href}
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/25 hover:bg-white/10"
      >
        {inner}
      </Link>
    )
  }
  return <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">{inner}</div>
}

function SectionHeader({
  title,
  href,
  actionLabel,
  badge,
}: {
  title: string
  href: string
  actionLabel?: string
  badge?: number
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {badge != null && badge > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{badge}</span>
        )}
      </div>
      <Link to={href} className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline">
        {actionLabel ?? 'Open'}
        <ArrowRight size={12} className="ml-0.5 inline" />
      </Link>
    </div>
  )
}

function TaskList({ rows, empty }: { rows: MyTaskRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{empty}</p>
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={`${row.personal ? 'p' : row.survey_id}-${row.task.id}`}>
          {row.personal || row.survey_id == null ? (
            <div className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
              <Circle size={14} className="mt-0.5 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{row.task.title}</p>
                <p className="text-xs text-slate-500">
                  {row.survey_title} · {TASK_CATEGORY_LABELS[row.task.category] ?? row.task.category}
                </p>
              </div>
            </div>
          ) : (
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
          )}
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
  const [showQuickLinkPicker, setShowQuickLinkPicker] = useState(false)
  const [quickLinkIds, setQuickLinkIds] = useState<string[]>(() => loadQuickLinkSelection())
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

  const openAssigned = assignedTasks.filter((t) => t.task.status !== 'done')
  const openNew = newTasks.filter((t) => t.task.status !== 'done')

  const activePmProjects = useMemo(
    () => pmProjects.filter((p) => p.stage !== 'Delivered'),
    [pmProjects],
  )

  const pipelineSpotlight = useMemo(() => {
    if (!user?.username) return activePmProjects.slice(0, PROJECT_PREVIEW)
    const mine = activePmProjects.filter((p) => p.owner_name === user.username)
    return (mine.length ? mine : activePmProjects).slice(0, PROJECT_PREVIEW)
  }, [activePmProjects, user?.username])

  const deliveredCount = useMemo(
    () => pmProjects.filter((p) => p.stage === 'Delivered').length,
    [pmProjects],
  )

  const myPmProjects = pipelineSpotlight

  const proposalProjects = useMemo(
    () => activePmProjects.filter((p) => p.stage === 'Proposal').slice(0, PROJECT_PREVIEW),
    [activePmProjects],
  )

  const totalOutstanding = useMemo(
    () => financeSnapshots.reduce((sum, f) => sum + (f.total_outstanding ?? 0), 0),
    [financeSnapshots],
  )

  const quickLinks = useMemo(
    () =>
      quickLinkIds
        .map((id) => QUICK_LINK_TOOLS.find((t) => t.id === id))
        .filter((t): t is (typeof QUICK_LINK_TOOLS)[number] => Boolean(t)),
    [quickLinkIds],
  )

  function toggleQuickLink(id: string) {
    setQuickLinkIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      saveQuickLinkSelection(next)
      return next
    })
  }

  if (loading) return <LoadingState message="Loading your workspace…" />

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-2 animate-fade-in">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[var(--et-navy)] via-[#0f2847] to-slate-900 px-5 py-7 text-white shadow-lg sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--et-teal)]/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--et-yellow)]">
              {ET_PRODUCT_NAME}
            </p>
            <h1 className="font-display mt-1 text-2xl font-bold leading-tight sm:text-3xl">
              Welcome back{user?.username ? `, ${user.username}` : ''}
            </h1>
            <p className="mt-2 text-sm font-medium text-white/90">{ET_HOME_TAGLINE}</p>
            <p className="mt-1 text-xs text-white/60">{ET_HOME_SUBTITLE}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur hover:bg-white/15 disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <StatChip label="My tasks" value={openAssigned.length} href="/my-work" accent={openAssigned.length > 0} />
          <StatChip label="New queue" value={openNew.length} href="/my-work" />
          <StatChip
            label="Active projects"
            value={pmEnabled ? activePmProjects.length : '—'}
            href="/operations?tab=pipeline"
          />
          <StatChip label="Proposals" value={pmEnabled ? proposalProjects.length : '—'} href="/operations?tab=pipeline" />
        </div>

        <div className="relative mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowNewTask(true)} className="et-btn-accent inline-flex items-center gap-1.5">
            <Plus size={16} />
            New task
          </button>
          <Link
            to="/my-work"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15"
          >
            <ClipboardList size={16} />
            My work & inbox
          </Link>
          <Link
            to="/quantitative"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-transparent px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/10"
          >
            <BarChart3 size={16} />
            Quantitative
          </Link>
        </div>
      </section>

      {error && <ErrorState message={error} />}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Quick links</h2>
            <p className="text-xs text-slate-500">Your pinned tools — customise anytime.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowQuickLinkPicker((v) => !v)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-[var(--et-teal-dark)] hover:bg-slate-50"
          >
            {showQuickLinkPicker ? 'Done' : 'Customise'}
          </button>
        </div>

        {showQuickLinkPicker ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_LINK_TOOLS.map((tool) => {
              const selected = quickLinkIds.includes(tool.id)
              const Icon = tool.icon
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => toggleQuickLink(tool.id)}
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    selected
                      ? 'border-[var(--et-teal)] bg-[var(--et-teal-light)]/30 ring-1 ring-[var(--et-teal)]/20'
                      : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                  }`}
                >
                  <Icon size={16} className="mt-0.5 shrink-0 text-[var(--et-teal-dark)]" />
                  <span>
                    <span className="block font-medium text-slate-900">{tool.label}</span>
                    <span className="text-[10px] text-slate-500">{tool.group}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : quickLinks.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1 et-scroll sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
            {quickLinks.map((tool) => {
              const Icon = tool.icon
              return (
                <Link
                  key={tool.id}
                  to={tool.href}
                  className="group flex min-w-[10.5rem] shrink-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 transition hover:border-[var(--et-teal)]/35 hover:bg-[var(--et-teal-light)]/15 sm:min-w-0"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--et-teal-dark)] shadow-sm ring-1 ring-slate-100 group-hover:ring-[var(--et-teal)]/30">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{tool.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">{tool.description}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No quick links yet.{' '}
            <button
              type="button"
              className="font-medium text-[var(--et-teal-dark)] hover:underline"
              onClick={() => setShowQuickLinkPicker(true)}
            >
              Choose tools
            </button>
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <SectionHeader title="Your work" href="/my-work" actionLabel="Open My work" badge={openAssigned.length + openNew.length} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Assigned to me</p>
              <TaskList rows={openAssigned.slice(0, 4)} empty="Nothing assigned — check My work." />
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">New queue</p>
              <TaskList rows={openNew.slice(0, 4)} empty="No unassigned tasks." />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-3">
          <SectionHeader
            title="Pipeline spotlight"
            href="/operations?tab=pipeline"
            actionLabel="All projects"
            badge={activePmProjects.length}
          />
          {!pmEnabled ? (
            <p className="text-sm text-slate-500">
              Connect Operations to see PM pipeline — proposals, budgets, and delivery stages.
            </p>
          ) : myPmProjects.length > 0 ? (
            <ul className="space-y-2">
              {myPmProjects.map((p) => (
                <li key={p.project_id}>
                  <Link
                    to="/operations?tab=pipeline"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 transition hover:border-[var(--et-teal)]/30 hover:bg-[var(--et-teal-light)]/10"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{p.project_name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {p.client_name ?? 'No client'}
                        {p.billing_month ? ` · ${p.billing_month}` : ''}
                        {p.fiscal_year ? ` · ${p.fiscal_year}` : ''}
                      </p>
                    </div>
                    <StageBadge stage={p.stage} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No active projects" description="Delivered work is hidden here — open Operations for the full list." />
          )}
          {pmEnabled && deliveredCount > 0 && (
            <p className="mt-3 text-[11px] text-slate-400">
              {deliveredCount} delivered project{deliveredCount === 1 ? '' : 's'} — sorted to the bottom in Operations.
            </p>
          )}
        </section>
      </div>

      {pmEnabled && (
        <div className="grid gap-4 sm:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader title="Proposals" href="/operations?tab=pipeline" badge={proposalProjects.length || proposals.length} />
            {proposalProjects.length > 0 ? (
              <ul className="space-y-2">
                {proposalProjects.slice(0, 3).map((p) => (
                  <li key={p.project_id}>
                    <Link to="/operations?tab=pipeline" className="block text-sm hover:text-[var(--et-teal-dark)]">
                      <span className="font-medium text-slate-900">{p.project_name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{p.client_name ?? 'Client TBC'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">No projects at Proposal stage.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader title="CRM" href="/operations?tab=clients" badge={clients.length} />
            {clients.length > 0 ? (
              <ul className="space-y-2">
                {clients.slice(0, 3).map((c) => (
                  <li key={c.client_id} className="text-sm">
                    <span className="font-medium text-slate-900">{c.client_name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {c.project_count ?? 0} project{(c.project_count ?? 0) === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">Add clients in Operations.</p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader title="Finance" href="/operations?tab=finance" />
            {financeSnapshots.length > 0 ? (
              <div className="space-y-2">
                <p className="text-2xl font-semibold text-slate-900">
                  {totalOutstanding > 0 ? `£${totalOutstanding.toLocaleString()}` : '—'}
                </p>
                <p className="text-[10px] font-semibold uppercase text-slate-400">Outstanding (sample)</p>
                <Link to="/accounting" className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline">
                  Open accounting →
                </Link>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Budgets & invoices in Operations → Finance.</p>
            )}
          </section>
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
              Add a task to a LimeSurvey study workflow, or use My work for personal tasks.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">LimeSurvey study</span>
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
