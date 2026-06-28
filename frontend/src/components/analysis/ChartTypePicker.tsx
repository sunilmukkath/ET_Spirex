import { useMemo, useState } from 'react'
import {
  CHART_CATEGORIES,
  chartTypesByCategory,
  getChartType,
  type ChartCategoryId,
  type ChartTypeId,
  type ChartTypeOption,
} from '../../lib/chartTypes'
import type { SurveyVariable } from '../../api/client'

export function chartShortLabel(id: ChartTypeId): string {
  return getChartType(id)?.shortLabel ?? id
}

interface Props {
  types: ChartTypeOption[]
  variable: SurveyVariable | null
  selected: ChartTypeId
  onSelect: (id: ChartTypeId) => void
  disabled?: boolean
  bannerSelected?: boolean
}

export function ChartTypePicker({
  types,
  variable,
  selected,
  onSelect,
  disabled,
  bannerSelected,
}: Props) {
  const categoriesWithTypes = useMemo(() => {
    return CHART_CATEGORIES.filter((cat) => types.some((t) => t.category === cat.id))
  }, [types])

  const [activeCategory, setActiveCategory] = useState<ChartCategoryId | 'all'>('all')

  const visibleTypes = useMemo(() => {
    if (activeCategory === 'all') return types
    return chartTypesByCategory(variable, activeCategory).filter((t) =>
      types.some((x) => x.id === t.id),
    )
  }, [activeCategory, types, variable])

  const selectedMeta = getChartType(selected)

  if (types.length === 0) {
    return (
      <p className="text-sm text-slate-400">Select a question to see available chart types.</p>
    )
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Chart type
        </p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {types.length} available
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            activeCategory === 'all'
              ? 'bg-slate-800 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All
        </button>
        {categoriesWithTypes.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              activeCategory === cat.id
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleTypes.map((t) => {
          const needsBanner = t.needsBanner && !bannerSelected
          const isActive = selected === t.id
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled || needsBanner}
              title={
                needsBanner
                  ? `${t.description} — select a banner variable first`
                  : t.description
              }
              onClick={() => onSelect(t.id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ring-1 ${
                isActive
                  ? 'bg-[var(--et-teal)] text-white ring-[var(--et-teal)] shadow-sm'
                  : needsBanner
                    ? 'cursor-not-allowed bg-slate-50 text-slate-300 ring-slate-200'
                    : t.tier === 'advanced'
                      ? 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 hover:ring-[var(--et-teal)]/40'
                      : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 hover:ring-[var(--et-teal)]/40'
              }`}
            >
              {t.shortLabel}
            </button>
          )
        })}
      </div>

      {selectedMeta?.description && (
        <p className="mt-2 text-xs text-slate-400">{selectedMeta.description}</p>
      )}
    </div>
  )
}
