/**
 * SPSS syntax + CSV data export from survey schema and response rows.
 */

import type { EtQuestion } from '../../api/client'
import { allQuestions, type SurveySchema } from './types'

function spssType(question: EtQuestion): string {
  switch (question.type) {
    case 'numeric':
    case 'scale':
      return 'F8.0'
    case 'multi':
    case 'ranking':
      return 'A255'
    default:
      return 'A255'
  }
}

function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function variableNames(question: EtQuestion): string[] {
  if (question.type === 'matrix' || question.type === 'array_carousel') {
    return (question.rows ?? []).map((r) => `${question.code}_${r.code}`)
  }
  if (question.type === 'gps') {
    return [`${question.code}GPSLat`, `${question.code}GPSLng`]
  }
  if (question.type === 'equation' || question.type === 'display') return []
  return [question.code]
}

export function exportToSpssSyntax(
  schema: SurveySchema,
  responses: Array<Record<string, unknown>> = [],
): { csvData: string; spssSyntax: string } {
  const questions = allQuestions(schema).filter(
    (q) => q.type !== 'display' && q.type !== 'equation',
  )
  const columns: string[] = []
  const varDefs: string[] = []
  const valueLabels: string[] = []

  for (const q of questions) {
    for (const col of variableNames(q)) {
      columns.push(col)
      varDefs.push(`  ${col} ${spssType(q)}`)
      if (q.options?.length) {
        valueLabels.push(`VALUE LABELS ${col}`)
        for (const opt of q.options) {
          const num = Number(opt.code)
          const code = Number.isFinite(num) ? String(num) : `'${opt.code.replace(/'/g, "''")}'`
          const label = opt.label.replace(/'/g, "''")
          valueLabels.push(`  ${code} '${label}'`)
        }
        valueLabels.push('.')
      }
    }
  }

  const header = ['response_id', ...columns].join(',')
  const rows = responses.map((row, idx) => {
    const cells = [
      escapeCsv(row.response_id ?? `R${idx + 1}`),
      ...columns.map((col) => escapeCsv(row[col] ?? '')),
    ]
    return cells.join(',')
  })

  const csvData = [header, ...rows].join('\n')
  const spssSyntax = [
    '* ET Scout SPSS syntax — generated from survey schema.',
    `* Survey version: ${schema.version}`,
    '',
    'DATA LIST FREE',
    `  /${columns.join(' ')}.`,
    '',
    'VARIABLE LABELS',
    ...questions.flatMap((q) => {
      const cols = variableNames(q)
      return cols.map((c) => `  ${c} '${q.text.replace(/'/g, "''")}'`)
    }),
    '.',
    '',
    ...varDefs,
    '.',
    '',
    ...valueLabels,
    '',
    "EXECUTE.",
  ].join('\n')

  return { csvData, spssSyntax }
}
