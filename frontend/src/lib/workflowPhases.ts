import type { ProjectPhase, StudyType } from '../api/client'

export const PROJECT_PHASES: ProjectPhase[] = [
  'proposal',
  'design',
  'pilot',
  'field',
  'analysis',
  'delivery',
  'closed',
]

export const PROJECT_PHASE_LABELS: Record<ProjectPhase, string> = {
  proposal: 'Proposal',
  design: 'Design',
  pilot: 'Pilot',
  field: 'Field',
  analysis: 'Analysis',
  delivery: 'Delivery',
  closed: 'Closed',
}

export const STUDY_TYPE_LABELS: Record<StudyType, string> = {
  quant: 'Quantitative',
  qual: 'Qualitative',
  mixed: 'Mixed methods',
}
