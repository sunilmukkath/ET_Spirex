import type { GlobalRole, ProjectModule, WorkflowAccess } from '../api/client'

export const PROJECT_MODULE_LABELS: Record<ProjectModule, string> = {
  programming: 'Programming',
  field: 'Field ops',
  research: 'Research',
  finance: 'Finance',
  client: 'Client liaison',
  analysis: 'Analysis',
  qc: 'QC',
  export: 'Export & delivery',
}

export const PROJECT_MODULE_HINTS: Record<ProjectModule, string> = {
  programming: 'Questionnaire setup, specs, custom variables',
  field: 'Fielding pace, quotas, interviewer monitoring',
  research: 'Study design inputs and research deliverables',
  finance: 'Budgets, invoicing, and commercial tracking',
  client: 'Client requests and stakeholder updates',
  analysis: 'Profiles, crosstabs, charts, and statistics',
  qc: 'Response QC rules, review, and exclusions',
  export: 'Raw data, codebooks, and report decks',
}

export const TASK_CATEGORY_LABELS: Record<string, string> = {
  programming: 'Programming',
  field: 'Field',
  research: 'Research',
  finance: 'Finance',
  client_request: 'Client request',
  general: 'General',
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}

export function canManageTeam(access: WorkflowAccess | null | undefined): boolean {
  return Boolean(access?.can_manage_team)
}

export function hasModuleAccess(
  access: WorkflowAccess | null | undefined,
  module: ProjectModule,
): boolean {
  if (!access) return false
  if (access.global_role === 'admin') return true
  if (access.is_project_manager || access.project_role === 'lead') return true
  return access.modules.includes(module)
}

export function isAdmin(role: GlobalRole | undefined | null): boolean {
  return role === 'admin'
}

export function isManagerOrAbove(role: GlobalRole | undefined | null): boolean {
  return role === 'admin' || role === 'manager'
}

export type WorkspaceMode =
  | 'home'
  | 'explore'
  | 'charts'
  | 'reports'
  | 'variables'
  | 'fields'
  | 'data'
  | 'multivariate'
  | 'workflow'

/** Workspace tab → project module(s) required to open it. */
export const MODE_MODULE: Partial<Record<WorkspaceMode, ProjectModule | ProjectModule[]>> = {
  explore: 'analysis',
  charts: 'analysis',
  reports: 'export',
  multivariate: 'analysis',
  fields: ['field', 'qc'],
  variables: 'programming',
  data: 'export',
}

export function canAccessMode(
  access: WorkflowAccess | null | undefined,
  mode: WorkspaceMode,
): boolean {
  if (mode === 'home' || mode === 'workflow') return true
  const required = MODE_MODULE[mode]
  if (!required) return true
  // Fail open when access has not loaded or errored — avoid locking users out.
  if (!access) return true
  if (Array.isArray(required)) {
    return required.some((module) => hasModuleAccess(access, module))
  }
  return hasModuleAccess(access, required)
}

export function firstAllowedMode(access: WorkflowAccess | null | undefined): WorkspaceMode {
  const order: WorkspaceMode[] = [
    'home',
    'workflow',
    'explore',
    'charts',
    'reports',
    'multivariate',
    'fields',
    'variables',
    'data',
  ]
  return order.find((mode) => canAccessMode(access, mode)) ?? 'home'
}
