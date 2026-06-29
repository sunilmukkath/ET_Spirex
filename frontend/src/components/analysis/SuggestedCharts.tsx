import { BarChart3 } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'
import { type ChartTypeId, defaultChartType, suggestedChartTypes } from '../../lib/chartTypes'

interface Props {
  variable: SurveyVariable
  onSelectChart: (chartType: ChartTypeId) => void
}

export function SuggestedCharts({ variable, onSelectChart }: Props) {
  const suggestions = suggestedChartTypes(variable, 4)
  if (suggestions.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-2 flex items-center gap-2">
        <BarChart3 size={16} className="text-[var(--et-teal)]" />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Suggested charts
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((chart) => (
          <button
            key={chart.id}
            type="button"
            onClick={() => onSelectChart(chart.id)}
            className="inline-flex flex-col items-start rounded-lg border border-white bg-white px-3 py-2 text-left shadow-sm transition hover:border-[var(--et-teal)]/40 hover:bg-[var(--et-teal-light)]/30"
            title={chart.description}
          >
            <span className="text-xs font-semibold text-slate-800">{chart.shortLabel}</span>
            <span className="mt-0.5 text-[10px] text-slate-500">{chart.description}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onSelectChart(defaultChartType(variable))}
          className="inline-flex items-center rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-[var(--et-teal)] hover:text-[var(--et-teal-dark)]"
        >
          Open Charts tab →
        </button>
      </div>
    </div>
  )
}
