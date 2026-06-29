import type { DataQualityResult } from '../api/client'

export type QcCheckId =
  | 'speeders'
  | 'test_responses'
  | 'duplicate_phones'
  | 'straight_liners'
  | 'gibberish'

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
]

export interface QcFlaggedRow {
  response_id: string
  checks: QcCheckId[]
  severity: 'high' | 'medium' | 'low'
  detail: string
}

const SEVERITY_RANK: Record<'high' | 'medium' | 'low', number> = {
  high: 3,
  medium: 2,
  low: 1,
}

export function isCheckAvailable(id: QcCheckId, result: DataQualityResult): boolean {
  if (id === 'speeders') return result.speeders?.available !== false
  if (id === 'duplicate_phones') return result.duplicate_phones?.available !== false
  return true
}

export function checkCount(id: QcCheckId, result: DataQualityResult): number {
  if (id === 'speeders') return result.speeders?.count ?? 0
  if (id === 'test_responses') return result.test_responses?.count ?? 0
  if (id === 'duplicate_phones') return result.duplicate_phones?.count ?? 0
  if (id === 'straight_liners') return result.straight_liners?.count ?? 0
  return result.gibberish?.count ?? 0
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

export function allCheckIds(): QcCheckId[] {
  return QC_CHECKS.map((c) => c.id)
}

export function enabledChecksFromDisabled(disabled: string[]): Set<QcCheckId> {
  const disabledSet = new Set(disabled)
  return new Set(QC_CHECKS.map((c) => c.id).filter((id) => !disabledSet.has(id)))
}

export function disabledChecksFromEnabled(enabled: Set<QcCheckId>): string[] {
  return QC_CHECKS.map((c) => c.id).filter((id) => !enabled.has(id))
}

export function exportFlaggedCsv(rows: QcFlaggedRow[], filename = 'qc_flagged.csv') {
  const header = 'response_id,checks,severity,detail'
  const lines = rows.map((r) => {
    const checks = r.checks.join('|')
    const detail = r.detail.replace(/"/g, '""')
    return `${r.response_id},"${checks}",${r.severity},"${detail}"`
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
