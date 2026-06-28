import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, activeSessions, refreshSessions } = useAuth()
  const [showSessions, setShowSessions] = useState(false)
  const isWorkspace = /^\/projects\/\d+/.test(location.pathname)

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  if (isWorkspace) {
    return <Outlet />
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <header className="sticky top-0 z-20 border-b border-[var(--et-teal)]/10 bg-white/80 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <Link to="/dashboard" className="group rounded-lg transition">
            <p className="font-display text-lg font-bold tracking-tight text-[var(--et-navy)] group-hover:text-[var(--et-teal-dark)]">
              ET <span className="text-[var(--et-teal)]">Spirex</span>
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--et-gold)]">
              Elastic Tree
            </p>
          </Link>

          <div className="relative flex items-center gap-3">
            {activeSessions.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    refreshSessions()
                    setShowSessions((v) => !v)
                  }}
                  className="hidden items-center gap-1.5 rounded-full bg-[var(--et-teal-light)] px-3 py-1.5 text-xs font-medium text-[var(--et-teal-dark)] ring-1 ring-[var(--et-teal)]/20 sm:flex"
                >
                  <Users size={14} />
                  {activeSessions.length} signed in
                </button>
                {showSessions && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-2 shadow-xl">
                    <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Active now
                    </p>
                    {activeSessions.map((s) => (
                      <div
                        key={`${s.username}-${s.login_at}`}
                        className="flex items-center justify-between px-3 py-1.5 text-sm"
                      >
                        <span className="font-medium text-slate-800">{s.username}</span>
                        <span className="text-xs text-slate-400">{formatTime(s.last_seen)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 rounded-full bg-[var(--et-navy)] px-3 py-1.5 text-sm text-white">
              <span className="hidden h-2 w-2 rounded-full bg-[var(--et-teal-light)] sm:inline" />
              <span className="font-medium">{user?.username}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-1 rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
