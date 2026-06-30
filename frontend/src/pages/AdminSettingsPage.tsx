import { useEffect, useState } from 'react'
import { Loader2, Save, Settings, Shield, Users, Wifi, WifiOff } from 'lucide-react'
import { api, type GlobalRole, type TeamRegistry } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { TEAM_USERS } from '../auth/AuthContext'

const ROLE_LABELS: Record<GlobalRole, string> = {
  admin: 'Admin — manage team roles & all projects',
  manager: 'Manager — assign teams on any project',
  member: 'Member — work on assigned projects only',
}

export function AdminSettingsPage() {
  const { user, isAdmin } = useAuth()
  const [connection, setConnection] = useState<Awaited<ReturnType<typeof api.getConnection>> | null>(null)
  const [sessions, setSessions] = useState<{ username: string; last_seen: number }[]>([])
  const [registry, setRegistry] = useState<TeamRegistry | null>(null)
  const [savingRoles, setSavingRoles] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getConnection(),
      fetch('/api/auth/sessions', { headers: { Authorization: `Bearer ${localStorage.getItem('et_scout_auth') ?? ''}` } })
        .then((r) => (r.ok ? r.json() : { sessions: [] }))
        .catch(() => ({ sessions: [] })),
      api.getTeamRegistry().catch(() => null),
    ])
      .then(([conn, sess, reg]) => {
        setConnection(conn)
        setSessions(sess.sessions ?? [])
        setRegistry(reg)
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
        <p className="mt-1 text-sm text-slate-500">Team workspace and connection status.</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Signed in</h2>
        <p className="mt-2 text-sm text-slate-600">
          {user?.username ?? '—'}
          {user?.role && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {user.role}
            </span>
          )}
        </p>
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
              <span className="text-sm font-medium text-slate-800">{name}</span>
              {isAdmin && registry ? (
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
            ? `Connected to ${connection.url ?? 'LimeSurvey'}`
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

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-medium">Deployment note</p>
        <p className="mt-1 text-xs leading-relaxed">
          Survey configs (QC, quotas, custom variables) are stored as JSON on the server. Auth sessions reset when the
          server restarts. For production rollout, move to environment-based credentials and persistent session storage.
        </p>
      </section>
    </div>
  )
}
