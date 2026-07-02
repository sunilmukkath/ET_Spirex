import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileUp, Loader2, Mail, Plus, Save, Settings, Shield, Sparkles, SlidersHorizontal, Trash2, Wifi, WifiOff } from 'lucide-react'
import { api, type AiHealth, type AiStatus, type AppModule, type GlobalRole, type TeamRegistry } from '../api/client'
import { TEAM_USERS, useAuth } from '../auth/AuthContext'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { AI_FEATURES } from '../lib/aiFeatures'
import {
  APP_MODULES,
  APP_MODULE_HINTS,
  APP_MODULE_LABELS,
  defaultModulesForRole,
  resolveUserModules,
} from '../lib/appModules'
import { AiStatusBadge } from '../components/ai/AiAssistPanel'
import { ET_LIMESURVEY_LABEL, ET_SETTINGS_SUBTITLE } from '../lib/etCopy'

const ROLE_LABELS: Record<GlobalRole, string> = {
  admin: 'Admin — manage team roles & all projects',
  manager: 'Manager — assign teams on any project',
  member: 'Member — work on assigned projects only',
}

export function AdminSettingsPage() {
  const { user, isAdmin, isSuperAdmin, refreshProfile, teamUsers, refreshTeamUsers } = useAuth()
  const { prefs, loading: prefsLoading, saving: prefsSaving, savePrefs } = useUserPreferences(user?.username)
  const [connection, setConnection] = useState<Awaited<ReturnType<typeof api.getConnection>> | null>(null)
  const [sessions, setSessions] = useState<{ username: string; last_seen: number }[]>([])
  const [registry, setRegistry] = useState<TeamRegistry | null>(null)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null)
  const [gmailStatus, setGmailStatus] = useState<Awaited<ReturnType<typeof api.getGmailStatus>> | null>(null)
  const [gmailConnecting, setGmailConnecting] = useState(false)
  const [savingRoles, setSavingRoles] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [templateInfo, setTemplateInfo] = useState<{ path: string; exists: boolean; size_bytes: number } | null>(null)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const templateInputRef = useRef<HTMLInputElement>(null)
  const [newUsername, setNewUsername] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newJobTitle, setNewJobTitle] = useState('')
  const [newUserRole, setNewUserRole] = useState<GlobalRole>('member')
  const [addingUser, setAddingUser] = useState(false)
  const [addUserError, setAddUserError] = useState<string | null>(null)
  const [removingUser, setRemovingUser] = useState<string | null>(null)

  const rosterNames = useMemo(() => {
    const fromRegistry = registry?.users?.map((u) => u.username) ?? []
    const merged = new Set([...teamUsers, ...fromRegistry])
    return [...merged].sort((a, b) => a.localeCompare(b))
  }, [registry, teamUsers])

  useEffect(() => {
    Promise.all([
      api.getConnection(),
      fetch('/api/auth/sessions', { headers: { Authorization: `Bearer ${localStorage.getItem('et_scout_auth') ?? ''}` } })
        .then((r) => (r.ok ? r.json() : { sessions: [] }))
        .catch(() => ({ sessions: [] })),
      api.getTeamRegistry().catch(() => null),
      api.getAiStatus().catch(() => null),
      api.getAiHealth().catch(() => null),
      api.getGmailStatus().catch(() => null),
      api.getReportTemplateInfo().catch(() => null),
    ])
      .then(([conn, sess, reg, ai, aiLive, gmail, template]) => {
        setConnection(conn)
        setSessions(sess.sessions ?? [])
        setRegistry(reg)
        setAiStatus(ai)
        setAiHealth(aiLive)
        setGmailStatus(gmail)
        setTemplateInfo(template)
      })
      .finally(() => setLoading(false))
  }, [])

  function primarySuperAdmin(): string {
    return registry?.primary_super_admin ?? 'Sunil'
  }

  function isUserSuperAdmin(username: string): boolean {
    const primary = primarySuperAdmin()
    if (username === primary) return true
    return (registry?.super_admins ?? []).includes(username)
  }

  function roleFor(username: string): GlobalRole {
    return registry?.users.find((u) => u.username === username)?.role ?? 'member'
  }

  function setRole(username: string, role: GlobalRole) {
    if (!registry) return
    const users = rosterNames.map((name) => {
      const existing = registry.users.find((u) => u.username === name)
      const nextRole = name === username ? role : existing?.role ?? 'member'
      return { username: name, role: nextRole, modules: existing?.modules ?? [] }
    })
    setRegistry({ ...registry, users })
  }

  function effectiveModules(username: string): AppModule[] {
    const entry = registry?.users.find((u) => u.username === username)
    return resolveUserModules(entry?.modules, entry?.role ?? roleFor(username))
  }

  function toggleModule(username: string, module: AppModule) {
    if (!registry || isUserSuperAdmin(username)) return
    const current = effectiveModules(username)
    const next = current.includes(module) ? current.filter((m) => m !== module) : [...current, module]
    const users = rosterNames.map((name) => {
      const existing = registry.users.find((u) => u.username === name)
      if (name === username) {
        return { username: name, role: existing?.role ?? 'member', modules: next }
      }
      return {
        username: name,
        role: existing?.role ?? 'member',
        modules: existing?.modules ?? [],
      }
    })
    setRegistry({ ...registry, users })
  }

  function resetModulesToRoleDefaults(username: string) {
    if (!registry || isUserSuperAdmin(username)) return
    const role = roleFor(username)
    const users = rosterNames.map((name) => {
      const existing = registry.users.find((u) => u.username === name)
      if (name === username) {
        return { username: name, role, modules: [] }
      }
      return {
        username: name,
        role: existing?.role ?? 'member',
        modules: existing?.modules ?? [],
      }
    })
    setRegistry({ ...registry, users })
  }

  function toggleSuperAdmin(username: string) {
    if (!registry || username === primarySuperAdmin()) return
    const primary = primarySuperAdmin()
    const current = new Set((registry.super_admins ?? []).filter((n) => n !== primary))
    if (current.has(username)) current.delete(username)
    else current.add(username)
    setRegistry({ ...registry, super_admins: [primary, ...current] })
  }

  async function saveRoles() {
    if (!registry || !isSuperAdmin) return
    setSavingRoles(true)
    setRoleError(null)
    try {
      const saved = await api.setTeamRegistry(registry)
      setRegistry(saved)
      await refreshProfile()
      await refreshTeamUsers()
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Failed to save team roles')
    } finally {
      setSavingRoles(false)
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    if (!isSuperAdmin) return
    setAddingUser(true)
    setAddUserError(null)
    try {
      const result = await api.createTeamUser({
        username: newUsername.trim(),
        full_name: newFullName.trim() || undefined,
        email: newEmail.trim() || undefined,
        job_title: newJobTitle.trim() || undefined,
        role: newUserRole,
      })
      setRegistry(result.registry)
      await refreshTeamUsers()
      setNewUsername('')
      setNewFullName('')
      setNewEmail('')
      setNewJobTitle('')
      setNewUserRole('member')
    } catch (err) {
      setAddUserError(err instanceof Error ? err.message : 'Failed to add team member')
    } finally {
      setAddingUser(false)
    }
  }

  async function handleRemoveUser(username: string) {
    if (!isSuperAdmin || !window.confirm(`Remove ${username} from ET Scout? They will no longer be able to sign in.`)) {
      return
    }
    setRemovingUser(username)
    setAddUserError(null)
    try {
      const result = await api.removeTeamUser(username)
      setRegistry(result.registry)
      await refreshTeamUsers()
    } catch (err) {
      setAddUserError(err instanceof Error ? err.message : 'Failed to remove team member')
    } finally {
      setRemovingUser(null)
    }
  }

  function isRemovableUser(username: string): boolean {
    return !TEAM_USERS.includes(username as (typeof TEAM_USERS)[number]) && username !== primarySuperAdmin()
  }

  async function handleTemplateUpload(file: File) {
    if (!isAdmin) return
    setUploadingTemplate(true)
    setTemplateError(null)
    try {
      const info = await api.uploadReportTemplate(file)
      setTemplateInfo(info)
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingTemplate(false)
    }
  }

  function formatBytes(n: number) {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={28} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <div className="flex items-center gap-2">
          <Settings size={22} className="text-[var(--et-teal)]" />
          <h1 className="font-display text-2xl font-semibold text-slate-900">Settings</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">{ET_SETTINGS_SUBTITLE}</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Signed in</h2>
        <p className="mt-2 text-sm text-slate-600">
          {user?.username ?? '—'}
          {user?.role && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {user.is_super_admin ? 'Owner / Super admin' : user.role}
            </span>
          )}
        </p>
        {user?.email && (
          <p className="mt-1 text-xs text-slate-500">Workspace: {user.email}</p>
        )}
        {user?.modules && user.modules.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Your modules: {user.modules.map((m) => APP_MODULE_LABELS[m]).join(', ')}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-[var(--et-teal)]" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">My preferences</h2>
              <p className="mt-1 text-xs text-slate-500">
                Saved to your account on the server — follows you across browsers and devices.
              </p>
            </div>
          </div>
          {prefsSaving && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Loader2 size={12} className="animate-spin" />
              Saving…
            </span>
          )}
        </div>
        {prefsLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading preferences…</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Projects dashboard layout</span>
              <select
                className="et-select w-full"
                value={prefs.dashboard_view_mode}
                onChange={(e) =>
                  void savePrefs({ dashboard_view_mode: e.target.value as 'strips' | 'table' })
                }
              >
                <option value="strips">Card strips</option>
                <option value="table">Table</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Default project sort</span>
              <select
                className="et-select w-full"
                value={prefs.dashboard_sort_key}
                onChange={(e) => void savePrefs({ dashboard_sort_key: e.target.value })}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A–Z</option>
                <option value="responses">Most responses</option>
                <option value="expiring">Expiring soon</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Default analysis base</span>
              <select
                className="et-select w-full"
                value={prefs.default_completion_status}
                onChange={(e) =>
                  void savePrefs({
                    default_completion_status: e.target.value as 'complete' | 'partial' | 'all',
                  })
                }
              >
                <option value="complete">Complete only</option>
                <option value="partial">Include partial</option>
                <option value="all">All responses</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Default report export</span>
              <select
                className="et-select w-full"
                value={prefs.default_report_format}
                onChange={(e) =>
                  void savePrefs({ default_report_format: e.target.value as 'pptx' | 'pdf' })
                }
              >
                <option value="pptx">PowerPoint</option>
                <option value="pdf">PDF</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Operations hub default tab</span>
              <select
                className="et-select w-full"
                value={prefs.operations_default_tab}
                onChange={(e) => void savePrefs({ operations_default_tab: e.target.value })}
              >
                <option value="pipeline">Pipeline</option>
                <option value="finance">Finance</option>
              </select>
            </label>
            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={prefs.ai_narrative_default}
                  onChange={(e) => void savePrefs({ ai_narrative_default: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--et-teal)]"
                />
                Enable AI narrative by default in report builder
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={prefs.crosstab_heatmap_default}
                  onChange={(e) => void savePrefs({ crosstab_heatmap_default: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--et-teal)]"
                />
                Show crosstab heatmaps by default
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={prefs.pinned_only_default}
                  onChange={(e) => void savePrefs({ pinned_only_default: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--et-teal)]"
                />
                Open projects dashboard filtered to pinned studies
              </label>
            </div>
          </div>
        )}
      </section>

      {isSuperAdmin && (
        <section className="rounded-xl border border-[var(--et-navy)]/20 bg-white p-5 shadow-sm ring-1 ring-[var(--et-navy)]/10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-[var(--et-navy)]" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Team access control</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Super admin only — add employees, set global roles, grant super admin, and control which app modules each user can open.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void saveRoles()}
              disabled={savingRoles || !registry}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {savingRoles ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save changes
            </button>
          </div>
          {roleError && <p className="mt-3 text-sm text-rose-700">{roleError}</p>}
          {addUserError && <p className="mt-3 text-sm text-rose-700">{addUserError}</p>}

          <form
            onSubmit={(e) => void handleAddUser(e)}
            className="mt-4 grid gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-2 lg:grid-cols-6"
          >
            <label className="text-xs">
              <span className="mb-1 block font-medium text-slate-600">Username</span>
              <input
                className="et-input w-full"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. Jordan"
                required
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-slate-600">Full name</span>
              <input
                className="et-input w-full"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Display name"
              />
            </label>
            <label className="text-xs sm:col-span-2">
              <span className="mb-1 block font-medium text-slate-600">Google / work email</span>
              <input
                className="et-input w-full"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="name@elastictree.com"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-slate-600">Job title</span>
              <input
                className="et-input w-full"
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                placeholder="Research Analyst"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium text-slate-600">Role</span>
              <select
                className="et-select w-full"
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as GlobalRole)}
              >
                {(Object.keys(ROLE_LABELS) as GlobalRole[]).map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end sm:col-span-2 lg:col-span-6">
              <button
                type="submit"
                disabled={addingUser || !newUsername.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-navy)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {addingUser ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add team member
              </button>
            </div>
          </form>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-semibold">User</th>
                  <th className="px-2 py-2 font-semibold">Role</th>
                  <th className="px-2 py-2 font-semibold" title="Super admins can manage team access and have all modules">
                    Super admin
                  </th>
                  {APP_MODULES.map((mod) => (
                    <th key={mod} className="px-2 py-2 font-semibold" title={APP_MODULE_HINTS[mod]}>
                      {APP_MODULE_LABELS[mod]}
                    </th>
                  ))}
                  <th className="py-2 pl-2 font-semibold">Reset</th>
                  <th className="py-2 pl-2 font-semibold">Remove</th>
                </tr>
              </thead>
              <tbody>
                {rosterNames.map((name) => {
                  const modules = effectiveModules(name)
                  const locked = isUserSuperAdmin(name)
                  const isPrimary = name === primarySuperAdmin()
                  return (
                    <tr key={name} className="border-b border-slate-50">
                      <td className="py-2.5 pr-4 font-medium text-slate-800">
                        {name}
                        {isPrimary && (
                          <span className="ml-1 text-[10px] font-normal text-[var(--et-teal)]">Owner</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {isPrimary ? (
                          <span className="text-slate-500">admin</span>
                        ) : registry ? (
                          <select
                            value={roleFor(name)}
                            onChange={(e) => setRole(name, e.target.value as GlobalRole)}
                            className="et-select text-xs"
                          >
                            {(Object.keys(ROLE_LABELS) as GlobalRole[]).map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-500">{roleFor(name)}</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={locked}
                          disabled={isPrimary || !registry}
                          onChange={() => toggleSuperAdmin(name)}
                          className="h-4 w-4 rounded border-slate-300 text-[var(--et-navy)]"
                          aria-label={`${name} — super admin`}
                          title={isPrimary ? 'Primary owner — cannot be revoked' : 'Grant super admin access'}
                        />
                      </td>
                      {APP_MODULES.map((mod) => (
                        <td key={mod} className="px-2 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={modules.includes(mod)}
                            disabled={locked || !registry}
                            onChange={() => toggleModule(name, mod)}
                            className="h-4 w-4 rounded border-slate-300 text-[var(--et-teal)]"
                            aria-label={`${name} — ${APP_MODULE_LABELS[mod]}`}
                          />
                        </td>
                      ))}
                      <td className="py-2.5 pl-2">
                        {!locked && registry && (
                          <button
                            type="button"
                            onClick={() => resetModulesToRoleDefaults(name)}
                            className="text-[10px] font-medium text-[var(--et-teal-dark)] hover:underline"
                          >
                            Role defaults
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 pl-2">
                        {isRemovableUser(name) && (
                          <button
                            type="button"
                            disabled={removingUser === name}
                            onClick={() => void handleRemoveUser(name)}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600 hover:underline disabled:opacity-50"
                          >
                            {removingUser === name ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] text-slate-400">
            {ROLE_LABELS.admin} · {ROLE_LABELS.manager} · {ROLE_LABELS.member}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            Member default: {defaultModulesForRole('member').map((m) => APP_MODULE_LABELS[m]).join(', ')} · Manager
            default: {defaultModulesForRole('manager').map((m) => APP_MODULE_LABELS[m]).join(', ')}
          </p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-[var(--et-teal)]" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Gmail Workspace</h2>
              <p className="mt-1 text-xs text-slate-500">
                Connect your Elastic Tree Google account to sync inbox and create project tasks from email.
              </p>
            </div>
          </div>
          {gmailStatus?.connected ? (
            <button
              type="button"
              onClick={() => void api.disconnectGmail().then(() => api.getGmailStatus().then(setGmailStatus))}
              className="et-btn-secondary text-xs"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              disabled={gmailConnecting || gmailStatus?.configured === false}
              onClick={async () => {
                setGmailConnecting(true)
                try {
                  const { url } = await api.getGmailOAuthUrl()
                  window.location.href = url
                } finally {
                  setGmailConnecting(false)
                }
              }}
              className="et-btn-primary text-xs"
            >
              {gmailConnecting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Connect Gmail
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {gmailStatus?.connected
            ? `Connected as ${gmailStatus.email ?? 'your account'}`
            : gmailStatus?.message ?? 'Not connected'}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          <Link to="/my-work" className="font-medium text-[var(--et-teal)] hover:underline">
            Open My work
          </Link>{' '}
          to triage inbox and assign tasks.
        </p>
      </section>

      <section className="et-ai-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--et-yellow)]" />
            <h2 className="text-sm font-semibold text-[var(--et-navy)]">AI features in ET Scout</h2>
            <AiStatusBadge status={aiStatus} />
          </div>
          <p className="text-xs text-[var(--muted)]">
            {aiStatus?.configured
              ? `${aiStatus.provider} · ${aiStatus.model}`
              : 'Set ANTHROPIC_API_KEY on Railway for Claude'}
          </p>
        </div>
        {aiStatus?.configured && (
          <p
            className={`mt-2 rounded-lg px-3 py-2 text-xs ${
              aiHealth?.ok
                ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                : 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
            }`}
          >
            {aiHealth?.ok
              ? 'Live connection verified — Copilot and AI features should work.'
              : aiHealth?.error ??
                'Could not verify AI connection. Check Railway variables and redeploy.'}
          </p>
        )}
        {!aiStatus?.configured && (
          <div className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--muted)]">
            <p>
              <span className="font-medium text-[var(--ink)]">Claude (recommended):</span> create an API key at{' '}
              <span className="font-mono">console.anthropic.com</span> and set{' '}
              <span className="font-mono">ANTHROPIC_API_KEY</span> on the server.
            </p>
          </div>
        )}
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {AI_FEATURES.map((feature) => (
            <li
              key={feature.id}
              className="rounded-lg border border-[var(--border-subtle)] bg-white/90 px-3 py-2.5"
            >
              <div className="text-sm font-medium text-[var(--ink)]">{feature.title}</div>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{feature.description}</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--et-navy)]">
                {feature.where}
              </p>
              {feature.href && (
                <Link to={feature.href} className="mt-1 inline-block text-xs text-[var(--et-navy)] hover:underline">
                  Open →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <FileUp size={18} className="text-[var(--et-navy)]" />
            <h2 className="text-sm font-semibold text-slate-900">PowerPoint report template</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Upload your Elastic Tree branded <span className="font-mono">.pptx</span> template for report exports.
            Layouts: title (0), content (1), section (2), blank (6).
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {templateInfo?.exists
              ? `Current template: ${formatBytes(templateInfo.size_bytes)} on server`
              : 'No custom template — using bundled default'}
          </p>
          <input
            ref={templateInputRef}
            type="file"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleTemplateUpload(file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={uploadingTemplate}
            onClick={() => templateInputRef.current?.click()}
            className="et-btn-accent mt-3 inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
          >
            {uploadingTemplate ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
            Upload .pptx template
          </button>
          {templateError && <p className="mt-2 text-xs text-rose-600">{templateError}</p>}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          {connection?.connected ? (
            <Wifi size={18} className="text-emerald-600" />
          ) : (
            <WifiOff size={18} className="text-rose-600" />
          )}
          <h2 className="text-sm font-semibold text-slate-900">LimeSurvey connection</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {connection?.connected
            ? `Connected to ${connection.url ?? ET_LIMESURVEY_LABEL}`
            : connection?.message ?? 'Not connected'}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Active sessions</h2>
        </div>
        <p className="mt-1 text-xs text-slate-500">In-memory team sessions on this server instance.</p>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {sessions.length === 0 ? (
            <li className="text-slate-400">No active sessions</li>
          ) : (
            sessions.map((s) => (
              <li key={`${s.username}-${s.last_seen}`} className="flex justify-between gap-2">
                <span>{s.username}</span>
                <span className="text-xs text-slate-400">
                  {new Date(s.last_seen * 1000).toLocaleString()}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      {isAdmin && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-medium">Deployment note (admins)</p>
          <p className="mt-1 text-xs leading-relaxed">
            Survey configs (QC, quotas, custom variables) are stored as JSON on the server. Auth sessions reset when the
            server restarts. For production rollout, move to environment-based credentials and persistent session storage.
          </p>
        </section>
      )}
    </div>
  )
}
