import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Briefcase,
  ClipboardList,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Save,
  Search,
  UserCircle2,
  Users,
  X,
} from 'lucide-react'
import { api, type LoadLevel, type StaffMember, type StaffProfile, type TeamDirectory } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { avatarColors, avatarInitials } from '../components/mywork/emailPanelUtils'
import { ErrorState, LoadingState } from '../components/States'
import { TASK_CATEGORY_LABELS } from '../lib/workflowAccess'

const LOAD_STYLES: Record<LoadLevel, { pill: string; bar: string }> = {
  light: { pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200', bar: 'bg-emerald-500' },
  balanced: { pill: 'bg-sky-50 text-sky-800 ring-sky-200', bar: 'bg-sky-500' },
  busy: { pill: 'bg-amber-50 text-amber-900 ring-amber-200', bar: 'bg-amber-500' },
  overloaded: { pill: 'bg-rose-50 text-rose-800 ring-rose-200', bar: 'bg-rose-500' },
}

function LoadBadge({ level, label }: { level: LoadLevel; label: string }) {
  const style = LOAD_STYLES[level]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${style.pill}`}>
      {level === 'overloaded' && <AlertTriangle size={11} />}
      {label}
    </span>
  )
}

function StaffAvatar({ name, email, size = 'md' }: { name: string; email: string; size?: 'sm' | 'md' | 'lg' }) {
  const colors = avatarColors(name, email)
  const dim = size === 'sm' ? 'h-9 w-9 text-xs' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-11 w-11 text-sm'
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dim}`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {avatarInitials(name, email)}
    </span>
  )
}

function SummaryCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function emptyDraft(profile: StaffProfile): StaffProfile {
  return { ...profile }
}

