import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

/**
 * Handles the redirect back from Google OAuth.
 *
 * Google appends `?code=...` (and optionally `?error=...`) to GOOGLE_REDIRECT_URI.
 * This page calls the backend `/api/auth/google/callback` endpoint, which exchanges
 * the code for a session token, then stores the session and redirects to the dashboard.
 */
export function GoogleCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const called = useRef(false)

  useEffect(() => {
    // Guard against React StrictMode double-invocation
    if (called.current) return
    called.current = true

    const code = searchParams.get('code')
    const oauthError = searchParams.get('error')

    if (oauthError) {
      setError(`Google sign-in was cancelled or denied: ${oauthError}`)
      return
    }

    if (!code) {
      setError('No authorisation code received from Google.')
      return
    }

    async function finish() {
      try {
        const res = await fetch(`/api/auth/google/callback?code=${encodeURIComponent(code!)}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const detail = (body as { detail?: string }).detail ?? `Error ${res.status}`
          throw new Error(detail)
        }
        const data = (await res.json()) as { token: string; username: string }
        await loginWithToken(data.token, data.username)
        navigate('/dashboard', { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google sign-in failed')
      }
    }

    finish()
  }, [searchParams, loginWithToken, navigate])

  return (
    <div className="et-canvas-dots flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/20 bg-white/[0.08] p-8 shadow-2xl backdrop-blur-xl ring-1 ring-white/10">
        {error ? (
          <>
            <p className="text-sm font-medium text-red-300">{error}</p>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="mt-2 text-xs text-white/60 underline hover:text-white"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
            <p className="text-sm font-medium text-white/70">Completing Google sign-in…</p>
          </>
        )}
      </div>
    </div>
  )
}
