/**
 * Survey programming AST — extends ET Studio definitions with ExpressionScript logic.
 * Qcode = `code` on each question (unique within a survey).
 */

import type { EtBlock, EtQuestion, EtSurveyDefinition } from '../../api/client'

export type SurveyAssetKind = 'question' | 'block' | 'survey' | 'label_set'

export interface EvaluationContext {
  participant_responses: Record<string, unknown>
  panel_metadata: Record<string, unknown>
  system_variables: Record<string, unknown>
}

export interface ParticipantSession {
  session_id: string
  survey_id: string
  current_block_index: number
  answers: Record<string, unknown>
  quota_counts: Record<string, number>
  terminated: boolean
  termination_reason: 'quota_full' | 'screen_out' | null
  started_at: number
  updated_at: number
}

export type SurveySchema = EtSurveyDefinition

export type Page = EtBlock

export type Question = EtQuestion

export interface SurveyAsset {
  kind: SurveyAssetKind
  id: string
  name: string
  payload: EtQuestion | EtBlock | EtSurveyDefinition | LabelSet
}

export interface LabelSet {
  id: string
  name: string
  options: Array<{ code: string; label: string }>
}

export type DiagnosticSeverity = 'valid' | 'future_ref' | 'error'

export interface LogicDiagnostic {
  severity: DiagnosticSeverity
  qcode: string
  field: string
  message: string
  expression?: string
}

export interface ValidationReport {
  diagnostics: LogicDiagnostic[]
  has_errors: boolean
  has_future_refs: boolean
}

export interface QuotaCheckResult {
  filled: boolean
  rule_id: string
  label: string
  current: number
  target: number
}

export interface RoutedPage {
  block: Page
  block_index: number
  questions: Question[]
  is_last: boolean
}

export function buildEvaluationContext(
  session: ParticipantSession,
  extras?: Partial<EvaluationContext>,
): EvaluationContext {
  return {
    participant_responses: { ...session.answers, ...(extras?.participant_responses ?? {}) },
    panel_metadata: extras?.panel_metadata ?? {},
    system_variables: extras?.system_variables ?? {},
  }
}

/** Flatten all questions in schema order with their Qcodes. */
export function allQuestions(schema: SurveySchema): Question[] {
  const blocks = [...schema.blocks].sort((a, b) => a.sort_order - b.sort_order)
  return blocks.flatMap((b) =>
    [...b.questions].sort((a, c) => a.sort_order - c.sort_order),
  )
}

export function qcodeIndex(schema: SurveySchema): Map<string, Question> {
  const map = new Map<string, Question>()
  for (const q of allQuestions(schema)) {
    if (q.code) map.set(q.code, q)
  }
  return map
}
