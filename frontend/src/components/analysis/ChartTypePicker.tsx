import { useMemo, useState } from 'react'
import { Search, Star } from 'lucide-react'
import {
  CHART_CATEGORIES,
  CHART_TYPES,
  chartTypesForVariable,
  getChartType,
  type ChartCategoryId,
  type ChartTypeId,
  type ChartTypeOption,
} from '../../lib/chartTypes'
import type { SurveyVariable } from '../../api/client'
import { ChartTypeIcon } from '../../lib/chartTypeIcons'
import { suggestedChartTypes } from '../../lib/chartTypes'

export function chartShortLabel(id: ChartTypeId): string {
  return getChartType(id)?.shortLabel ?? id
}

interface Props {
  types?: ChartTypeOption[]
  selected: ChartTypeId
  onSelect: (id: ChartTypeId) => void
  disabled?: boolean
  variable?: SurveyVariable | null
}

export function ChartTypePicker({
  types: typesProp,
  selected,
  onSelect,
  disabled,
  variable,
}: Props) {
  const types = useMemo(() => {
    if (typesProp) return typesProp
    if (variable) return chartTypesForVariable(variable, 'all')
    return CHART_TYPES
  }, [typesProp, variable])

  const suggested = useMemo(
    () => new Set(suggestedChartTypes(variable ?? null, 5).map((t) => t.id)),
    [variable],
  )

  const categoriesWithTypes = useMemo(() => {
    return CHART_CATEGORIES.filter((cat) => types.some((t) => t.category === cat.id))
  }, [types])

  const [activeCategory, setActiveCategory] = useState<ChartCategoryId | 'all'>('all')
  const [search, setSearch] = useState('')

  const visibleTypes = useMemo(() => {
    let list = activeCategory === 'all' ? types : types.filter((t) => t.category === activeCategory)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (t) =>
          t.shortLabel.toLowerCase().includes(q) ||
          t.label.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      )
    }
    return list
  }, [activeCategory, types, search])

  const selectedMeta = getChartType(selected)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chart type</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {types.length} compatible
        </span>
      </div>

      <div className="relative mb-3">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chart types…"
          className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
        />
      </div>

      {!search && (
        <div className="mb-3 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
              activeCategory === 'all'
                ? 'bg-[var(--et-teal)] text-white'
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
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                activeCategory === cat.id
                  ? 'bg-[var(--et-teal)] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
        {visibleTypes.map((t) => {
          const isActive = selected === t.id
          const isSuggested = suggested.has(t.id)
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              title={t.description}
              onClick={() => onSelect(t.id)}
              className={`group relative flex flex-col items-start rounded-xl border p-3 text-left transition ${
                isActive
                  ? 'border-[var(--et-teal)] bg-[var(--et-teal-light)]/40 shadow-sm ring-1 ring-[var(--et-teal)]/30'
                  : 'border-slate-200 bg-white hover:border-[var(--et-teal)]/40 hover:shadow-sm'
              }`}
            >
              {isSuggested && (
                <span className="absolute right-2 top-2 text-amber-500" title="Recommended">
                  <Star size={12} className="fill-current" />
                </span>
              )}
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  isActive
                    ? 'bg-[var(--et-teal)] text-white'
                    : 'bg-slate-100 text-slate-600 group-hover:bg-[var(--et-teal-light)] group-hover:text-[var(--et-teal-dark)]'
                }`}
              >
                <ChartTypeIcon typeId={t.id} size={18} />
              </span>
              <span className="mt-2 text-xs font-semibold text-slate-900">{t.shortLabel}</span>
              <span className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-500">
                {t.description}
              </span>
              {(t.needsBanner || t.needsYVariable) && (
                <span className="mt-1.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">
                  {t.needsBanner ? 'Needs banner' : '2 variables'}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {visibleTypes.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">No chart types match your search.</p>
      )}

      {selectedMeta && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-800">{selectedMeta.label}.</span> {selectedMeta.description}
        </p>
      )}
    </div>
  )
}
