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

const STORAGE_KEY = 'et_scout_auth'
const LEGACY_STORAGE_KEY = 'et_spirex_auth'

export const TEAM_USERS = ['Sunil', 'Tony', 'Ravi', 'Aneena', 'Shilaja', 'Palani'] as const

interface AuthState {
  username: string
  token: string
}

interface AuthContextValue {
  user: AuthState | null
  loading: boolean
  activeSessions: { username: string; login_at: number; last_seen: number }[]
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshSessions: () => Promise<void>
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
      const stored = loadStored()
      if (!stored) {
        setAuthToken(null)
        if (!cancelled) setLoading(false)
        return
      }
      setAuthToken(stored.token)
      try {
        const me = await api.getMe()
        if (!cancelled) setUser({ token: stored.token, username: me.username })
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
    const state = { token: result.token, username: result.username }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    setAuthToken(result.token)
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
    () => ({ user, loading, activeSessions, login, logout, refreshSessions }),
    [user, loading, activeSessions, login, logout, refreshSessions],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
