import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, setAuthToken } from '../api/client'

import type { GlobalRole } from '../api/client'

const STORAGE_KEY = 'et_scout_auth'
const LEGACY_STORAGE_KEY = 'et_spirex_auth'

export const TEAM_USERS = ['Sunil', 'Tony', 'Ravi', 'Aneena', 'Shilaja', 'Palani', 'Bagya'] as const

interface AuthState {
  username: string
  token: string
  role?: GlobalRole
  email?: string | null
  is_super_admin?: boolean
}

interface AuthContextValue {
  user: AuthState | null
  loading: boolean
  activeSessions: { username: string; login_at: number; last_seen: number }[]
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshSessions: () => Promise<void>
  isAdmin: boolean
  isSuperAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadStored(): AuthState | null {
  try {
    let raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw)
        localStorage.removeItem(LEGACY_STORAGE_KEY)
      }
    }
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthState
    if (parsed?.token && parsed?.username) return parsed
  } catch {
    /* ignore */
  }
  return null
}

function parseGoogleOAuthCallback(): { token: string; username: string } | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  if (params.get('auth') !== 'google' || !token) return null
  return { token, username: params.get('username') ?? '' }
}

function clearOAuthQueryParams() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (!params.has('auth') && !params.has('token')) return
  const next = new URL(window.location.href)
  next.searchParams.delete('auth')
  next.searchParams.delete('token')
  next.searchParams.delete('username')
  next.searchParams.delete('reason')
  window.history.replaceState({}, '', `${next.pathname}${next.search}${next.hash}`)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState | null>(() => loadStored())
  const [loading, setLoading] = useState(true)
  const [activeSessions, setActiveSessions] = useState<
    { username: string; login_at: number; last_seen: number }[]
  >([])

  const refreshSessions = useCallback(async () => {
    if (!user) {
      setActiveSessions([])
      return
    }
    try {
      const { sessions } = await api.getActiveSessions()
      setActiveSessions(sessions)
    } catch {
      setActiveSessions([])
    }
  }, [user])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const oauth = parseGoogleOAuthCallback()
      if (oauth) {
        setAuthToken(oauth.token)
        try {
          const me = await api.getMe()
          if (!cancelled) {
            const state = {
              token: oauth.token,
              username: me.username || oauth.username,
              role: me.role,
              email: me.email,
              is_super_admin: me.is_super_admin,
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
            setUser(state)
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY)
          setAuthToken(null)
          if (!cancelled) setUser(null)
        } finally {
          clearOAuthQueryParams()
          if (!cancelled) setLoading(false)
        }
        return
      }

      const stored = loadStored()
      if (!stored) {
        setAuthToken(null)
        if (!cancelled) setLoading(false)
        return
      }
      setAuthToken(stored.token)
      try {
        const me = await api.getMe()
        if (!cancelled) {
          setUser({
            token: stored.token,
            username: me.username,
            role: me.role,
            email: me.email,
            is_super_admin: me.is_super_admin,
          })
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
        setAuthToken(null)
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (user) refreshSessions()
  }, [user, refreshSessions])

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password)
    setAuthToken(result.token)
    const me = await api.getMe()
    const state = {
      token: result.token,
      username: result.username,
      role: me.role,
      email: me.email,
      is_super_admin: me.is_super_admin,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    setUser(state)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    localStorage.removeItem(STORAGE_KEY)
    setAuthToken(null)
    setUser(null)
    setActiveSessions([])
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      activeSessions,
      login,
      logout,
      refreshSessions,
      isAdmin: user?.role === 'admin' || user?.is_super_admin === true,
      isSuperAdmin: user?.is_super_admin === true,
    }),
    [user, loading, activeSessions, login, logout, refreshSessions],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
