import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  Home,
  Kanban,
  Layers,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  ShieldCheck,
  Sigma,
  SlidersHorizontal,
  Table2,
  Users,
  Variable,
} from 'lucide-react'
import type { StudyType, WorkflowAccess } from '../../api/client'
import {
  filterWorkspaceNav,
  resolveActiveNavId,
  type NavGroup,
  type SetupView,
  type WorkspaceNavId,
  type WorkspaceNavItem,
} from '../../lib/workspaceNav'
import { NAV_GROUP_LABELS } from '../../lib/etCopy'

const GROUP_ORDER: NavGroup[] = ['Overview', 'Qual', 'Analyze', 'Field', 'Data']

const ICONS: Record<WorkspaceNavId, React.ReactNode> = {
  home: <Home size={16} />,
  workflow: <Kanban size={16} />,
  'qual-library': <MessageSquare size={16} />,
  profile: <Layers size={16} />,
  crosstabs: <Table2 size={16} />,
  charts: <BarChart3 size={16} />,
  reports: <FileText size={16} />,
  statistics: <Sigma size={16} />,
  fielding: <ClipboardList size={16} />,
  quality: <ShieldCheck size={16} />,
  team: <Users size={16} />,
  questions: <SlidersHorizontal size={16} />,
  'custom-vars': <Variable size={16} />,
  weighting: <Scale size={16} />,
  'raw-data': <Database size={16} />,
}

interface Props {
  access: WorkflowAccess | null
  studyType?: StudyType
  activeId: WorkspaceNavId
  collapsed: boolean
  onToggleCollapsed: () => void
  onNavigate: (item: WorkspaceNavItem) => void
  onCloseMobile?: () => void
  mobile?: boolean
}

function NavButton({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: WorkspaceNavItem
  active: boolean
  collapsed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? item.label : item.description}
      className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
        active
          ? 'bg-[var(--et-teal)] font-medium text-white shadow-sm'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <span className={`shrink-0 ${active ? 'text-white' : 'text-[var(--et-teal-dark)]'}`}>
        {ICONS[item.id]}
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate">
          <span className="block truncate">{item.label}</span>
        </span>
      )}
    </button>
  )
}

export function WorkspaceSidebar({
  access,
  studyType = 'quant',
  activeId,
  collapsed,
  onToggleCollapsed,
  onNavigate,
  onCloseMobile,
  mobile = false,
}: Props) {
  const items = filterWorkspaceNav(access, studyType)
  const byGroup = GROUP_ORDER.map((group) => ({
    group,
    label: NAV_GROUP_LABELS[group] ?? group,
    items: items.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0)

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-slate-200 bg-white ${
        collapsed && !mobile ? 'w-[3.25rem]' : 'w-56'
      } ${mobile ? 'shadow-2xl' : ''}`}
    >
      <div className="flex items-center justify-between gap-1 border-b border-slate-100 px-2 py-2">
        {!collapsed && <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Navigate</span>}
        <div className="ml-auto flex items-center gap-0.5">
          {mobile && onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Close menu"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {!mobile && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-2">
        {byGroup.map(({ group, label, items: groupItems }) => (
          <div key={group}>
            {!collapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {label}
              </p>
            )}
            <div className="space-y-0.5">
              {groupItems.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  collapsed={collapsed && !mobile}
                  onClick={() => {
                    onNavigate(item)
                    onCloseMobile?.()
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-slate-100 p-3">
          <p className="text-[10px] leading-relaxed text-slate-400">
            Press <kbd className="rounded bg-slate-100 px-1 py-0.5 font-sans text-slate-600">⌘K</kbd> to jump anywhere
          </p>
        </div>
      )}
    </aside>
  )
}

export function resolveSidebarActiveId(
  mode: string,
  analyzeView: 'profile' | 'compare',
  fieldView: string,
  setupView: SetupView,
): WorkspaceNavId {
  return resolveActiveNavId(
    mode as Parameters<typeof resolveActiveNavId>[0],
    analyzeView,
    fieldView,
    setupView,
  )
}

export function WorkspaceSidebarToggle({
  onClick,
}: {
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 lg:hidden"
    >
      <ChevronRight size={15} />
      Menu
    </button>
  )
}
