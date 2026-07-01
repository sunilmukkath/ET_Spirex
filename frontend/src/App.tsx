import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider } from './auth/AuthContext'
import { AppShell } from './components/AppShell'
import { ModuleGate } from './components/ModuleGate'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LandingPage } from './pages/LandingPage'

const QuantitativePage = lazy(() =>
  import('./pages/QuantitativePage').then((m) => ({ default: m.QuantitativePage })),
)
const AdminSettingsPage = lazy(() =>
  import('./pages/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })),
)
const MyWorkPage = lazy(() =>
  import('./pages/MyWorkPage').then((m) => ({ default: m.MyWorkPage })),
)
const OperationsHubPage = lazy(() =>
  import('./pages/OperationsHubPage').then((m) => ({ default: m.OperationsHubPage })),
)
const CrmMarketingPage = lazy(() =>
  import('./pages/CrmMarketingPage').then((m) => ({ default: m.CrmMarketingPage })),
)
const QualitativePage = lazy(() =>
  import('./pages/QualitativePage').then((m) => ({ default: m.QualitativePage })),
)
const AccountingPage = lazy(() =>
  import('./pages/AccountingPage').then((m) => ({ default: m.AccountingPage })),
)
const TeamPage = lazy(() => import('./pages/TeamPage').then((m) => ({ default: m.TeamPage })))
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })))
const SurveyWorkspace = lazy(() =>
  import('./pages/SurveyWorkspace').then((m) => ({ default: m.SurveyWorkspace })),
)
const SurveyStudioPage = lazy(() =>
  import('./pages/SurveyStudioPage').then((m) => ({ default: m.SurveyStudioPage })),
)
const SurveyBuilderPage = lazy(() =>
  import('./pages/SurveyBuilderPage').then((m) => ({ default: m.SurveyBuilderPage })),
)
const SurveyCollectorPage = lazy(() =>
  import('./pages/SurveyCollectorPage').then((m) => ({ default: m.SurveyCollectorPage })),
)

function PageLoader() {
  return (
    <div className="et-canvas-dots flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-[var(--et-yellow)]/25">
          <Loader2 className="animate-spin text-[var(--et-navy)]" size={32} />
        </div>
        <p className="text-sm font-medium text-[var(--muted)]">Loading ET Scout…</p>
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
            <Route path="/s/:slug" element={<SurveyCollectorPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="home" element={<ModuleGate module="home"><HomePage /></ModuleGate>} />
              <Route path="quantitative" element={<ModuleGate module="quantitative"><QuantitativePage /></ModuleGate>} />
              <Route path="dashboard" element={<Navigate to="/quantitative" replace />} />
              <Route path="my-work" element={<ModuleGate module="my_work"><MyWorkPage /></ModuleGate>} />
              <Route path="operations" element={<ModuleGate module="operations"><OperationsHubPage /></ModuleGate>} />
              <Route path="crm-marketing" element={<ModuleGate module="crm_marketing"><CrmMarketingPage /></ModuleGate>} />
              <Route path="qualitative" element={<ModuleGate module="qualitative"><QualitativePage /></ModuleGate>} />
              <Route path="accounting" element={<ModuleGate module="accounting"><AccountingPage /></ModuleGate>} />
              <Route path="team" element={<ModuleGate module="team"><TeamPage /></ModuleGate>} />
              <Route path="settings" element={<ModuleGate module="settings"><AdminSettingsPage /></ModuleGate>} />
              <Route path="studio" element={<ModuleGate module="quantitative"><SurveyStudioPage /></ModuleGate>} />
            </Route>
            <Route
              path="studio/:workspaceId"
              element={
                <ProtectedRoute>
                  <ModuleGate module="quantitative">
                    <SurveyBuilderPage />
                  </ModuleGate>
                </ProtectedRoute>
              }
            />
            <Route
              path="projects/:id"
              element={
                <ProtectedRoute>
                  <ModuleGate module="quantitative">
                    <SurveyWorkspace />
                  </ModuleGate>
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
