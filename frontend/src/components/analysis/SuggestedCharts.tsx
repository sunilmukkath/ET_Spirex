import { Sparkles } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'
import { type ChartTypeId, defaultChartType, suggestedChartTypes } from '../../lib/chartTypes'
import { ChartTypeIcon } from '../../lib/chartTypeIcons'

interface Props {
  variable: SurveyVariable
  selectedChartType?: ChartTypeId
  onSelectChart: (chartType: ChartTypeId) => void
}

export function SuggestedCharts({ variable, selectedChartType, onSelectChart }: Props) {
  const suggestions = suggestedChartTypes(variable, 4)
  if (suggestions.length === 0) return null

  return (
    <div className="rounded-xl border border-[var(--et-teal)]/20 bg-gradient-to-br from-[var(--et-teal-light)]/30 to-white p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles size={14} className="text-[var(--et-teal)]" />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--et-teal-dark)]">
          Recommended for {variable.code}
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {suggestions.map((chart) => {
          const active = selectedChartType != null && selectedChartType === chart.id
          return (
            <button
              key={chart.id}
              type="button"
              onClick={() => onSelectChart(chart.id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                active
                  ? 'border-[var(--et-teal)] bg-white shadow-sm'
                  : 'border-white/80 bg-white/70 hover:border-[var(--et-teal)]/40 hover:bg-white'
              }`}
              title={chart.description}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-md ${
                  active ? 'bg-[var(--et-teal)] text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <ChartTypeIcon typeId={chart.id} size={16} />
              </span>
              <span>
                <span className="block text-xs font-semibold text-slate-800">{chart.shortLabel}</span>
                <span className="block max-w-[8rem] truncate text-[10px] text-slate-500">{chart.description}</span>
              </span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => onSelectChart(defaultChartType(variable))}
          className="shrink-0 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[10px] font-medium text-slate-500 hover:border-[var(--et-teal)] hover:text-[var(--et-teal-dark)]"
        >
          Best default
        </button>
      </div>
    </div>
  )
}
