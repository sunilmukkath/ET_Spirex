import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { FloatingAssistantChat } from './FloatingAssistantChat'
import { LoadingState } from './States'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)]">
        <LoadingState message="Checking sign-in…" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return (
    <>
      {children}
      <FloatingAssistantChat />
    </>
  )
}
