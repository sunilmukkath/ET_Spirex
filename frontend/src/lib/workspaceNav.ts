import type { ProjectModule, StudyType, WorkflowAccess } from '../api/client'
import { canAccessMode, hasModuleAccess, type WorkspaceMode } from './workflowAccess'

export type WorkspaceNavId =
  | 'home'
  | 'workflow'
  | 'qual-library'
  | 'profile'
  | 'crosstabs'
  | 'charts'
  | 'reports'
  | 'statistics'
  | 'fielding'
  | 'quality'
  | 'team'
  | 'questions'
  | 'custom-vars'
  | 'weighting'
  | 'raw-data'

export type SetupView = 'questions' | 'custom' | 'weighting'

export type NavGroup = 'Overview' | 'Qual' | 'Analyze' | 'Field' | 'Data' | 'App'

export interface WorkspaceNavItem {
  id: WorkspaceNavId
  label: string
  description: string
  group: NavGroup
  mode: WorkspaceMode | 'app'
  view?: string
  modules?: ProjectModule | ProjectModule[]
  keywords: string[]
  appPath?: string
}

export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  {
    id: 'home',
    label: 'Study overview',
    description: 'Sample counts, quotas, and role-based shortcuts',
    group: 'Overview',
    mode: 'home',
    keywords: ['overview', 'dashboard', 'summary', 'stats', 'home'],
  },
  {
    id: 'workflow',
    label: 'Project workflow',
    description: 'ET team roster, study phase, tasks, and translations',
    group: 'Overview',
    mode: 'workflow',
    keywords: ['tasks', 'kanban', 'team', 'phase', 'pilot', 'translations', 'assign'],
  },
  {
    id: 'qual-library',
    label: 'Qual library',
    description: 'Transcripts, session notes, full-text search, and AI thematic summaries',
    group: 'Qual',
    mode: 'qual',
    modules: 'research',
    keywords: ['qual', 'qualitative', 'transcript', 'fgd', 'idi', 'interview', 'themes', 'coding'],
  },
  {
    id: 'profile',
    label: 'Question profiles',
    description: 'Frequencies and summaries for one question at a time',
    group: 'Analyze',
    mode: 'explore',
    view: 'profile',
    modules: 'analysis',
    keywords: ['explore', 'distribution', 'frequencies', 'profile', 'single'],
  },
  {
    id: 'crosstabs',
    label: 'Crosstabs',
    description: 'Banner tables with significance testing and filters',
    group: 'Analyze',
    mode: 'explore',
    view: 'crosstabs',
    modules: 'analysis',
    keywords: ['banner', 'tables', 'compare', 'sig test', 'significance', 'tabs'],
  },
  {
    id: 'charts',
    label: 'Charts',
    description: 'Build and export chart decks for decks and reports',
    group: 'Analyze',
    mode: 'charts',
    modules: 'analysis',
    keywords: ['visualization', 'bar', 'pie', 'graph', 'deck'],
  },
  {
    id: 'reports',
    label: 'Report builder',
    description: 'Client-ready PDF and PowerPoint decks with optional AI narrative',
    group: 'Analyze',
    mode: 'reports',
    modules: 'export',
    keywords: ['pptx', 'pdf', 'deck', 'slides', 'delivery', 'client'],
  },
  {
    id: 'statistics',
    label: 'Advanced statistics',
    description: 'Correlation, regression, chi-square, t-test, and ANOVA',
    group: 'Analyze',
    mode: 'multivariate',
    modules: 'analysis',
    keywords: ['multivariate', 'advanced', 'regression', 'anova', 'chi'],
  },
  {
    id: 'fielding',
    label: 'Fielding & quotas',
    description: 'Daily completes, pace charts, and quota targets',
    group: 'Field',
    mode: 'fields',
    view: 'fielding',
    modules: 'field',
    keywords: ['monitor', 'quotas', 'targets', 'pace', 'completes', 'fielding'],
  },
  {
    id: 'quality',
    label: 'QC review',
    description: 'Flagged responses, speeders, GPS checks, and exclusions',
    group: 'Field',
    mode: 'fields',
    view: 'quality',
    modules: ['field', 'qc'],
    keywords: ['quality', 'speeders', 'gps', 'flags', 'exclusions', 'qc'],
  },
  {
    id: 'team',
    label: 'Field team',
    description: 'Interviewer throughput, approvals, and rejection rates',
    group: 'Field',
    mode: 'fields',
    view: 'team',
    modules: 'field',
    keywords: ['interviewer', 'rejections', 'throughput', 'team'],
  },
  {
    id: 'questions',
    label: 'Question setup',
    description: 'Analysis types and per-question configuration (programming)',
    group: 'Data',
    mode: 'variables',
    view: 'questions',
    modules: 'programming',
    keywords: ['variables', 'setup', 'types', 'configuration', 'programming'],
  },
  {
    id: 'custom-vars',
    label: 'Custom variables',
    description: 'Recodes, net scores, and combined awareness questions',
    group: 'Data',
    mode: 'variables',
    view: 'custom',
    modules: 'programming',
    keywords: ['recode', 'net score', 'combine', 'derived', 'awareness'],
  },
  {
    id: 'weighting',
    label: 'Weighting',
    description: 'Survey weight variable for weighted tables',
    group: 'Data',
    mode: 'variables',
    view: 'weighting',
    modules: 'programming',
    keywords: ['weights', 'rim', 'calibration'],
  },
  {
    id: 'raw-data',
    label: 'Raw data',
    description: 'Response-level browse and CSV export with codebook',
    group: 'Data',
    mode: 'data',
    modules: 'export',
    keywords: ['export', 'csv', 'responses', 'download', 'codebook'],
  },
]

