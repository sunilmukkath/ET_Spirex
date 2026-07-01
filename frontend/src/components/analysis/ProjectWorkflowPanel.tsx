import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  FileSpreadsheet,
  Flag,
  Languages,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Send,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  api,
  type GlobalRole,
  type ProjectActivity,
  type ProjectMember,
  type ProjectModule,
  type ProjectTask,
  type ProjectWorkflow,
  type StudyType,
  type TaskCategory,
  type TaskStatus,
  type TranslationRow,
  type TranslationStatus,
  type WorkflowAccess,
} from '../../api/client'
import { TEAM_USERS } from '../../auth/AuthContext'
import {
  PROJECT_PHASE_LABELS,
  PROJECT_PHASE_HINTS,
  PROJECT_PHASES,
  STUDY_TYPE_LABELS,
} from '../../lib/workflowPhases'
import {
  PROJECT_MODULE_LABELS,
  PROJECT_MODULE_HINTS,
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
  canManageTeam,
} from '../../lib/workflowAccess'
import { ET_WORKFLOW_TAGLINE } from '../../lib/etCopy'
import { ProjectRequirementsEditor, emptyProjectRequirements } from '../ProjectRequirementsEditor'

const TASK_CATEGORIES: TaskCategory[] = [
  'programming',
  'field',
  'research',
  'finance',
  'client_request',
  'general',
]

const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']

const ALL_MODULES = Object.keys(PROJECT_MODULE_LABELS) as ProjectModule[]

const TRANSLATION_STATUSES: TranslationStatus[] = [
  'not_started',
  'in_progress',
  'review',
  'complete',
]

const TRANSLATION_STATUS_LABELS: Record<TranslationStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  review: 'In review',
  complete: 'Complete',
}

function emptyTask(): ProjectTask {
  return {
    id: crypto.randomUUID().slice(0, 12),
    title: '',
    description: '',
    category: 'general',
    assignee: null,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    created_at: Date.now() / 1000,
    updated_at: Date.now() / 1000,
  }
}