export function TeamPage() {
  const { user, isAdmin } = useAuth()
  const canEdit = isAdmin || user?.role === 'manager'
  const [directory, setDirectory] = useState<TeamDirectory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<StaffMember | null>(null)
  const [draft, setDraft] = useState<StaffProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveBanner, setSaveBanner] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDirectory(await api.getTeamDirectory())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team directory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const members = directory?.members ?? []
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((member) => {
      const p = member.profile
      const haystack = `${p.full_name} ${p.username} ${p.email} ${p.phone} ${p.job_title} ${p.department} ${p.employee_id}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [directory, search])

  function openMember(member: StaffMember) {
    setSelected(member)
    setDraft(emptyDraft(member.profile))
    setSaveBanner(null)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!selected || !draft || !canEdit) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateTeamStaffMember(selected.profile.username, {
        full_name: draft.full_name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        job_title: draft.job_title.trim(),
        department: draft.department.trim(),
        location: draft.location.trim(),
        employee_id: draft.employee_id.trim(),
        manager: draft.manager?.trim() || null,
        start_date: draft.start_date?.trim() || null,
        notes: draft.notes.trim(),
        status: draft.status,
      })
      setSelected(updated)
      setDraft(emptyDraft(updated.profile))
      setSaveBanner(`Saved ${updated.profile.full_name || updated.profile.username}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState message="Loading team directory…" />

  const summary = directory?.summary ?? {}

  return (
    <div className="et-page et-page-wide space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--et-teal)]">HR · Team</p>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Team directory</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Employee contact details, Scout IDs, and live workload from open tasks and PM ownership.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="et-btn-secondary">
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {saveBanner && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {saveBanner}
          <button type="button" className="ml-3 underline" onClick={() => setSaveBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      {error && <ErrorState message={error} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Headcount" value={summary.headcount ?? 0} hint="Active ET Scout users" />
        <SummaryCard label="Open tasks" value={summary.total_open_tasks ?? 0} hint="Assigned across team" />
        <SummaryCard label="Overloaded" value={summary.overloaded ?? 0} hint="Needs rebalancing" />
        <SummaryCard label="Busy" value={summary.busy ?? 0} hint="High task volume" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, role, employee ID…"
            className="et-input w-full py-2.5 pl-9"
          />
        </label>
        <p className="text-xs text-slate-500">{filtered.length} team member{filtered.length === 1 ? '' : 's'}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[var(--et-navy)]" />
              <h2 className="text-sm font-semibold text-slate-900">All employees</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Employee</th>
                  <th className="px-4 py-2.5 font-semibold">Scout ID</th>
                  <th className="px-4 py-2.5 font-semibold">Email</th>
                  <th className="px-4 py-2.5 font-semibold">Phone</th>
                  <th className="px-4 py-2.5 font-semibold">Load</th>
                  <th className="px-4 py-2.5 font-semibold">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => {
                  const p = member.profile
                  const active = selected?.profile.username === p.username
                  return (
                    <tr
                      key={p.username}
                      className={`cursor-pointer border-b border-slate-50 transition hover:bg-slate-50/80 ${active ? 'bg-[var(--et-yellow-light)]/50' : ''}`}
                      onClick={() => openMember(member)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <StaffAvatar name={p.full_name || p.username} email={p.email} size="sm" />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{p.full_name || p.username}</p>
                            <p className="truncate text-xs text-slate-500">{p.job_title || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{member.scout_id}</td>
                      <td className="px-4 py-3">
                        {p.email ? (
                          <a
                            href={`mailto:${p.email}`}
                            className="text-xs text-[var(--et-info-blue)] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {p.email}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.phone ? (
                          <a
                            href={`tel:${p.phone.replace(/\s/g, '')}`}
                            className="text-xs text-slate-700 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {p.phone}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <LoadBadge level={member.workload.load_level} label={member.workload.load_label} />
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-700">
                        {member.workload.open_tasks}
                        {member.workload.high_priority > 0 && (
                          <span className="ml-1 text-rose-600">({member.workload.high_priority} high)</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!selected || !draft ? (
            <div className="flex min-h-[20rem] flex-col items-center justify-center gap-3 p-8 text-center">
              <UserCircle2 size={40} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-700">Select a team member</p>
              <p className="text-xs text-slate-500">View personal details, contact info, and open work.</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <StaffAvatar name={draft.full_name || draft.username} email={draft.email} size="lg" />
                    <div>
                      <h3 className="font-display text-lg font-semibold text-slate-900">
                        {draft.full_name || draft.username}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Scout ID: <span className="font-mono">{selected.scout_id}</span> · {selected.role}
                      </p>
                      <div className="mt-2">
                        <LoadBadge level={selected.workload.load_level} label={selected.workload.load_label} />
                      </div>
                    </div>
                  </div>
                  <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => setSelected(null)}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="max-h-[28rem] space-y-3 overflow-y-auto px-5 py-4 et-scroll">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Full name</span>
                  <input
                    className="et-input w-full"
                    value={draft.full_name}
                    onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                    disabled={!canEdit}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
                    <Mail size={12} /> Email
                  </span>
                  <input
                    type="email"
                    className="et-input w-full"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    disabled={!canEdit}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
                    <Phone size={12} /> Phone
                  </span>
                  <input
                    type="tel"
                    className="et-input w-full"
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    placeholder="+91 …"
                    disabled={!canEdit}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Job title</span>
                    <input
                      className="et-input w-full"
                      value={draft.job_title}
                      onChange={(e) => setDraft({ ...draft, job_title: e.target.value })}
                      disabled={!canEdit}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Employee ID</span>
                    <input
                      className="et-input w-full font-mono text-xs"
                      value={draft.employee_id}
                      onChange={(e) => setDraft({ ...draft, employee_id: e.target.value })}
                      disabled={!canEdit}
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Department</span>
                    <input
                      className="et-input w-full"
                      value={draft.department}
                      onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                      disabled={!canEdit}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Location</span>
                    <input
                      className="et-input w-full"
                      value={draft.location}
                      onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                      disabled={!canEdit}
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Notes</span>
                  <textarea
                    className="et-input w-full"
                    rows={2}
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    disabled={!canEdit}
                  />
                </label>

                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workload</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Open tasks</span>
                      <p className="font-semibold text-slate-900">{selected.workload.open_tasks}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">High priority</span>
                      <p className="font-semibold text-slate-900">{selected.workload.high_priority}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Project tasks</span>
                      <p className="font-semibold text-slate-900">{selected.workload.project_tasks}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">PM projects owned</span>
                      <p className="font-semibold text-slate-900">{selected.workload.pm_projects_owned}</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${LOAD_STYLES[selected.workload.load_level].bar}`}
                      style={{ width: `${Math.min(100, (selected.workload.open_tasks / 12) * 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <ClipboardList size={14} className="text-[var(--et-navy)]" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Things to do</p>
                  </div>
                  {selected.open_tasks_preview.length === 0 ? (
                    <p className="text-xs text-slate-500">No open tasks assigned.</p>
                  ) : (
                    <ul className="space-y-2">
                      {selected.open_tasks_preview.map((task) => (
                        <li key={task.task_id} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                          {task.survey_id ? (
                            <Link
                              to={`/projects/${task.survey_id}?mode=workflow`}
                              className="text-sm font-medium text-[var(--et-navy)] hover:underline"
                            >
                              {task.title}
                            </Link>
                          ) : (
                            <Link to="/my-work" className="text-sm font-medium text-[var(--et-navy)] hover:underline">
                              {task.title}
                            </Link>
                          )}
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {task.survey_title}
                            {' · '}
                            {TASK_CATEGORY_LABELS[task.category]}
                            {task.priority === 'high' ? ' · high priority' : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {selected.workload.pm_projects_owned > 0 && (
                    <Link
                      to="/operations?tab=pipeline"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--et-navy)] hover:underline"
                    >
                      <Briefcase size={12} />
                      {selected.workload.pm_projects_owned} PM project
                      {selected.workload.pm_projects_owned === 1 ? '' : 's'} owned
                    </Link>
                  )}
                </div>
              </div>

              {canEdit && (
                <div className="border-t border-slate-100 px-5 py-4">
                  <button type="submit" className="et-btn-primary w-full sm:w-auto" disabled={saving}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save employee details
                  </button>
                </div>
              )}
            </form>
          )}
        </aside>
      </div>
    </div>
  )
}
