import type { PmPipelineProject, PmProject } from '../api/client'

export function pmProjectOptionLabel(p: PmProject | PmPipelineProject): string {
  const client =
    'client_name' in p && p.client_name ? ` · ${p.client_name}` : ''
  const code = p.project_code ? ` (${p.project_code})` : ''
  const stage = p.stage && p.stage !== 'Delivered' ? ` — ${p.stage}` : ''
  return `${p.project_name}${code}${client}${stage}`
}

export function activePmProjects<T extends PmProject | PmPipelineProject>(projects: T[]): T[] {
  return projects.filter((p) => p.stage !== 'Delivered')
}