function formatActivityTime(ts: number) {
  const d = new Date(ts * 1000)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function activityTone(type: ProjectActivity['type']) {
  switch (type) {
    case 'phase_change':
      return 'border-l-[var(--et-teal)]'
    case 'task_created':
    case 'task_updated':
      return 'border-l-sky-400'
    case 'task_comment':
      return 'border-l-violet-400'
    case 'member_added':
    case 'member_removed':
      return 'border-l-amber-400'
    default:
      return 'border-l-slate-300'
  }
}

function statusIcon(status: TaskStatus) {
  if (status === 'done') return <CheckCircle2 size={16} className="text-emerald-600" />
  return <Circle size={16} className="text-slate-400" />
}

interface Props {
  surveyId: number
  currentUser: string
  globalRole?: GlobalRole
}

export function ProjectWorkflowPanel({ surveyId, currentUser, globalRole }: Props) {
  const [workflow, setWorkflow] = useState<ProjectWorkflow>({ members: [], tasks: [], notes: '' })
  const [access, setAccess] = useState<WorkflowAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taskFilter, setTaskFilter] = useState<TaskCategory | 'all'>('all')
  const [showMineOnly, setShowMineOnly] = useState(false)
  const [newMember, setNewMember] = useState('')
  const [draftTask, setDraftTask] = useState<ProjectTask | null>(null)
  const [activityDraft, setActivityDraft] = useState('')
  const [postingActivity, setPostingActivity] = useState(false)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [postingCommentId, setPostingCommentId] = useState<string | null>(null)
  const [exportingSpec, setExportingSpec] = useState<'xlsx' | 'docx' | null>(null)

  const canEdit = canManageTeam(access)
  const isMember =
    workflow.members.some((m) => m.username === currentUser) || canEdit

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getProjectWorkflow(surveyId)
      setWorkflow(data.workflow)
      setAccess(data.access)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow')
    } finally {
      setLoading(false)
    }
  }, [surveyId])

  useEffect(() => {
    void load()
  }, [load])

  const assignedMembers = useMemo(
    () => new Set(workflow.members.map((m) => m.username)),
    [workflow.members],
  )

  const availableToAdd = TEAM_USERS.filter((u) => !assignedMembers.has(u))

  const filteredTasks = useMemo(() => {
    let tasks = workflow.tasks ?? []
    if (showMineOnly) {
      tasks = tasks.filter((t) => t.assignee === currentUser)
    }
    if (taskFilter === 'all') return tasks
    return tasks.filter((t) => t.category === taskFilter)
  }, [workflow.tasks, taskFilter, showMineOnly, currentUser])

  const myTaskCount = useMemo(
    () => workflow.tasks.filter((t) => t.assignee === currentUser && t.status !== 'done').length,
    [workflow.tasks, currentUser],
  )

  const activities = workflow.activities ?? []

  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: workflow.tasks.length }
    for (const cat of TASK_CATEGORIES) {
      counts[cat] = workflow.tasks.filter((t) => t.category === cat).length
    }
    return counts
  }, [workflow.tasks])

  async function persist(next: ProjectWorkflow) {
    setSaving(true)
    setError(null)
    const payload: ProjectWorkflow = {
      ...next,
      translations: (next.translations ?? []).filter((row) => row.language.trim()),
    }
    try {
      const data = await api.setProjectWorkflow(surveyId, payload)
      setWorkflow(data.workflow)
      setAccess(data.access)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function updateWorkflow(patch: Partial<ProjectWorkflow>) {
    setWorkflow((prev) => ({ ...prev, ...patch }))
  }

  function updateMember(username: string, patch: Partial<ProjectMember>) {
    updateWorkflow({
      members: workflow.members.map((m) => (m.username === username ? { ...m, ...patch } : m)),
    })
  }

  function toggleMemberModule(username: string, module: ProjectModule) {
    const member = workflow.members.find((m) => m.username === username)
    if (!member) return
    const next = member.modules.includes(module)
      ? member.modules.filter((m) => m !== module)
      : [...member.modules, module]
    updateMember(username, { modules: next })
  }

  function addMember() {
    if (!newMember || assignedMembers.has(newMember)) return
    updateWorkflow({
      members: [
        ...workflow.members,
        {
          username: newMember,
          project_role: 'contributor',
          is_project_manager: false,
          modules: [],
        },
      ],
    })
    setNewMember('')
  }

  function removeMember(username: string) {
    updateWorkflow({
      members: workflow.members.filter((m) => m.username !== username),
      tasks: workflow.tasks.map((t) =>
        t.assignee === username ? { ...t, assignee: null } : t,
      ),
    })
  }

  function addTask() {
    const task = emptyTask()
    task.created_by = currentUser
    setDraftTask(task)
  }

  function saveDraftTask() {
    if (!draftTask?.title.trim()) return
    const task = {
      ...draftTask,
      title: draftTask.title.trim(),
      updated_at: Date.now() / 1000,
    }
    updateWorkflow({ tasks: [task, ...workflow.tasks] })
    setDraftTask(null)
  }

  function updateTask(taskId: string, patch: Partial<ProjectTask>) {
    updateWorkflow({
      tasks: workflow.tasks.map((t) =>
        t.id === taskId ? { ...t, ...patch, updated_at: Date.now() / 1000 } : t,
      ),
    })
  }

  function removeTask(taskId: string) {
    updateWorkflow({ tasks: workflow.tasks.filter((t) => t.id !== taskId) })
  }

  async function postActivity() {
    const message = activityDraft.trim()
    if (!message) return
    setPostingActivity(true)
    setError(null)
    try {
      const data = await api.addProjectActivity(surveyId, message)
      setWorkflow(data.workflow)
      setAccess(data.access)
      setActivityDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post update')
    } finally {
      setPostingActivity(false)
    }
  }

  async function exportSpec(format: 'xlsx' | 'docx') {
    setExportingSpec(format)
    setError(null)
    try {
      await api.exportQuestionnaireSpec(surveyId, format)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExportingSpec(null)
    }
  }

  function addTranslationRow() {
    const row: TranslationRow = {
      id: crypto.randomUUID().slice(0, 12),
      language: '',
      label: '',
      status: 'not_started',
      notes: '',
    }
    updateWorkflow({ translations: [...(workflow.translations ?? []), row] })
  }

  function updateTranslation(id: string, patch: Partial<TranslationRow>) {
    updateWorkflow({
      translations: (workflow.translations ?? []).map((row) =>
        row.id === id ? { ...row, ...patch, updated_at: Date.now() / 1000 } : row,
      ),
    })
  }

  function removeTranslation(id: string) {
    updateWorkflow({
      translations: (workflow.translations ?? []).filter((row) => row.id !== id),
    })
  }

  async function postComment(taskId: string) {
    const body = (commentDrafts[taskId] ?? '').trim()
    if (!body) return
    setPostingCommentId(taskId)
    setError(null)
    try {
      const data = await api.addTaskComment(surveyId, taskId, body)
      setWorkflow(data.workflow)
      setAccess(data.access)
      setCommentDrafts((prev) => ({ ...prev, [taskId]: '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setPostingCommentId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
      </div>
    )
  }

  const phase = workflow.phase ?? 'field'
  const studyType = workflow.study_type ?? 'quant'

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--canvas-subtle)] p-4 sm:p-6 et-scroll">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-900">Project workflow</h2>
            <p className="mt-1 text-sm text-slate-500">{ET_WORKFLOW_TAGLINE}</p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => void persist(workflow)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save workflow
            </button>
          )}
        </header>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Team</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {workflow.members.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Open tasks</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {access?.open_tasks ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Your tasks</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {access?.assigned_tasks ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Your access</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {access?.is_project_manager
                ? 'Project manager'
                : access?.project_role === 'lead'
                  ? 'Lead'
                  : globalRole === 'admin'
                    ? 'Admin'
                    : globalRole === 'manager'
                      ? 'Manager'
                      : 'Contributor'}
            </p>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <Flag size={18} className="text-[var(--et-teal)]" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Project status</h3>
              <p className="text-xs text-slate-500">
                Study phase and client details for this project. Save workflow to persist changes.
              </p>
            </div>
          </div>
          <div className="space-y-4 p-5">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Lifecycle phase</p>
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_PHASES.map((p) => {
                  const active = phase === p
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={!canEdit}
                      title={PROJECT_PHASE_HINTS[p]}
                      onClick={() => canEdit && updateWorkflow({ phase: p })}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'bg-[var(--et-teal)] text-white shadow-sm'
                          : canEdit
                            ? 'border border-slate-200 bg-white text-slate-600 hover:border-[var(--et-teal)]/40'
                            : 'border border-slate-100 bg-slate-50 text-slate-400'
                      }`}
                    >
                      {PROJECT_PHASE_LABELS[p]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs">
                <span className="mb-1 block font-medium text-slate-600">Study type</span>
                <select
                  value={studyType}
                  disabled={!canEdit}
                  onChange={(e) => updateWorkflow({ study_type: e.target.value as StudyType })}
                  className="et-select w-full"
                >
                  {(Object.keys(STUDY_TYPE_LABELS) as StudyType[]).map((key) => (
                    <option key={key} value={key}>
                      {STUDY_TYPE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="mb-1 block font-medium text-slate-600">Client</span>
                <input
                  type="text"
                  value={workflow.client_name ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => updateWorkflow({ client_name: e.target.value })}
                  placeholder="Client name"
                  className="et-input w-full"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block font-medium text-slate-600">Project code</span>
                <input
                  type="text"
                  value={workflow.project_code ?? ''}
                  disabled={!canEdit}
                  onChange={(e) => updateWorkflow({ project_code: e.target.value })}
                  placeholder="e.g. ET-2026-014"
                  className="et-input w-full"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block font-medium text-slate-600">Target field start</span>
                <input
                  type="date"
                  value={workflow.target_field_start ?? ''}
                  disabled={!canEdit}
                  onChange={(e) =>
                    updateWorkflow({ target_field_start: e.target.value || null })
                  }
                  className="et-input w-full"
                />
              </label>
              <label className="text-xs sm:col-span-2 lg:col-span-1">
                <span className="mb-1 block font-medium text-slate-600">Target delivery</span>
                <input
                  type="date"
                  value={workflow.target_delivery ?? ''}
                  disabled={!canEdit}
                  onChange={(e) =>
                    updateWorkflow({ target_delivery: e.target.value || null })
                  }
                  className="et-input w-full"
                />
              </label>
            </div>

            <section className="mt-4 rounded-xl border border-[var(--et-teal)]/20 bg-[var(--et-teal-light)]/10 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Project requirements</h3>
              <p className="mt-1 text-xs text-slate-500">
                Client brief and delivery spec — used by proposal and report agents.
              </p>
              <div className="mt-3">
                <ProjectRequirementsEditor
                  value={workflow.requirements ?? emptyProjectRequirements()}
                  disabled={!canEdit}
                  onChange={(requirements) => updateWorkflow({ requirements })}
                />
              </div>
            </section>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-[var(--et-teal)]" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Design & deploy</h3>
                <p className="text-xs text-slate-500">
                  Programmer spec export and translation tracker. Set phase to Pilot and save to
                  auto-add pilot checklist tasks.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void exportSpec('xlsx')}
                disabled={exportingSpec !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {exportingSpec === 'xlsx' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={14} />
                )}
                Excel spec
              </button>
              <button
                type="button"
                onClick={() => void exportSpec('docx')}
                disabled={exportingSpec !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {exportingSpec === 'docx' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileSpreadsheet size={14} />
                )}
                Word spec
              </button>
            </div>
          </div>
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Languages size={16} className="text-slate-500" />
                <p className="text-sm font-semibold text-slate-800">Translations</p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={addTranslationRow}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                >
                  <Plus size={12} />
                  Add language
                </button>
              )}
            </div>
            {(workflow.translations ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">
                Track translation status per language (e.g. hi, ta, te). Save workflow to persist.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-500">
                      <th className="pb-2 pr-2 font-semibold">Code</th>
                      <th className="pb-2 pr-2 font-semibold">Label</th>
                      <th className="pb-2 pr-2 font-semibold">Status</th>
                      <th className="pb-2 pr-2 font-semibold">Notes</th>
                      {canEdit && <th className="pb-2 w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {(workflow.translations ?? []).map((row) => (
                      <tr key={row.id} className="border-b border-slate-50">
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={row.language}
                            disabled={!canEdit}
                            onChange={(e) => updateTranslation(row.id, { language: e.target.value })}
                            placeholder="en"
                            className="et-input w-20 text-xs"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={row.label ?? ''}
                            disabled={!canEdit}
                            onChange={(e) => updateTranslation(row.id, { label: e.target.value })}
                            placeholder="Hindi"
                            className="et-input min-w-[6rem] text-xs"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            value={row.status}
                            disabled={!canEdit}
                            onChange={(e) =>
                              updateTranslation(row.id, {
                                status: e.target.value as TranslationStatus,
                              })
                            }
                            className="et-select text-xs"
                          >
                            {TRANSLATION_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {TRANSLATION_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={row.notes ?? ''}
                            disabled={!canEdit}
                            onChange={(e) => updateTranslation(row.id, { notes: e.target.value })}
                            placeholder="Translator, due date…"
                            className="et-input w-full min-w-[8rem] text-xs"
                          />
                        </td>
                        {canEdit && (
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => removeTranslation(row.id)}
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {phase === 'pilot' && workflow.pilot_tasks_seeded && (
              <p className="text-xs text-emerald-700">
                Pilot checklist tasks were added to the task tracker below.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <MessageSquare size={18} className="text-[var(--et-teal)]" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Activity feed</h3>
              <p className="text-xs text-slate-500">
                Phase changes, task updates, and team notes — newest first.
              </p>
            </div>
          </div>
          <div className="space-y-4 p-5">
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={activityDraft}
                  onChange={(e) => setActivityDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void postActivity()
                    }
                  }}
                  placeholder="Post a project update…"
                  className="et-input min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => void postActivity()}
                  disabled={postingActivity || !activityDraft.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  {postingActivity ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Post
                </button>
              </div>
            )}
            {activities.length === 0 ? (
              <p className="text-sm text-slate-500">
                No activity yet. Save workflow changes or post an update above.
              </p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto et-scroll">
                {activities.map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-lg border border-slate-100 border-l-4 bg-slate-50/60 px-3 py-2.5 ${activityTone(item.type)}`}
                  >
                    <p className="text-sm text-slate-800">{item.message}</p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {item.actor && <span className="font-medium text-slate-600">{item.actor}</span>}
                      {item.actor && ' · '}
                      {formatActivityTime(item.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <Users size={18} className="text-[var(--et-teal)]" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Team & access</h3>
              <p className="text-xs text-slate-500">
                Project managers get full access. Others are limited to selected modules.
              </p>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {canEdit && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs">
                  <span className="mb-1 block font-medium text-slate-600">Add team member</span>
                  <select
                    value={newMember}
                    onChange={(e) => setNewMember(e.target.value)}
                    className="et-select min-w-[12rem]"
                  >
                    <option value="">Select…</option>
                    {availableToAdd.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={addMember}
                  disabled={!newMember}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <UserPlus size={14} />
                  Add
                </button>
              </div>
            )}

            {workflow.members.length === 0 ? (
              <p className="text-sm text-slate-500">
                No team assigned yet. {canEdit ? 'Add members above to control who can work on this study.' : ''}
              </p>
            ) : (
              <div className="space-y-4">
                {workflow.members.map((member) => (
                  <div
                    key={member.username}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{member.username}</p>
                        <p className="text-xs text-slate-500">
                          {member.is_project_manager
                            ? 'Project manager — full access'
                            : member.project_role === 'lead'
                              ? 'Lead'
                              : 'Contributor'}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <label className="flex items-center gap-1.5">
                            <select
                              value={member.project_role}
                              onChange={(e) =>
                                updateMember(member.username, {
                                  project_role: e.target.value as 'lead' | 'contributor',
                                })
                              }
                              className="et-select text-xs"
                            >
                              <option value="contributor">Contributor</option>
                              <option value="lead">Lead</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={member.is_project_manager}
                              onChange={(e) =>
                                updateMember(member.username, {
                                  is_project_manager: e.target.checked,
                                })
                              }
                              className="rounded border-slate-300 text-[var(--et-teal)]"
                            />
                            Manager
                          </label>
                          <button
                            type="button"
                            onClick={() => removeMember(member.username)}
                            className="text-rose-600 hover:text-rose-800"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    {!member.is_project_manager && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {ALL_MODULES.map((mod) => {
                          const active = member.modules.includes(mod)
                          const disabled = !canEdit
                          return (
                            <button
                              key={mod}
                              type="button"
                              disabled={disabled}
                              title={PROJECT_MODULE_HINTS[mod]}
                              onClick={() => toggleMemberModule(member.username, mod)}
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                                active
                                  ? 'border-[var(--et-teal)] bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]'
                                  : 'border-slate-200 bg-white text-slate-500'
                              } ${disabled ? 'cursor-default opacity-80' : 'hover:border-slate-300'}`}
                            >
                              {PROJECT_MODULE_LABELS[mod]}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Task tracker</h3>
              <p className="text-xs text-slate-500">Programming, field, research, finance, client requests</p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={addTask}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus size={14} />
                New task
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
            <button
              type="button"
              onClick={() => setShowMineOnly(false)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                !showMineOnly
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Everyone
            </button>
            <button
              type="button"
              onClick={() => setShowMineOnly(true)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                showMineOnly
                  ? 'bg-[var(--et-teal)] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Mine ({myTaskCount})
            </button>
            <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:inline" />
            <button
              type="button"
              onClick={() => setTaskFilter('all')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                taskFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({taskCounts.all})
            </button>
            {TASK_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setTaskFilter(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  taskFilter === cat
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {TASK_CATEGORY_LABELS[cat]} ({taskCounts[cat] ?? 0})
              </button>
            ))}
          </div>

          <div className="space-y-3 p-5">
            {draftTask && (
              <div className="rounded-xl border border-[var(--et-teal)]/30 bg-[var(--et-teal-light)]/20 p-4">
                <p className="text-xs font-semibold text-slate-700">New task</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    value={draftTask.title}
                    onChange={(e) => setDraftTask({ ...draftTask, title: e.target.value })}
                    placeholder="Task title"
                    className="et-input sm:col-span-2"
                  />
                  <select
                    value={draftTask.category}
                    onChange={(e) =>
                      setDraftTask({ ...draftTask, category: e.target.value as TaskCategory })
                    }
                    className="et-select"
                  >
                    {TASK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {TASK_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={draftTask.assignee ?? ''}
                    onChange={(e) =>
                      setDraftTask({ ...draftTask, assignee: e.target.value || null })
                    }
                    className="et-select"
                  >
                    <option value="">Unassigned</option>
                    {workflow.members.map((m) => (
                      <option key={m.username} value={m.username}>
                        {m.username}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={draftTask.due_date ?? ''}
                    onChange={(e) =>
                      setDraftTask({ ...draftTask, due_date: e.target.value || null })
                    }
                    className="et-input"
                  />
                  <textarea
                    value={draftTask.description ?? ''}
                    onChange={(e) => setDraftTask({ ...draftTask, description: e.target.value })}
                    placeholder="Notes (optional)"
                    rows={2}
                    className="et-input sm:col-span-2"
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={saveDraftTask}
                    disabled={!draftTask.title.trim()}
                    className="rounded-lg bg-[var(--et-teal)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Add task
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftTask(null)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {filteredTasks.length === 0 ? (
              <p className="text-sm text-slate-500">No tasks in this category yet.</p>
            ) : (
              filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/40 p-4"
                >
                  <div className="pt-0.5">{statusIcon(task.status)}</div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`font-medium text-slate-900 ${
                          task.status === 'done' ? 'line-through text-slate-500' : ''
                        }`}
                      >
                        {task.title}
                      </p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                        {TASK_CATEGORY_LABELS[task.category]}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-xs text-slate-600">{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      {task.assignee && <span>Assignee: {task.assignee}</span>}
                      {task.due_date && (
                        <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                      )}
                      <span>Priority: {task.priority}</span>
                    </div>
                    {canEdit && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <select
                          value={task.status}
                          onChange={(e) =>
                            updateTask(task.id, { status: e.target.value as TaskStatus })
                          }
                          className="et-select text-xs"
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {TASK_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        <select
                          value={task.assignee ?? ''}
                          onChange={(e) =>
                            updateTask(task.id, { assignee: e.target.value || null })
                          }
                          className="et-select text-xs"
                        >
                          <option value="">Unassigned</option>
                          {workflow.members.map((m) => (
                            <option key={m.username} value={m.username}>
                              {m.username}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => removeTask(task.id)}
                          className="text-rose-600 hover:text-rose-800"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                    <div className="border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTaskId((id) => (id === task.id ? null : task.id))
                        }
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[var(--et-teal-dark)]"
                      >
                        <MessageSquare size={12} />
                        {(task.comments?.length ?? 0) > 0
                          ? `${task.comments!.length} comment${task.comments!.length === 1 ? '' : 's'}`
                          : 'Comments'}
                      </button>
                      {expandedTaskId === task.id && (
                        <div className="mt-2 space-y-2">
                          {(task.comments ?? []).length === 0 ? (
                            <p className="text-xs text-slate-500">No comments yet.</p>
                          ) : (
                            <ul className="space-y-2">
                              {(task.comments ?? []).map((c) => (
                                <li
                                  key={c.id}
                                  className="rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-slate-100"
                                >
                                  <p className="text-slate-800">{c.body}</p>
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    {c.author} · {formatActivityTime(c.created_at)}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                          {isMember && (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={commentDrafts[task.id] ?? ''}
                                onChange={(e) =>
                                  setCommentDrafts((prev) => ({
                                    ...prev,
                                    [task.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    void postComment(task.id)
                                  }
                                }}
                                placeholder="Add a comment…"
                                className="et-input min-w-0 flex-1 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => void postComment(task.id)}
                                disabled={
                                  postingCommentId === task.id ||
                                  !(commentDrafts[task.id] ?? '').trim()
                                }
                                className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                              >
                                {postingCommentId === task.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  'Reply'
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {canEdit && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="block text-sm">
              <span className="font-semibold text-slate-900">Project notes</span>
              <textarea
                value={workflow.notes ?? ''}
                onChange={(e) => updateWorkflow({ notes: e.target.value })}
                rows={3}
                placeholder="Kickoff notes, client contacts, field schedule…"
                className="et-input mt-2 w-full"
              />
            </label>
          </section>
        )}
      </div>
    </div>
  )
}
