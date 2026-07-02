import { Link, useLocation } from 'react-router-dom'
import { LayoutGrid, BarChart3, Mic, Megaphone } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { APP_MODULE_PATHS, type AppModule } from '../lib/appModules'

type QuickModule = 'operations' | 'quantitative' | 'qualitative' | 'crm_marketing'

const QUICK_MODULES: {
  module: QuickModule
  label: string
  hint: string
  icon: typeof LayoutGrid
}[] = [
  { module: 'operations', label: 'Operations', hint: 'Pipeline & finance', icon: LayoutGrid },
  { module: 'quantitative', label: 'Quantitative', hint: 'Surveys & fieldwork', icon: BarChart3 },
  { module: 'qualitative', label: 'Qualitative', hint: 'Transcripts & reports', icon: Mic },
  { module: 'crm_marketing', label: 'CRM', hint: 'Clients & outreach', icon: Megaphone },
]

export function ModuleQuickNav({ current }: { current: QuickModule }) {
  const location = useLocation()
  const { canAccessModule } = useAuth()
  const project = new URLSearchParams(location.search).get('project')

  const links = QUICK_MODULES.filter((item) => item.module !== current && canAccessModule(item.module))

  if (links.length === 0) return null

  function href(mod: AppModule) {
    const base = APP_MODULE_PATHS[mod]
    if (!project) return base
    if (mod === 'operations') return `${base}?project=${encodeURIComponent(project)}`
    if (mod === 'qualitative') return `${base}?project=${encodeURIComponent(project)}`
    if (mod === 'crm_marketing') return `${base}?project=${encodeURIComponent(project)}`
    return base
  }

  return (
    <nav
      aria-label="Related modules"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Jump to</span>
      {links.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.module}
            to={href(item.module)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-[var(--et-yellow)]/40 hover:text-[var(--et-navy)]"
            title={item.hint}
          >
            <Icon size={13} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