export const APP_COMMAND_ITEMS: Array<{
  label: string
  description: string
  href: string
  group: 'App'
  keywords: string[]
}> = [
  {
    label: 'All projects',
    description: 'Elastic Tree study list on the dashboard',
    href: '/dashboard',
    group: 'App',
    keywords: ['dashboard', 'projects', 'studies', 'surveys', 'list'],
  },
  {
    label: 'Settings',
    description: 'Team roles, LimeSurvey connection, and your account',
    href: '/settings',
    group: 'App',
    keywords: ['admin', 'users', 'roles', 'team', 'account'],
  },
]

/** Quant-only workspace destinations — hidden when study_type is qual. */
const QUANT_ONLY_NAV_IDS = new Set<WorkspaceNavId>([
  'profile',
  'crosstabs',
  'charts',
  'statistics',
  'fielding',
  'quality',
  'team',
  'questions',
  'custom-vars',
  'weighting',
  'raw-data',
])

export function studyTypeAllowsNav(item: WorkspaceNavItem, studyType: StudyType): boolean {
  if (studyType === 'qual' && QUANT_ONLY_NAV_IDS.has(item.id)) return false
  if (studyType === 'quant' && item.id === 'qual-library') return false
  return true
}

function itemHasModuleAccess(
  access: WorkflowAccess | null | undefined,
  modules?: ProjectModule | ProjectModule[],
): boolean {
  if (!modules) return true
  if (Array.isArray(modules)) {
    return modules.some((module) => hasModuleAccess(access, module))
  }
  return hasModuleAccess(access, modules)
}

export function isNavItemAccessible(
  item: WorkspaceNavItem,
  access: WorkflowAccess | null | undefined,
): boolean {
  if (item.appPath) return true
  if (!canAccessMode(access, item.mode as WorkspaceMode)) return false
  return itemHasModuleAccess(access, item.modules)
}

export function filterWorkspaceNav(
  access: WorkflowAccess | null | undefined,
  studyType: StudyType = 'quant',
): WorkspaceNavItem[] {
  return WORKSPACE_NAV_ITEMS.filter(
    (item) => isNavItemAccessible(item, access) && studyTypeAllowsNav(item, studyType),
  )
}

