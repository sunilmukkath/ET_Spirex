import { Filter, HelpCircle, Layers, Users } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'

const STATUS_LABELS: Record<string, string> = {
  complete: 'Completed responses',
  qc_approved: 'QC approved',
  all: 'All responses',
  incomplete: 'Incomplete only',
}

interface Props {
  responseCount: number
  questionCount: number
  groupCount: number
  variables: SurveyVariable[]
  completionStatus: string
  customVarCount?: number
  compact?: boolean
}

export function SurveyOverviewBar({
  responseCount,
  questionCount,
  groupCount,
  variables,
  completionStatus,
  customVarCount = 0,
  compact = false,
}: Props) {
  const bannerCount = variables.filter((v) => v.can_banner).length
  const filterCount = variables.filter((v) => v.can_filter).length
  const statusLabel = STATUS_LABELS[completionStatus] ?? completionStatus

  const metrics = [
    {
      icon: Users,
      label: 'Sample size',
      value: responseCount.toLocaleString(),
      hint: statusLabel,
    },
    {
      icon: HelpCircle,
      label: 'Questions',
      value: questionCount.toLocaleString(),
      hint: `${groupCount} section${groupCount === 1 ? '' : 's'}`,
    },
    {
      icon: Layers,
      label: 'Banner-ready',
      value: bannerCount.toLocaleString(),
      hint: 'Can use as crosstab columns',
    },
    {
      icon: Filter,
      label: 'Filterable',
      value: filterCount.toLocaleString(),
      hint: customVarCount > 0 ? `Includes ${customVarCount} custom` : 'Available for filters',
    },
  ]

  return (
    <div
      className={`grid gap-3 ${compact ? 'sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-4'}`}
    >
      {metrics.map(({ icon: Icon, label, value, hint }) => (
        <div
          key={label}
          className="et-metric-card px-4 py-3.5"
        >
          <div className="flex items-center gap-2 text-[var(--et-teal-dark)]">
            <Icon size={15} />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
        </div>
      ))}
    </div>
  )
}
