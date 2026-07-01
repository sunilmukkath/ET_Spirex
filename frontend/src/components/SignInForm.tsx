import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api } from '../api/client'
import { ET_PRODUCT_NAME, ET_SIGNIN_TAGLINE } from '../lib/etCopy'

interface Props {
  onSuccess?: () => void
  compact?: boolean
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  token_exchange: 'Google sign-in could not be completed. Please try again.',
  not_authorized: 'This Google account is not authorized for ET Scout. Use your Elastic Tree email.',
  session_failed: 'Could not start your ET Scout session. Please try again.',
  access_denied: 'Google sign-in was cancelled.',
}

function readAuthErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  if (params.get('auth') !== 'error') return null
  const reason = params.get('reason') || 'unknown'
  return AUTH_ERROR_MESSAGES[reason] ?? `Google sign-in failed (${reason}).`
}

function clearAuthErrorFromUrl() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (params.get('auth') !== 'error') return
  const next = new URL(window.location.href)
  next.searchParams.delete('auth')
  next.searchParams.delete('reason')
  window.history.replaceState({}, '', `${next.pathname}${next.search}${next.hash}`)
}

export function SignInForm({ compact }: Props) {
  const [error, setError] = useState<string | null>(() => readAuthErrorFromUrl())
  const [googleConfigured, setGoogleConfigured] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  useEffect(() => {
    const authError = readAuthErrorFromUrl()
    if (authError) {
      setError(authError)
      clearAuthErrorFromUrl()
    }
    let cancelled = false
    api
      .getGoogleAuthConfigured()
      .then((res) => {
        if (!cancelled) setGoogleConfigured(res.configured)
      })
      .catch(() => {
        /* optional */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
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

      {googleConfigured ? (
        <button
          type="button"
          disabled={googleLoading}
          onClick={async () => {
            setError(null)
            setGoogleLoading(true)
            try {
              const { url } = await api.getGoogleAuthUrl()
              window.location.href = url
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Google sign-in unavailable')
              setGoogleLoading(false)
            }
          }}
          className="et-btn-primary w-full py-3 text-sm font-semibold"
        >
          {googleLoading ? <Loader2 className="animate-spin" size={18} /> : null}
          Sign in with Google
        </button>
      ) : (
        <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Google sign-in is not configured yet. Add the Google OAuth variables on the server.
        </div>
      )}

      <p className="mt-3 text-center text-[10px] text-white/45">
        Elastic Tree Google Workspace accounts only
      </p>
    </div>
  )
}
