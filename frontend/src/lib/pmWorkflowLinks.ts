export function pmWorkflowHref(projectId: string) {
  return `/operations?tab=pipeline&project=${encodeURIComponent(projectId)}&view=workflow`
}

export function taskWorkflowHref(row: {
  project_id?: string | null
  survey_id?: number | null
}): string | null {
  if (row.project_id) return pmWorkflowHref(row.project_id)
  if (row.survey_id != null) return `/projects/${row.survey_id}?mode=workflow`
  return null
}
