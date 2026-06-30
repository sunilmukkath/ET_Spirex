import type { DataQualityResult } from '../api/client'

export type QcCheckId =
  | 'speeders'
  | 'test_responses'
  | 'duplicate_phones'
  | 'straight_liners'
  | 'gibberish'
  | 'interviewer_duplicates'
  | 'custom_rules'

export const QC_CHECKS: {
  id: QcCheckId
  title: string
  description: string
  severity: 'high' | 'medium' | 'low'
}[] = [
  {
    id: 'speeders',
    title: 'Speeders',
    description: 'Finished much faster than typical completion time',
    severity: 'high',
  },
  {
    id: 'test_responses',
    title: 'Test / dummy',
    description: 'Names or text containing test, dummy, fake, asdf, etc.',
    severity: 'high',
  },
  {
    id: 'duplicate_phones',
    title: 'Duplicate phones',
    description: 'Same phone on multiple records — keep one, flag the rest',
    severity: 'medium',
  },
  {
    id: 'straight_liners',
    title: 'Straight-lining',
    description: 'Identical answers across all items in a grid question',
    severity: 'medium',
  },
  {
    id: 'gibberish',
    title: 'Gibberish text',
    description: 'Keyboard mash or meaningless open-ended answers',
    severity: 'low',
  },
  {
    id: 'interviewer_duplicates',
    title: 'Interviewer duplicate answers',
    description: 'Same answers on most questions vs another record by the same interviewer',
    severity: 'high',
  },
]

export const CUSTOM_RULES_CHECK = {
  id: 'custom_rules' as const,
  title: 'Custom rules',
  description: 'Responses matching your custom variable conditions',
  severity: 'medium' as const,
}

export interface QcFlaggedRow {
  response_id: string
  checks: QcCheckId[]
  severity: 'high' | 'medium' | 'low'
  detail: string
  interviewer?: string
}

const SEVERITY_RANK: Record<'high' | 'medium' | 'low', number> = {
  high: 3,
  medium: 2,
  low: 1,
}

export function isCheckAvailable(id: QcCheckId, result: DataQualityResult): boolean {
  if (id === 'speeders') return result.speeders?.available !== false
  if (id === 'duplicate_phones') return result.duplicate_phones?.available !== false
  if (id === 'interviewer_duplicates') return result.interviewer_duplicates?.available !== false
  if (id === 'custom_rules') return (result.custom_rules?.count ?? 0) > 0 || result.custom_rules?.available === true
  return true
}

export function checkCount(id: QcCheckId, result: DataQualityResult): number {
  if (id === 'speeders') return result.speeders?.count ?? 0
  if (id === 'test_responses') return result.test_responses?.count ?? 0
  if (id === 'duplicate_phones') return result.duplicate_phones?.count ?? 0
  if (id === 'straight_liners') return result.straight_liners?.count ?? 0
  if (id === 'gibberish') return result.gibberish?.count ?? 0
  if (id === 'interviewer_duplicates') return result.interviewer_duplicates?.count ?? 0
  if (id === 'custom_rules') return result.custom_rules?.count ?? 0
  return 0
}

export function aggregateFlaggedRows(
  result: DataQualityResult,
  includeChecks?: Set<QcCheckId>,
): QcFlaggedRow[] {
  const byId = new Map<string, QcFlaggedRow>()

  function add(
    responseId: string | number,
    check: QcCheckId,
    severity: 'high' | 'medium' | 'low',
    detail: string,
  ) {
    if (includeChecks && !includeChecks.has(check)) return
    const id = String(responseId)
    const existing = byId.get(id)
    if (existing) {
      if (!existing.checks.includes(check)) existing.checks.push(check)
      if (SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity]) {
        existing.severity = severity
      }
      if (!existing.detail.includes(detail)) {
        existing.detail = existing.detail ? `${existing.detail}; ${detail}` : detail
      }
      return
    }
    byId.set(id, { response_id: id, checks: [check], severity, detail })
  }

  for (const f of result.speeders?.flags ?? []) {
    add(f.response_id, 'speeders', 'high', f.reason ?? `Completed in ${f.seconds}s`)
  }
  for (const f of result.test_responses?.flags ?? []) {
    add(f.response_id, 'test_responses', 'high', `${f.field}: "${f.text}"`)
  }
  for (const f of result.duplicate_phones?.flags ?? []) {
    add(
      f.response_id,
      'duplicate_phones',
      'medium',
      f.reason ?? `Duplicate phone ${f.phone ?? ''}`.trim(),
    )
  }
  for (const f of result.straight_liners?.flags ?? []) {
    add(
      f.response_id,
      'straight_liners',
      'medium',
      `${f.question} · "${f.value}" × ${f.items} items`,
    )
  }
  for (const f of result.gibberish?.flags ?? []) {
    add(f.response_id, 'gibberish', 'low', `${f.question}: "${f.text}"`)
  }
  for (const f of result.interviewer_duplicates?.flags ?? []) {
    add(
      f.response_id,
      'interviewer_duplicates',
      'high',
      f.reason ??
        `${f.similarity_pct ?? '?'}% match with ${f.match_response_id ?? 'another record'} (${f.interviewer ?? 'interviewer'})`,
    )
  }
  for (const f of result.custom_rules?.flags ?? []) {
    add(f.response_id, 'custom_rules', 'medium', f.reason ?? f.rule_name ?? 'Custom rule')
  }

  return [...byId.values()].sort((a, b) => {
    const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    if (sev !== 0) return sev
    return a.response_id.localeCompare(b.response_id, undefined, { numeric: true })
  })
}

