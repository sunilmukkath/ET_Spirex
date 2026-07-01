import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider } from './auth/AuthContext'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LandingPage } from './pages/LandingPage'
import { GoogleCallbackPage } from './pages/GoogleCallbackPage'

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const AdminSettingsPage = lazy(() =>
  import('./pages/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })),
)
const SurveyWorkspace = lazy(() =>
  import('./pages/SurveyWorkspace').then((m) => ({ default: m.SurveyWorkspace })),
)

function PageLoader() {
  return (
    <div className="et-canvas-dots flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-[var(--et-teal)]/15">
          <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
        </div>
        <p className="text-sm font-medium text-slate-500">Loading ET Scout…</p>
      </div>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="auth/google/callback" element={<GoogleCallbackPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
            </Route>
            <Route
              path="projects/:id"
              element={
                <ProtectedRoute>
                  <SurveyWorkspace />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
