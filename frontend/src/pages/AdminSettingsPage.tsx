import { useEffect, useState } from 'react'
import { Loader2, Settings, Shield, Wifi, WifiOff } from 'lucide-react'
import { api, type ConnectionStatus } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function AdminSettingsPage() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [sessions, setSessions] = useState<{ username: string; last_seen: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getConnection(),
      fetch('/api/auth/sessions', { headers: { Authorization: `Bearer ${localStorage.getItem('et_scout_auth') ?? ''}` } })
        .then((r) => (r.ok ? r.json() : { sessions: [] }))
        .catch(() => ({ sessions: [] })),
    ])
      .then(([conn, sess]) => {
        setConnection(conn)
        setSessions(sess.sessions ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

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
        <p className="mt-2 text-sm text-slate-600">{user?.username ?? '—'}</p>
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
