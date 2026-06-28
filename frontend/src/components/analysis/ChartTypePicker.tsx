import { useMemo, useState } from 'react'
import {
  CHART_CATEGORIES,
  CHART_TYPES,
  getChartType,
  type ChartCategoryId,
  type ChartTypeId,
  type ChartTypeOption,
} from '../../lib/chartTypes'

export function chartShortLabel(id: ChartTypeId): string {
  return getChartType(id)?.shortLabel ?? id
}

interface Props {
  types?: ChartTypeOption[]
  selected: ChartTypeId
  onSelect: (id: ChartTypeId) => void
  disabled?: boolean
}

export function ChartTypePicker({ types = CHART_TYPES, selected, onSelect, disabled }: Props) {
  const categoriesWithTypes = useMemo(() => {
    return CHART_CATEGORIES.filter((cat) => types.some((t) => t.category === cat.id))
  }, [types])

  const [activeCategory, setActiveCategory] = useState<ChartCategoryId | 'all'>('all')

  const visibleTypes = useMemo(() => {
    if (activeCategory === 'all') return types
    return types.filter((t) => t.category === activeCategory)
  }, [activeCategory, types])

  const selectedMeta = getChartType(selected)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Step 1 · Chart type
        </p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {types.length} types
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
          const isActive = selected === t.id
          const slotHint = t.needsBanner
            ? ' · needs banner'
            : t.needsYVariable
              ? ' · 2 variables'
              : ''
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              title={`${t.description}${slotHint}`}
              onClick={() => onSelect(t.id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ring-1 ${
                isActive
                  ? 'bg-[var(--et-teal)] text-white ring-[var(--et-teal)] shadow-sm'
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
