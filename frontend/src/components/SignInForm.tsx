import { useEffect, useState } from 'react'
import { Loader2, Lock, User } from 'lucide-react'
import { api } from '../api/client'
import { ET_PRODUCT_NAME, ET_SIGNIN_TAGLINE } from '../lib/etCopy'
import { TEAM_USERS, useAuth } from '../auth/AuthContext'

interface Props {
  onSuccess?: () => void
  compact?: boolean
}

export function SignInForm({ onSuccess, compact }: Props) {
  const { login } = useAuth()
  const [teamUsers, setTeamUsers] = useState<string[]>([...TEAM_USERS])
  const [username, setUsername] = useState<string>(TEAM_USERS[0])
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .getAuthUsers()
      .then((res) => {
        if (cancelled || !res.users?.length) return
        setTeamUsers(res.users)
        setUsername((current) => (res.users.includes(current) ? current : res.users[0]))
      })
      .catch(() => {
        /* keep local fallback list */
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  async function handleGoogleSignIn() {
    setError(null)
    setGoogleLoading(true)
    try {
      const { url } = await api.googleLogin()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in unavailable')
      setGoogleLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-2xl border border-white/20 bg-white/[0.08] p-6 shadow-2xl backdrop-blur-xl ring-1 ring-white/10 ${compact ? '' : 'sm:p-8'}`}
    >
      <div className="mb-6 flex items-center gap-3">
        <img
          src="/scout-mark.png"
          alt=""
          aria-hidden
          className="et-scout-mark-light h-10 w-10 shrink-0 object-contain"
        />
        <div>
          <h2 className="text-lg font-semibold text-white">
            Sign in to <span className="text-[var(--et-yellow-bright)]">{ET_PRODUCT_NAME}</span>
          </h2>
          <p className="text-xs text-white/60">{ET_SIGNIN_TAGLINE}</p>
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
          {teamUsers.map((u) => (
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
        className="et-btn-primary w-full py-3"
      >
        {submitting ? <Loader2 className="animate-spin" size={18} /> : null}
        Enter your projects
      </button>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/15" />
        <span className="text-xs text-white/40">or</span>
        <div className="h-px flex-1 bg-white/15" />
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] py-3 text-sm font-medium text-white transition hover:bg-white/[0.12] disabled:opacity-60"
      >
        {googleLoading ? (
          <Loader2 className="animate-spin" size={18} />
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        )}
        Sign in with Google
      </button>
    </form>
  )
}
