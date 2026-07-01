import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, ClipboardList, Home, Landmark, LayoutGrid, LogOut, Menu, Settings, Users, X } from 'lucide-react'
import type { CommandPaletteItem } from './workspace/CommandPalette'
import { useAuth } from '../auth/AuthContext'
import { BrandLogo } from './BrandLogo'
import { CommandPalette, useCommandPaletteHotkey } from './workspace/CommandPalette'

const APP_NAV_ITEMS: CommandPaletteItem[] = [
  {
    id: 'app-home',
    label: 'Home',
    description: 'Tasks, projects, proposals, CRM, and finance overview',
    group: 'App',
    href: '/home',
    keywords: ['landing', 'dashboard', 'start', 'hub'],
  },
  {
    id: 'app-quantitative',
    label: 'Quantitative',
    description: 'LimeSurvey studies, programming, survey links, and Survey Studio',
    group: 'App',
    href: '/quantitative',
    keywords: ['home', 'surveys', 'limesurvey', 'quant', 'studio', 'programming'],
  },
  {
    id: 'app-my-work',
    label: 'My work',
    description: 'Assigned tasks and Gmail inbox → create tasks',
    group: 'App',
    href: '/my-work',
    keywords: ['tasks', 'gmail', 'inbox', 'email', 'assigned'],
  },
  {
    id: 'app-operations',
    label: 'Operations',
    description: 'Proposal-to-closure pipeline, finance, and CRM',
    group: 'App',
    href: '/operations',
    keywords: ['pm', 'pipeline', 'finance', 'crm', 'marketing', 'proposal', 'clients'],
  },
  {
    id: 'app-accounting',
    label: 'Accounting',
    description: 'Chart of accounts, AR/AP, payments, Zoho migration',
    group: 'App',
    href: '/accounting',
    keywords: ['books', 'zoho', 'invoices', 'bills', 'ledger', 'gst'],
  },
  {
    id: 'app-fieldwork',
    label: 'Fieldwork',
    description: 'PM fieldwork tracker — completes vs quota',
    group: 'App',
    href: '/fieldwork',
    keywords: ['quota', 'pm', 'tracking'],
  },
  {
    id: 'app-settings',
    label: 'Settings',
    description: 'Connection, AI, and team configuration',
    group: 'App',
    href: '/settings',
    keywords: ['admin', 'config'],
  },
]

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, activeSessions, refreshSessions } = useAuth()
  const [showSessions, setShowSessions] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const isWorkspace = /^\/projects\/\d+/.test(location.pathname)
  const isQuantitative =
    location.pathname === '/quantitative' || location.pathname.startsWith('/quantitative/')

  useCommandPaletteHotkey(() => {
    if (!isWorkspace) setCommandOpen(true)
  })

  async function handleLogout() {
    await logout()
    navigate('/')
  }

  if (isWorkspace) {
    return <Outlet />
  }

  return (
    <div className="et-canvas-dots min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-white/95 shadow-sm backdrop-blur-md">
        <div className="et-page et-page-wide flex items-center justify-between gap-4 py-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 sm:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <Link to="/home" className="rounded-lg transition hover:opacity-90">
              <BrandLogo size="sm" />
            </Link>
          </div>

          <nav className="hidden items-center gap-1 sm:flex">
            <Link
              to="/home"
              className={`et-chip ${location.pathname === '/home' ? 'et-chip-active' : 'et-chip-inactive'}`}
            >
              <Home size={14} />
              Home
            </Link>
            <Link
              to="/quantitative"
              className={`et-chip ${isQuantitative ? 'et-chip-active' : 'et-chip-inactive'}`}
            >
              <BarChart3 size={14} />
              Quantitative
            </Link>
            <Link
              to="/my-work"
              className={`et-chip ${location.pathname === '/my-work' ? 'et-chip-active' : 'et-chip-inactive'}`}
            >
              <ClipboardList size={14} />
              My work
            </Link>
            <Link
              to="/operations"
              className={`et-chip ${location.pathname === '/operations' ? 'et-chip-active' : 'et-chip-inactive'}`}
            >
              <LayoutGrid size={14} />
              Operations
            </Link>
            <Link
              to="/accounting"
              className={`et-chip ${location.pathname === '/accounting' ? 'et-chip-active' : 'et-chip-inactive'}`}
            >
              <Landmark size={14} />
              Accounting
            </Link>
            <Link
              to="/fieldwork"
              className={`et-chip ${location.pathname === '/fieldwork' ? 'et-chip-active' : 'et-chip-inactive'}`}
            >
              <BarChart3 size={14} />
              Fieldwork
            </Link>
            <Link
              to="/settings"
              className={`et-chip ${location.pathname === '/settings' ? 'et-chip-active' : 'et-chip-inactive'}`}
            >
              <Settings size={14} />
              Settings
            </Link>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="et-chip et-chip-inactive"
            >
              Jump to…
            </button>
          </nav>

          <div className="relative flex items-center gap-3">
            {activeSessions.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    refreshSessions()
                    setShowSessions((v) => !v)
                  }}
                  className="hidden items-center gap-1.5 rounded-full bg-[var(--et-yellow-light)] px-3 py-1.5 text-xs font-medium text-[var(--et-navy)] ring-1 ring-[var(--et-yellow)]/25 sm:flex"
                >
                  <Users size={14} />
                  {activeSessions.length} signed in
                </button>
                {showSessions && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-xl">
                    <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Active now
                    </p>
                    {activeSessions.map((s) => (
                      <div
                        key={`${s.username}-${s.login_at}`}
                        className="flex items-center justify-between px-3 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-800">{s.username}</span>
                        <span className="text-xs text-slate-400">{formatTime(s.last_seen)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 rounded-full bg-[var(--et-navy)] py-1.5 pl-3 pr-1.5 text-sm text-white shadow-md">
              <span className="hidden h-2 w-2 rounded-full bg-[var(--et-yellow)] sm:inline" />
              <span className="font-medium">{user?.username}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-slate-900/50 sm:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white p-4 shadow-2xl sm:hidden">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">Menu</span>
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <nav className="space-y-1">
              <Link
                to="/home"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  location.pathname === '/home' ? 'bg-[var(--et-yellow-light)] text-[var(--et-navy)]' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Home size={16} />
                Home
              </Link>
              <Link
                to="/quantitative"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  isQuantitative ? 'bg-[var(--et-yellow-light)] text-[var(--et-navy)]' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <BarChart3 size={16} />
                Quantitative
              </Link>
              <Link
                to="/my-work"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  location.pathname === '/my-work' ? 'bg-[var(--et-yellow-light)] text-[var(--et-navy)]' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <ClipboardList size={16} />
                My work
              </Link>
              <Link
                to="/operations"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  location.pathname === '/operations' ? 'bg-[var(--et-yellow-light)] text-[var(--et-navy)]' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <LayoutGrid size={16} />
                Operations
              </Link>
              <Link
                to="/accounting"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  location.pathname === '/accounting' ? 'bg-[var(--et-yellow-light)] text-[var(--et-navy)]' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Landmark size={16} />
                Accounting
              </Link>
              <Link
                to="/fieldwork"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  location.pathname === '/fieldwork' ? 'bg-[var(--et-yellow-light)] text-[var(--et-navy)]' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <BarChart3 size={16} />
                Fieldwork
              </Link>
              <Link
                to="/settings"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  location.pathname === '/settings' ? 'bg-[var(--et-yellow-light)] text-[var(--et-navy)]' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Settings size={16} />
                Settings
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false)
                  setCommandOpen(true)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Jump to…
              </button>
            </nav>
          </div>
        </>
      )}

      <main className="et-page et-page-wide et-page-main">
        <Outlet />
      </main>

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        extraItems={APP_NAV_ITEMS}
      />
    </div>
  )
}