export function resolveActiveNavId(
  mode: WorkspaceMode,
  analyzeView: 'profile' | 'compare',
  fieldView: string,
  setupView: SetupView,
): WorkspaceNavId {
  if (mode === 'home') return 'home'
  if (mode === 'workflow') return 'workflow'
  if (mode === 'qual') return 'qual-library'
  if (mode === 'explore') return analyzeView === 'compare' ? 'crosstabs' : 'profile'
  if (mode === 'charts') return 'charts'
  if (mode === 'reports') return 'reports'
  if (mode === 'multivariate') return 'statistics'
  if (mode === 'data') return 'raw-data'
  if (mode === 'fields') {
    if (fieldView === 'quality') return 'quality'
    if (fieldView === 'team') return 'team'
    return 'fielding'
  }
  if (mode === 'variables') {
    if (setupView === 'custom') return 'custom-vars'
    if (setupView === 'weighting') return 'weighting'
    return 'questions'
  }
  return 'home'
}

export function parseSetupView(rawMode: string | null, rawView: string | null): SetupView {
  if (rawMode !== 'variables') return 'questions'
  if (rawView === 'custom' || rawView === 'weighting') return rawView
  return 'questions'
}

export function navItemToSearchParams(item: WorkspaceNavItem): { mode: string; view?: string } {
  if (item.appPath) return { mode: 'home' }
  if (item.mode === 'explore') {
    return {
      mode: 'explore',
      view: item.view === 'crosstabs' ? 'crosstabs' : undefined,
    }
  }
  if (item.mode === 'fields') {
    return { mode: 'fields', view: item.view ?? 'fielding' }
  }
  if (item.mode === 'variables') {
    return {
      mode: 'variables',
      view: item.view && item.view !== 'questions' ? item.view : undefined,
    }
  }
  return { mode: item.mode }
}

export function buildWorkspaceHref(surveyId: number, item: WorkspaceNavItem): string {
  if (item.appPath) return item.appPath
  const { mode, view } = navItemToSearchParams(item)
  const params = new URLSearchParams()
  params.set('mode', mode)
  if (view) params.set('view', view)
  return `/projects/${surveyId}?${params.toString()}`
}

export interface BreadcrumbCrumb {
  label: string
  navId?: WorkspaceNavId
}

export function workspaceBreadcrumbs(
  activeId: WorkspaceNavId,
  surveyTitle?: string,
): BreadcrumbCrumb[] {
  const item = WORKSPACE_NAV_ITEMS.find((row) => row.id === activeId)
  const crumbs: BreadcrumbCrumb[] = [{ label: 'Projects', navId: undefined }]
  if (surveyTitle) crumbs.push({ label: surveyTitle, navId: 'home' })
  if (item && item.id !== 'home') {
    crumbs.push({ label: item.group })
    crumbs.push({ label: item.label, navId: item.id })
  } else if (item) {
    crumbs.push({ label: item.label, navId: item.id })
  }
  return crumbs
}

export function searchNavItems(
  query: string,
  access: WorkflowAccess | null | undefined,
  surveyId?: number,
  studyType: StudyType = 'quant',
): Array<WorkspaceNavItem & { href: string }> {
  const q = query.trim().toLowerCase()
  const workspace = filterWorkspaceNav(access, studyType).map((item) => ({
    ...item,
    href: surveyId ? buildWorkspaceHref(surveyId, item) : '#',
  }))
  const app = APP_COMMAND_ITEMS.map((item) => ({
    id: 'home' as WorkspaceNavId,
    label: item.label,
    description: item.description,
    group: item.group,
    mode: 'home' as const,
    keywords: item.keywords,
    href: item.href,
  }))
  const all = [...workspace, ...app]
  if (!q) return all
  return all.filter((item) => {
    const haystack = [item.label, item.description, item.group, ...item.keywords].join(' ').toLowerCase()
    return haystack.includes(q)
  })
}
