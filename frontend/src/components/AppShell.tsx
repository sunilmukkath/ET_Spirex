import { useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, ClipboardList, Home, Landmark, LayoutGrid, LogOut, Menu, Megaphone, Mic, Settings, Users, X } from 'lucide-react'
import type { CommandPaletteItem } from './workspace/CommandPalette'
import { useAuth } from '../auth/AuthContext'
import { APP_MODULE_PATHS, type AppModule } from '../lib/appModules'
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
    description: 'Proposal-to-closure pipeline, finance, and survey linking',
    group: 'App',
    href: '/operations',
    keywords: ['pm', 'pipeline', 'finance', 'proposal', 'fieldwork'],
  },
  {
    id: 'app-crm-marketing',
    label: 'CRM & marketing',
    description: 'Clients, nurture follow-ups, campaigns, and CRM agent',
    group: 'App',
    href: '/crm-marketing',
    keywords: ['crm', 'marketing', 'clients', 'outreach', 'nurture'],
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
    id: 'app-qualitative',
    label: 'Qualitative',
    description: 'Transcript upload, qual library, search, and thematic reporting',
    group: 'App',
    href: '/qualitative',
    keywords: ['qual', 'transcript', 'fgd', 'idi', 'thematic', 'coding'],
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
    id: 'app-team',
    label: 'Team',
    description: 'Staff directory, emails, phones, and workload assessment',
    group: 'App',
    href: '/team',
    keywords: ['hr', 'people', 'staff', 'employees', 'load', 'workload'],
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

type NavLinkDef = {
  module: AppModule
  label: string
  icon: typeof Home
  isActive: (pathname: string, isQuantitative: boolean) => boolean
}

const NAV_LINKS: NavLinkDef[] = [
  { module: 'home', label: 'Home', icon: Home, isActive: (p) => p === '/home' },
  { module: 'my_work', label: 'My work', icon: ClipboardList, isActive: (p) => p === '/my-work' },
  { module: 'operations', label: 'Operations', icon: LayoutGrid, isActive: (p) => p === '/operations' },
  { module: 'crm_marketing', label: 'CRM & marketing', icon: Megaphone, isActive: (p) => p === '/crm-marketing' },
  {
    module: 'quantitative',
    label: 'Quantitative',
    icon: BarChart3,
    isActive: (_, isQuantitative) => isQuantitative,
  },
  { module: 'qualitative', label: 'Qualitative', icon: Mic, isActive: (p) => p === '/qualitative' },
  { module: 'accounting', label: 'Accounting', icon: Landmark, isActive: (p) => p === '/accounting' },
  { module: 'team', label: 'Team', icon: Users, isActive: (p) => p === '/team' },
  { module: 'settings', label: 'Settings', icon: Settings, isActive: (p) => p === '/settings' },
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
  const { user, logout, activeSessions, refreshSessions, canAccessModule } = useAuth()
  const [showSessions, setShowSessions] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const isWorkspace = /^\/projects\/\d+/.test(location.pathname)
  const isQuantitative =
    location.pathname === '/quantitative' || location.pathname.startsWith('/quantitative/')

  const visibleNavLinks = useMemo(
    () => NAV_LINKS.filter((link) => canAccessModule(link.module)),
    [canAccessModule],
  )

  const visibleCommandItems = useMemo(
    () =>
      APP_NAV_ITEMS.filter((item) => {
        const mod = Object.entries(APP_MODULE_PATHS).find(([, path]) => path === item.href)?.[0] as
          | AppModule
          | undefined
        return mod ? canAccessModule(mod) : true
      }),
    [canAccessModule],
  )

  const homePath = canAccessModule('home') ? '/home' : APP_MODULE_PATHS[visibleNavLinks[0]?.module ?? 'home']

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
            <Link to={homePath} className="rounded-lg transition hover:opacity-90">
              <BrandLogo size="sm" />
            </Link>
          </div>

          <nav className="hidden items-center gap-1 sm:flex">
            {visibleNavLinks.map((link) => {
              const Icon = link.icon
              const active = link.isActive(location.pathname, isQuantitative)
              return (
                <Link
                  key={link.module}
                  to={APP_MODULE_PATHS[link.module]}
                  className={`et-chip ${active ? 'et-chip-active' : 'et-chip-inactive'}`}
                >
                  <Icon size={14} />
                  {link.label}
                </Link>
              )
            })}
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
              {visibleNavLinks.map((link) => {
                const Icon = link.icon
                const active = link.isActive(location.pathname, isQuantitative)
                return (
                  <Link
                    key={link.module}
                    to={APP_MODULE_PATHS[link.module]}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      active ? 'bg-[var(--et-yellow-light)] text-[var(--et-navy)]' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={16} />
                    {link.label}
                  </Link>
                )
              })}
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
        extraItems={visibleCommandItems}
      />
    </div>
  )
}
