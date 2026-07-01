/**
 * Stateful survey runner — dynamic routing, relevance, micro-tailoring, quota checks.
 */

import type { EtQuestion, EtShowIfRule } from '../../api/client'
import { interpolateText, isRelevant } from './expressionEngine'
import {
  allQuestions,
  buildEvaluationContext,
  type EvaluationContext,
  type Page,
  type ParticipantSession,
  type QuotaCheckResult,
  type RoutedPage,
  type SurveySchema,
} from './types'

function matchesShowIfRule(
  rule: EtShowIfRule | null | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!rule) return true
  const raw = answers[rule.question_id] ?? answers[rule.question_id.replace(/^Q/, '')]
  const values = Array.isArray(raw) ? raw.map(String) : [String(raw ?? '')]
  const target = rule.values.map(String)
  switch (rule.operator) {
    case 'equals':
      return target.some((t) => values.includes(t))
    case 'not_equals':
      return !target.some((t) => values.includes(t))
    case 'includes':
      return target.every((t) => values.includes(t))
    case 'not_includes':
      return !target.every((t) => values.includes(t))
    default:
      return true
  }
}

/** Resolve answers keyed by question id OR qcode for expression context. */
export function answersToQcodeContext(
  schema: SurveySchema,
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const byQcode: Record<string, unknown> = { ...answers }
  for (const q of allQuestions(schema)) {
    if (q.id in answers) byQcode[q.code] = answers[q.id]
    if (q.code in answers) byQcode[q.id] = answers[q.code]
  }
  return byQcode
}

export function isQuestionVisible(
  question: EtQuestion,
  _schema: SurveySchema,
  context: EvaluationContext,
  answers: Record<string, unknown>,
): boolean {
  if (question.type === 'equation') return false
  if (!matchesShowIfRule(question.show_if, answers)) return false
  return isRelevant(question.relevance_equation, context)
}

export function isBlockVisible(
  block: Page,
  context: EvaluationContext,
  answers: Record<string, unknown>,
): boolean {
  if (!isRelevant(block.relevance_equation, context)) return false
  const hasVisibleQuestion = block.questions.some((q) =>
    isQuestionVisible(q, { blocks: [block], version: 1, settings: {} as never }, context, answers),
  )
  return hasVisibleQuestion
}

/** Apply micro-tailoring to question text and option labels. */
export function tailorQuestion(question: EtQuestion, context: EvaluationContext): EtQuestion {
  return {
    ...question,
    text: interpolateText(question.text, context),
    help_text: question.help_text ? interpolateText(question.help_text, context) : question.help_text,
    options: question.options?.map((o) => ({
      ...o,
      label: interpolateText(o.label, context),
    })),
    rows: question.rows?.map((r) => ({
      ...r,
      label: interpolateText(r.label, context),
    })),
  }
}

export function visibleQuestionsOnBlock(
  block: Page,
  schema: SurveySchema,
  session: ParticipantSession,
  context?: EvaluationContext,
): EtQuestion[] {
  const ctx = context ?? buildEvaluationContext(session, {
    participant_responses: answersToQcodeContext(schema, session.answers),
  })
  const sorted = [...block.questions].sort((a, b) => a.sort_order - b.sort_order)
  return sorted
    .filter((q) => isQuestionVisible(q, schema, ctx, session.answers))
    .map((q) => tailorQuestion(q, ctx))
}

/** Check quota rules against session ledger. */
export function checkQuotas(
  schema: SurveySchema,
  session: ParticipantSession,
  context?: EvaluationContext,
): QuotaCheckResult[] {
  const ctx = context ?? buildEvaluationContext(session, {
    participant_responses: answersToQcodeContext(schema, session.answers),
  })
  const results: QuotaCheckResult[] = []
  for (const rule of schema.quotas ?? []) {
    let matches = false
    try {
      matches = isRelevant(rule.expression, ctx)
    } catch {
      matches = false
    }
    if (!matches) continue
    const current = (session.quota_counts[rule.id] ?? 0) + 1
    results.push({
      filled: current > rule.target,
      rule_id: rule.id,
      label: rule.label || rule.id,
      current,
      target: rule.target,
    })
  }
  return results
}

export type NextPageResult =
  | { type: 'page'; routed: RoutedPage }
  | { type: 'complete' }
  | { type: 'quota_full'; rule_id: string; label: string }

/**
 * Calculate the next page for a participant session.
 * Skips blocks where all questions are irrelevant; terminates on filled quotas.
 */
export function getNextPage(
  schema: SurveySchema,
  session: ParticipantSession,
  fromBlockIndex?: number,
): NextPageResult {
  const quotaHits = checkQuotas(schema, session)
  const filled = quotaHits.find((q) => q.filled)
  if (filled) {
    return { type: 'quota_full', rule_id: filled.rule_id, label: filled.label }
  }

  const blocks = [...schema.blocks].sort((a, b) => a.sort_order - b.sort_order)
  const start = fromBlockIndex ?? session.current_block_index
  const ctx = buildEvaluationContext(session, {
    participant_responses: answersToQcodeContext(schema, session.answers),
  })

  for (let i = start; i < blocks.length; i++) {
    const block = blocks[i]
    if (!isBlockVisible(block, ctx, session.answers)) continue
    const questions = visibleQuestionsOnBlock(block, schema, session, ctx)
    if (questions.length === 0) continue
    const isLast = !blocks.slice(i + 1).some((b) => {
      if (!isBlockVisible(b, ctx, session.answers)) return false
      return visibleQuestionsOnBlock(b, schema, session, ctx).length > 0
    })
    return {
      type: 'page',
      routed: {
        block,
        block_index: i,
        questions,
        is_last: isLast,
      },
    }
  }

  return { type: 'complete' }
}

/** Advance session to the next visible block after current answers change. */
export function advanceSession(
  schema: SurveySchema,
  session: ParticipantSession,
): ParticipantSession {
  const next = getNextPage(schema, session, session.current_block_index)
  if (next.type === 'page') {
    return { ...session, current_block_index: next.routed.block_index, updated_at: Date.now() }
  }
  if (next.type === 'quota_full') {
    return {
      ...session,
      terminated: true,
      termination_reason: 'quota_full',
      updated_at: Date.now(),
    }
  }
  return session
}
