/**
 * Static analysis compiler for survey logic — variable verification, syntax, cycles.
 */

import { evaluateExpression } from './expressionEngine'
import { allQuestions, qcodeIndex, type LogicDiagnostic, type SurveySchema, type ValidationReport } from './types'

const IDENT_RE = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g
const EXPR_IN_TEXT_RE = /\{([^{}]+)\}/g
const RESERVED = new Set([
  'if',
  'sum',
  'count',
  'rand',
  'array_filter',
  'and',
  'or',
  'not',
  'true',
  'false',
])

function extractIdentifiers(expression: string): string[] {
  const ids = new Set<string>()
  let m: RegExpExecArray | null
  const re = new RegExp(IDENT_RE.source, 'g')
  while ((m = re.exec(expression)) !== null) {
    const name = m[1]
    if (!RESERVED.has(name)) ids.add(name)
  }
  return [...ids]
}

function collectExpressions(schema: SurveySchema): Array<{ qcode: string; field: string; expr: string }> {
  const rows: Array<{ qcode: string; field: string; expr: string }> = []
  const blocks = [...schema.blocks].sort((a, b) => a.sort_order - b.sort_order)
  for (const block of blocks) {
    if (block.relevance_equation?.trim()) {
      rows.push({ qcode: block.title || block.id, field: 'block.relevance_equation', expr: block.relevance_equation })
    }
    const questions = [...block.questions].sort((a, b) => a.sort_order - b.sort_order)
    for (const q of questions) {
      if (q.relevance_equation?.trim()) {
        rows.push({ qcode: q.code, field: 'relevance_equation', expr: q.relevance_equation })
      }
      if (q.validation_equation?.trim()) {
        rows.push({ qcode: q.code, field: 'validation_equation', expr: q.validation_equation })
      }
      if (q.equation?.trim()) {
        rows.push({ qcode: q.code, field: 'equation', expr: q.equation })
      }
      for (const match of q.text.matchAll(EXPR_IN_TEXT_RE)) {
        rows.push({ qcode: q.code, field: 'text', expr: match[1].trim() })
      }
    }
  }
  for (const quota of schema.quotas ?? []) {
    if (quota.expression?.trim()) {
      rows.push({ qcode: quota.id, field: 'quota.expression', expr: quota.expression })
    }
  }
  return rows
}

function questionOrder(schema: SurveySchema): Map<string, number> {
  const order = new Map<string, number>()
  allQuestions(schema).forEach((q, idx) => order.set(q.code, idx))
  return order
}

/** Detect circular relevance dependencies between Qcodes. */
function detectCycles(schema: SurveySchema): LogicDiagnostic[] {
  const graph = new Map<string, Set<string>>()
  for (const row of collectExpressions(schema)) {
    if (!row.field.includes('relevance') && row.field !== 'quota.expression') continue
    const deps = extractIdentifiers(row.expr)
    if (!graph.has(row.qcode)) graph.set(row.qcode, new Set())
    for (const dep of deps) graph.get(row.qcode)!.add(dep)
  }

  const diagnostics: LogicDiagnostic[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []

  function dfs(node: string) {
    if (visited.has(node)) return
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node)
      const cycle = stack.slice(cycleStart).concat(node).join(' → ')
      diagnostics.push({
        severity: 'error',
        qcode: node,
        field: 'relevance_equation',
        message: `Circular logic dependency: ${cycle}`,
      })
      return
    }
    visiting.add(node)
    stack.push(node)
    for (const next of graph.get(node) ?? []) dfs(next)
    stack.pop()
    visiting.delete(node)
    visited.add(node)
  }

  for (const node of graph.keys()) dfs(node)
  return diagnostics
}

export function validateSurveyLogic(schema: SurveySchema): ValidationReport {
  const diagnostics: LogicDiagnostic[] = []
  const codes = qcodeIndex(schema)
  const order = questionOrder(schema)
  const expressions = collectExpressions(schema)

  for (const row of expressions) {
    try {
      evaluateExpression(row.expr, {
        participant_responses: Object.fromEntries([...codes.keys()].map((k) => [k, ''])),
        panel_metadata: {},
        system_variables: {},
      })
    } catch (err) {
      diagnostics.push({
        severity: 'error',
        qcode: row.qcode,
        field: row.field,
        expression: row.expr,
        message: err instanceof Error ? err.message : 'Syntax error',
      })
      continue
    }

    for (const id of extractIdentifiers(row.expr)) {
      if (!codes.has(id)) {
        diagnostics.push({
          severity: 'error',
          qcode: row.qcode,
          field: row.field,
          expression: row.expr,
          message: `Unknown Qcode '${id}'`,
        })
        continue
      }
      const refOrder = order.get(id)
      const selfOrder = order.get(row.qcode)
      if (refOrder !== undefined && selfOrder !== undefined && refOrder > selfOrder) {
        diagnostics.push({
          severity: 'future_ref',
          qcode: row.qcode,
          field: row.field,
          expression: row.expr,
          message: `Reference to '${id}' which appears on a later page`,
        })
      }
    }
  }

  const codeList = [...codes.keys()]
  const dupes = codeList.filter((c, i) => codeList.indexOf(c) !== i)
  for (const d of [...new Set(dupes)]) {
    diagnostics.push({
      severity: 'error',
      qcode: d,
      field: 'code',
      message: `Duplicate Qcode '${d}'`,
    })
  }

  diagnostics.push(...detectCycles(schema))

  return {
    diagnostics,
    has_errors: diagnostics.some((d) => d.severity === 'error'),
    has_future_refs: diagnostics.some((d) => d.severity === 'future_ref'),
  }
}

/** Categorize expressions for syntax-highlighting in the builder UI. */
export function logicHighlightTokens(
  schema: SurveySchema,
  expression: string,
  qcode: string,
): Array<{ text: string; severity: 'valid' | 'future_ref' | 'error' }> {
  const report = validateSurveyLogic(schema)
  const related = report.diagnostics.filter((d) => d.expression === expression && d.qcode === qcode)
  if (related.some((d) => d.severity === 'error')) {
    return [{ text: expression, severity: 'error' }]
  }
  if (related.some((d) => d.severity === 'future_ref')) {
    return [{ text: expression, severity: 'future_ref' }]
  }
  return [{ text: expression, severity: 'valid' }]
}
