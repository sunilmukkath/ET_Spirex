import { useState } from 'react'
import { Loader2, Lock, User } from 'lucide-react'
import { TEAM_USERS, useAuth } from '../auth/AuthContext'

interface Props {
  onSuccess?: () => void
  compact?: boolean
}

export function SignInForm({ onSuccess, compact }: Props) {
  const { login } = useAuth()
  const [username, setUsername] = useState<string>(TEAM_USERS[0])
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-2xl border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-xl ${compact ? '' : 'sm:p-8'}`}
    >
      <div className="mb-6 flex items-center gap-3">
        <img
          src="/spirex-mark.png"
          alt=""
          aria-hidden
          className="h-10 w-10 shrink-0 object-contain"
        />
        <div>
          <h2 className="text-lg font-semibold text-white">Sign in to ET Scout</h2>
          <p className="text-xs text-white/60">Elastic Tree team access</p>
        </div>
      </div>

      <label className="mb-4 block text-sm">
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-white/70">
          <User size={14} /> Team member
        </span>
        <select
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-[var(--et-navy)]/80 px-4 py-3 text-sm text-white outline-none ring-[var(--et-teal)] focus:ring-2"
        >
          {TEAM_USERS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-4 block text-sm">
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-white/70">
          <Lock size={14} /> Password
        </span>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter team password"
            autoComplete="current-password"
            className="w-full rounded-xl border border-white/15 bg-[var(--et-navy)]/80 py-3 pl-10 pr-4 text-sm text-white outline-none ring-[var(--et-teal)] focus:ring-2"
          />
        </div>
      </label>

      {error && (
        <div className="mb-4 space-y-1 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
          <p>{error}</p>
          {error.includes('backend') || error.includes('server') || error.includes('Network') ? (
            <p className="text-xs text-red-200/80">
              Local dev: run backend on port 8000, then refresh this page.
            </p>
          ) : null}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !password}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--et-teal)] to-[var(--et-teal-dark)] py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--et-teal)]/25 transition hover:brightness-110 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
        Enter dashboard
      </button>
    </form>
  )
}
