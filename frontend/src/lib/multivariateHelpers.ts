import type { AdvancedAnalysisResult } from '../api/client'

export function formatPValue(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return '—'
  if (p < 0.001) return '< 0.001'
  return p.toFixed(4)
}

export function significanceLevel(p: number | null | undefined): 'high' | 'medium' | 'none' | null {
  if (p == null || Number.isNaN(p)) return null
  if (p < 0.01) return 'high'
  if (p < 0.05) return 'medium'
  return 'none'
}

export function significanceLabel(p: number | null | undefined): string {
  const level = significanceLevel(p)
  if (level === 'high') return 'Highly significant (p < 0.01)'
  if (level === 'medium') return 'Significant (p < 0.05)'
  if (level === 'none') return 'Not significant (p ≥ 0.05)'
  return ''
}

export function correlationColor(r: number | null): string {
  if (r == null || Number.isNaN(r)) return '#f8fafc'
  const clamped = Math.max(-1, Math.min(1, r))
  if (clamped >= 0) {
    const t = clamped
    const r8 = Math.round(240 - t * 200)
    const g8 = Math.round(249 - t * 80)
    const b8 = Math.round(248 - t * 60)
    return `rgb(${r8}, ${g8}, ${b8})`
  }
  const t = Math.abs(clamped)
  const r8 = Math.round(254 - t * 40)
  const g8 = Math.round(242 - t * 120)
  const b8 = Math.round(242 - t * 20)
  return `rgb(${r8}, ${g8}, ${b8})`
}

export function correlationTextColor(r: number | null): string {
  if (r == null) return '#64748b'
  return Math.abs(r) > 0.55 ? '#ffffff' : '#1e293b'
}

export function strengthLabel(r: number): string {
  const a = Math.abs(r)
  if (a >= 0.7) return 'Strong'
  if (a >= 0.4) return 'Moderate'
  if (a >= 0.2) return 'Weak'
  return 'Negligible'
}

export function analysisTitle(type: string): string {
  const titles: Record<string, string> = {
    correlation: 'Correlation matrix',
    regression: 'Linear regression',
    chi_square: 'Chi-square test of association',
    ttest: 'Independent samples t-test',
    anova: 'One-way ANOVA',
    describe: 'Descriptive statistics',
  }
  return titles[type] ?? 'Analysis results'
}

export function canRunAnalysis(
  type: string,
  opts: {
    variableIds: string[]
    dependentId: string
    independentIds: string[]
    groupVariableId: string
    numericVariableId: string
  },
): { ok: boolean; hint: string } {
  switch (type) {
    case 'correlation':
      return opts.variableIds.length >= 2
        ? { ok: true, hint: `${opts.variableIds.length} variables selected` }
        : { ok: false, hint: 'Select at least 2 numeric variables' }
    case 'describe':
      return opts.variableIds.length >= 1
        ? { ok: true, hint: `${opts.variableIds.length} variables selected` }
        : { ok: false, hint: 'Select at least 1 numeric variable' }
    case 'regression':
      if (!opts.dependentId) return { ok: false, hint: 'Choose a dependent (Y) variable' }
      if (!opts.independentIds.length) return { ok: false, hint: 'Choose at least one predictor (X)' }
      return { ok: true, hint: `${opts.independentIds.length} predictor(s) selected` }
    case 'chi_square':
      if (opts.variableIds.length < 2) return { ok: false, hint: 'Select two categorical variables' }
      return { ok: true, hint: 'Two categorical variables selected' }
    case 'ttest':
    case 'anova':
      if (!opts.numericVariableId) return { ok: false, hint: 'Choose a numeric outcome variable' }
      if (!opts.groupVariableId) return { ok: false, hint: 'Choose a grouping variable' }
      return { ok: true, hint: 'Ready to compare groups' }
    default:
      return { ok: false, hint: 'Select variables' }
  }
}

export function buildExportCsv(result: AdvancedAnalysisResult): string {
  const lines: string[] = []
  if (result.analysis_type === 'correlation' && result.matrix && result.variables) {
    const headers = ['Variable', ...result.variables.map((v) => v.label || v.id)]
    lines.push(headers.map(escapeCsv).join(','))
    for (const row of result.matrix) {
      lines.push(
        [row.label || row.variable_id, ...result.variables!.map((v) => row.values[v.id] ?? '')]
          .map(escapeCsv)
          .join(','),
      )
    }
  } else if (result.analysis_type === 'regression') {
    lines.push('Coefficient,Estimate')
    for (const c of result.coefficients ?? []) {
      lines.push(`${escapeCsv(c.name)},${c.estimate}`)
    }
  } else if (result.analysis_type === 'describe') {
    lines.push('Variable,n,Mean,Median,Std,Min,Max')
    for (const r of result.rows ?? []) {
      lines.push(
        [r.label, r.n, r.mean, r.median, r.std, r.min, r.max].map(escapeCsv).join(','),
      )
    }
  } else if (result.analysis_type === 'anova') {
    lines.push('Group,n,Mean,Std')
    for (const g of result.groups ?? []) {
      lines.push([g.label, g.n, g.mean, g.std].map(escapeCsv).join(','))
    }
  }
  return lines.join('\n')
}

function escapeCsv(v: unknown): string {
  const s = String(v ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
