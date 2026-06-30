import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  api,
  type GlobalRole,
  type ProjectMember,
  type ProjectModule,
  type ProjectTask,
  type ProjectWorkflow,
  type TaskCategory,
  type TaskStatus,
  type WorkflowAccess,
} from '../../api/client'
import { TEAM_USERS } from '../../auth/AuthContext'
import {
  PROJECT_MODULE_LABELS,
  TASK_CATEGORY_LABELS,
  TASK_STATUS_LABELS,
  canManageTeam,
} from '../../lib/workflowAccess'

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
  const [newMember, setNewMember] = useState('')
  const [draftTask, setDraftTask] = useState<ProjectTask | null>(null)

  const canEdit = canManageTeam(access)

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
    const tasks = workflow.tasks ?? []
    if (taskFilter === 'all') return tasks
    return tasks.filter((t) => t.category === taskFilter)
  }, [workflow.tasks, taskFilter])

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
    try {
      const data = await api.setProjectWorkflow(surveyId, next)
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

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--canvas-subtle)] p-4 sm:p-6 et-scroll">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-900">Project workflow</h2>
            <p className="mt-1 text-sm text-slate-500">
              Assign team members, module access, and track tasks across programming, field, research,
              finance, and client workstreams.
            </p>
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
