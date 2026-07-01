import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { firstAccessiblePath, type AppModule } from '../lib/appModules'
import { LoadingState } from './States'

export function ModuleGate({ module, children }: { module: AppModule; children: ReactNode }) {
  const { user, loading, canAccessModule } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingState message="Checking access…" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  if (!canAccessModule(module)) {
    return <Navigate to={firstAccessiblePath(user.modules)} replace />
  }

  return <>{children}</>
}
