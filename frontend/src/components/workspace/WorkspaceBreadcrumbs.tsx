import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { workspaceBreadcrumbs, type WorkspaceNavId, WORKSPACE_NAV_ITEMS } from '../../lib/workspaceNav'

interface Props {
  activeId: WorkspaceNavId
  surveyTitle?: string
  onNavigate: (navId: WorkspaceNavId) => void
}

export function WorkspaceBreadcrumbs({ activeId, surveyTitle, onNavigate }: Props) {
  const crumbs = workspaceBreadcrumbs(activeId, surveyTitle)

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-slate-500">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        const navItem = crumb.navId ? WORKSPACE_NAV_ITEMS.find((row) => row.id === crumb.navId) : null

        return (
          <span key={`${crumb.label}-${index}`} className="inline-flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronRight size={12} className="shrink-0 text-slate-300" />}
            {crumb.label === 'Surveys' ? (
              <Link to="/quantitative" className="truncate hover:text-[var(--et-teal-dark)]">
                {crumb.label}
              </Link>
            ) : navItem && !isLast ? (
              <button
                type="button"
                onClick={() => onNavigate(navItem.id)}
                className="max-w-[12rem] truncate hover:text-[var(--et-teal-dark)]"
              >
                {crumb.label}
              </button>
            ) : (
              <span className={`max-w-[14rem] truncate ${isLast ? 'font-medium text-slate-700' : ''}`}>
                {crumb.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
