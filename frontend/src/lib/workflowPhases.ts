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
  field: 'Fieldwork',
  analysis: 'Analysis',
  delivery: 'Client delivery',
  closed: 'Closed',
}

/** Short hint shown in workflow UI — helps ET team know what belongs in each phase. */
export const PROJECT_PHASE_HINTS: Record<ProjectPhase, string> = {
  proposal: 'Scoping, costing, and client sign-off',
  design: 'Questionnaire, programming spec, translations',
  pilot: 'Soft launch, QC checks, quota dry-runs',
  field: 'Live data collection and daily monitoring',
  analysis: 'Tables, charts, statistics, internal review',
  delivery: 'Client decks, exports, and final handoff',
  closed: 'Archived — read-only reference',
}

export const STUDY_TYPE_LABELS: Record<StudyType, string> = {
  quant: 'Quantitative',
  qual: 'Qualitative',
  mixed: 'Mixed methods',
}
