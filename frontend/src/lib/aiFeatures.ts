/** Shared AI UI metadata for ET Scout. */

export type AiFeatureId =
  | 'copilot'
  | 'questionnaire'
  | 'proposal'
  | 'topline'
  | 'report'
  | 'qual'
  | 'finance'
  | 'crm'
  | 'narrative'

export interface AiFeature {
  id: AiFeatureId
  title: string
  description: string
  where: string
  href?: string
}

export const AI_FEATURES: AiFeature[] = [
  {
    id: 'copilot',
    title: 'Scout',
    description: 'Ask how to navigate the app, run analysis, or what to do next on this study.',
    where: 'Floating chat (bottom-right) on every signed-in page',
  },
  {
    id: 'questionnaire',
    title: 'Questionnaire draft',
    description: 'Generate survey blocks and questions from a research brief in Survey Studio.',
    where: 'Survey Studio → Build → Draft with AI',
    href: '/studio',
  },
  {
    id: 'proposal',
    title: 'Proposal writing',
    description: 'Client-facing proposal from PM project context, requirements, and finance.',
    where: 'Operations → Pipeline → Draft proposal',
    href: '/operations',
  },
  {
    id: 'topline',
    title: 'Topline report',
    description: 'Short headline bullets and watch-outs from your report sections.',
    where: 'Study → Reports → Topline (AI)',
  },
  {
    id: 'report',
    title: 'Full report draft',
    description: 'Executive summary, findings, and recommendations from analysis sections.',
    where: 'Study → Reports → Report writing agent',
  },
  {
    id: 'narrative',
    title: 'Slide narratives & deck plan',
    description: 'AI bullets per chart/crosstab and multi-slide deck plan for PowerPoint export.',
    where: 'Study → Reports → Generate slide plan',
  },
  {
    id: 'qual',
    title: 'Qual thematic summary',
    description: 'Themes and quotes from uploaded transcripts.',
    where: 'Study → Qual → Summarise',
  },
  {
    id: 'finance',
    title: 'Finance brief',
    description: 'Commercial summary and actions from project budgets and invoices.',
    where: 'Operations → Finance tab',
    href: '/operations',
  },
  {
    id: 'crm',
    title: 'CRM brief',
    description: 'Client relationship summary and follow-up actions.',
    where: 'Operations → Clients tab',
    href: '/operations',
  },
]
