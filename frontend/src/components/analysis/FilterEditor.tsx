import { useMemo, useState } from 'react'
import { ChevronDown, Filter, Loader2, Pencil, X } from 'lucide-react'
import type { FilterGroup, FilterSpec, SurveyVariable } from '../../api/client'
import {
  collectFilterChips,
  summarizeFilterTree,
  treeToFlatFilters,
} from '../../lib/filterTree'
import { schemaFilterOptions } from './FilterRuleEditors'
import { FilterPresetMenu } from './FilterPresetMenu'
import type { FilterPreset } from '../../api/client'
import { AdvancedFilterBuilder } from './AdvancedFilterBuilder'

interface Props {
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  filters: FilterSpec[]
  onChange: (filters: FilterSpec[]) => void
  filterTree?: FilterGroup | null
  onFilterTreeChange?: (tree: FilterGroup | null) => void
  compact?: boolean
  heading?: string
  applyLabel?: string
  onApply?: () => void
  applying?: boolean
  showPresets?: boolean
  onPresetApply?: (preset: FilterPreset) => void
}

export function FilterEditor({
  surveyId,
  completionStatus,
  variables,
  filters,
  onChange,
  filterTree = null,
  onFilterTreeChange,
  compact,
  heading = 'Filters',
  applyLabel,
  onApply,
  applying,
  showPresets,
  onPresetApply,
}: Props) {
  const [open, setOpen] = useState(false)

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])

  const varLabel = (id: string) => {
    const v = varMap.get(id)
    return v ? (v.text || v.code).slice(0, 40) : id
  }

  const valueLabel = (varId: string, code: string) => {
    const v = varMap.get(varId)
    if (!v) return code
    const opts = schemaFilterOptions(v)
    return opts.find((o) => o.code === code)?.label || code
  }

  const chips = useMemo(
    () => collectFilterChips(filters, filterTree, varLabel, valueLabel),
    [filters, filterTree, variables],
  )

  const hasActiveFilters = chips.length > 0
  const preview =
    filterTree && filterTree.children.length
      ? summarizeFilterTree(filterTree, varLabel, valueLabel)
      : chips.map((c) => c.text).join(' AND ')

  function handleModalApply(tree: FilterGroup | null) {
    if (onFilterTreeChange) {
      onFilterTreeChange(tree)
      onChange([])
    } else {
      onChange(treeToFlatFilters(tree))
    }
    setOpen(false)
    onApply?.()
  }

  function handleClear() {
    onChange([])
    onFilterTreeChange?.(null)
    setOpen(false)
  }

  return (
    <div className={compact ? '' : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Filter size={14} />
          {heading}
        </span>

        {!hasActiveFilters && (
          <span className="text-xs text-slate-400">No filters — showing all responses</span>
        )}

        {chips.map((chip) => (
          <span
            key={chip.id}
            className={`inline-flex max-w-md items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ${
              chip.tone === 'advanced'
                ? 'bg-violet-50 text-violet-900 ring-violet-200'
                : 'bg-amber-50 text-amber-900 ring-amber-200'
            }`}
            title={chip.text}
          >
            <span className="truncate">{chip.text}</span>
          </span>
        ))}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)] hover:text-[var(--et-teal-dark)]"
        >
          {hasActiveFilters ? <Pencil size={13} /> : <Filter size={13} />}
          {hasActiveFilters ? 'Edit filters' : 'Add filters'}
          <ChevronDown size={13} />
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
          >
            <X size={12} />
            Clear all
          </button>
        )}

        {onApply && (
          <button
            type="button"
            onClick={onApply}
            disabled={applying}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {applying && <Loader2 className="animate-spin" size={12} />}
            {applyLabel ?? 'Apply filters'}
          </button>
        )}
      </div>

      {preview && hasActiveFilters && (
        <p className="mt-2 text-xs text-slate-500" title={preview}>
          <span className="font-medium text-slate-600">Active: </span>
          <span className="line-clamp-2">{preview}</span>
        </p>
      )}

      {showPresets && onPresetApply && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <FilterPresetMenu
            surveyId={surveyId}
            filters={filters}
            filterTree={filterTree}
            onApply={onPresetApply}
          />
        </div>
      )}

      <AdvancedFilterBuilder
        open={open}
        onClose={() => setOpen(false)}
        surveyId={surveyId}
        completionStatus={completionStatus}
        variables={variables}
        value={filterTree}
        filters={onFilterTreeChange ? [] : filters}
        onApply={handleModalApply}
      />
    </div>
  )
}