export function normalizeQcResult(result: DataQualityResult): DataQualityResult {
  const emptyFlags = { count: 0, flags: [] as never[] }
  return {
    ...result,
    total_responses: result.total_responses ?? 0,
    flagged_count: result.flagged_count ?? 0,
    speeders: result.speeders ?? { ...emptyFlags, available: false },
    test_responses: result.test_responses ?? emptyFlags,
    duplicate_phones: result.duplicate_phones ?? {
      ...emptyFlags,
      available: false,
      exclude_count: 0,
      groups: [],
    },
    straight_liners: result.straight_liners ?? emptyFlags,
    gibberish: result.gibberish ?? emptyFlags,
    interviewer_duplicates: result.interviewer_duplicates ?? {
      ...emptyFlags,
      available: false,
      by_interviewer: [],
    },
    custom_rules: result.custom_rules ?? emptyFlags,
  }
}

export function computeQcMetrics(
  result: DataQualityResult,
  enabledChecks: Set<QcCheckId>,
) {
  const total = result.total_responses ?? 0
  const rows = aggregateFlaggedRows(result, enabledChecks)
  const flagged = rows.length
  const clean = Math.max(0, total - flagged)
  const passRate = total > 0 ? (clean / total) * 100 : 100
  return { total, flagged, clean, passRate }
}

const ALL_QC_CHECK_IDS: QcCheckId[] = [...QC_CHECKS.map((c) => c.id), 'custom_rules']

export function allCheckIds(): QcCheckId[] {
  return ALL_QC_CHECK_IDS
}

export function enabledChecksFromDisabled(disabled: string[]): Set<QcCheckId> {
  const disabledSet = new Set(disabled)
  return new Set(ALL_QC_CHECK_IDS.filter((id) => !disabledSet.has(id)))
}

export function disabledChecksFromEnabled(enabled: Set<QcCheckId>): string[] {
  return ALL_QC_CHECK_IDS.filter((id) => !enabled.has(id))
}

export interface QcReviewState {
  kept: Set<string>
  excluded: Set<string>
}

export function isIncludedInQcSample(
  responseId: string,
  flaggedIds: Set<string>,
  review: QcReviewState,
): boolean {
  if (review.excluded.has(responseId)) return false
  if (flaggedIds.has(responseId) && !review.kept.has(responseId)) return false
  return true
}

export function setQcSampleInclusion(
  responseId: string,
  include: boolean,
  flaggedIds: Set<string>,
  review: QcReviewState,
): QcReviewState {
  const kept = new Set(review.kept)
  const excluded = new Set(review.excluded)
  if (include) {
    excluded.delete(responseId)
    if (flaggedIds.has(responseId)) kept.add(responseId)
    else kept.delete(responseId)
  } else {
    kept.delete(responseId)
    excluded.add(responseId)
  }
  return { kept, excluded }
}

export function enrichFlaggedRowsWithInterviewers(
  rows: QcFlaggedRow[],
  labels: Record<string, string>,
): QcFlaggedRow[] {
  if (!Object.keys(labels).length) return rows
  return rows.map((row) => ({
    ...row,
    interviewer: labels[row.response_id] || '—',
  }))
}

export function exportFlaggedCsv(rows: QcFlaggedRow[], filename = 'qc_flagged.csv') {
  const hasInterviewer = rows.some((r) => r.interviewer)
  const header = hasInterviewer
    ? 'response_id,interviewer,checks,severity,detail'
    : 'response_id,checks,severity,detail'
  const lines = rows.map((r) => {
    const checks = r.checks.join('|')
    const detail = r.detail.replace(/"/g, '""')
    const interviewer = (r.interviewer ?? '').replace(/"/g, '""')
    return hasInterviewer
      ? `${r.response_id},"${interviewer}","${checks}",${r.severity},"${detail}"`
      : `${r.response_id},"${checks}",${r.severity},"${detail}"`
  })
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function qcCacheKey(surveyId: number) {
  return `et_scout_qc_${surveyId}`
}
