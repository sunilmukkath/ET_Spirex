import type { GlobalRole, ProjectModule, WorkflowAccess } from '../api/client'

export const PROJECT_MODULE_LABELS: Record<ProjectModule, string> = {
  programming: 'Programming',
  field: 'Field',
  research: 'Research',
  finance: 'Finance',
  client: 'Client liaison',
  analysis: 'Analysis',
  qc: 'Quality / QC',
  export: 'Export & delivery',
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
