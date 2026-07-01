import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileUp, Loader2, Mail, Save, Settings, Shield, Sparkles, SlidersHorizontal, Users, Wifi, WifiOff } from 'lucide-react'
import { api, type AiHealth, type AiStatus, type GlobalRole, type TeamRegistry } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { TEAM_USERS } from '../auth/AuthContext'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { AI_FEATURES } from '../lib/aiFeatures'
import { AiStatusBadge } from '../components/ai/AiAssistPanel'
import { ET_LIMESURVEY_LABEL, ET_SETTINGS_SUBTITLE } from '../lib/etCopy'

const ROLE_LABELS: Record<GlobalRole, string> = {
  admin: 'Admin — manage team roles & all projects',
  manager: 'Manager — assign teams on any project',
  member: 'Member — work on assigned projects only',
}

export function AdminSettingsPage() {
  const { user, isAdmin } = useAuth()
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

  function roleFor(username: string): GlobalRole {
    return registry?.users.find((u) => u.username === username)?.role ?? 'member'
  }

  function setRole(username: string, role: GlobalRole) {
    if (!registry) return
    const users = TEAM_USERS.map((name) => {
      const existing = registry.users.find((u) => u.username === name)
      const nextRole = name === username ? role : existing?.role ?? 'member'
      return { username: name, role: nextRole }
    })
    setRegistry({ users })
  }

  async function saveRoles() {
    if (!registry || !isAdmin) return
    setSavingRoles(true)
    setRoleError(null)
    try {
      const saved = await api.setTeamRegistry(registry)
      setRegistry(saved)
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Failed to save team roles')
    } finally {
      setSavingRoles(false)
    }
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
                <option value="clients">CRM & marketing</option>
                <option value="finance">Finance</option>
                <option value="programming">Programming</option>
                <option value="links">Survey links</option>
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

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[var(--et-teal)]" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Team roles</h2>
              <p className="mt-1 text-xs text-slate-500">
                Global access level for each team member. Project-specific assignments are set per study
                under Workflow.
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => void saveRoles()}
              disabled={savingRoles || !registry}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {savingRoles ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save roles
            </button>
          )}
        </div>
        {roleError && <p className="mt-3 text-sm text-rose-700">{roleError}</p>}
        {!isAdmin && (
          <p className="mt-3 text-sm text-amber-800">Only admins can change team roles.</p>
        )}
        <ul className="mt-4 space-y-3">
          {TEAM_USERS.map((name) => (
            <li
              key={name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
            >
              <span className="text-sm font-medium text-slate-800">
                {name}
                {name === 'Sunil' && (
                  <span className="ml-2 text-[10px] font-normal text-[var(--et-teal)]">Owner</span>
                )}
              </span>
              {name === 'Sunil' ? (
                <span className="text-xs font-medium text-[var(--et-navy)]">Super admin (locked)</span>
              ) : isAdmin && registry ? (
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
                <span className="text-xs text-slate-500">{roleFor(name)}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] text-slate-400">
          {ROLE_LABELS.admin} · {ROLE_LABELS.manager} · {ROLE_LABELS.member}
        </p>
      </section>

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
