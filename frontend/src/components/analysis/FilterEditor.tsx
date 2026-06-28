import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Filter, Loader2, Pencil, X } from 'lucide-react'
import type { FilterGroup, FilterSpec, SurveyVariable } from '../../api/client'
import {
  buildDraftTree,
  collectFilterChips,
  emptyCondition,
  emptyGroup,
  sanitizeFilterTree,
  summarizeFilterTree,
} from '../../lib/filterTree'
import { GroupEditor, schemaFilterOptions } from './FilterRuleEditors'

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
}: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FilterGroup>(() => buildDraftTree(filterTree, filters))

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])

  useEffect(() => {
    if (open) {
      setDraft(buildDraftTree(filterTree, filters))
    }
  }, [open, filterTree, filters])

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

  function handleApply() {
    if (onFilterTreeChange) {
      const clean = sanitizeFilterTree(draft)
      onFilterTreeChange(clean)
      onChange([])
    } else {
      onChange([])
    }
    setOpen(false)
    onApply?.()
  }

  function handleClear() {
    onChange([])
    onFilterTreeChange?.(null)
    setDraft(emptyGroup())
    setOpen(false)
  }

  function openPanel() {
    if (!onFilterTreeChange) return
    if (!draft.children.length) {
      setDraft({ ...emptyGroup(), children: [emptyCondition()] })
    }
    setOpen(true)
  }

  return (
    <div className={compact ? '' : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Filter size={14} />
          {heading}
        </span>

        {!hasActiveFilters && !open && (
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
          onClick={() => (open ? setOpen(false) : openPanel())}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)] hover:text-[var(--et-teal-dark)]"
        >
          {hasActiveFilters ? <Pencil size={13} /> : <Filter size={13} />}
          {hasActiveFilters ? 'Edit filters' : 'Add filters'}
          <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
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

        {onApply && !open && (
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

      {open && onFilterTreeChange && (
        <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-[var(--et-teal-light)]/50 px-3 py-2 text-xs text-[var(--et-teal-dark)]">
            <strong>Tip:</strong> Pick a question, choose <em>equals</em> or <em>does not equal</em>,
            then select the answer. Use <em>All rules match</em> when every rule must pass, or{' '}
            <em>Any rule matches</em> for OR logic.
          </div>

          <GroupEditor
            group={draft}
            onChange={setDraft}
            variables={variables}
            surveyId={surveyId}
            completionStatus={completionStatus}
          />

          {preview && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Preview
              </p>
              <p className="mt-0.5 text-sm text-slate-700">{preview}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Clear all
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded-lg bg-[var(--et-teal)] px-4 py-1.5 text-xs font-medium text-white hover:brightness-110"
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      )}

      {open && !onFilterTreeChange && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Advanced filter rules are not available in this view.
        </div>
      )}
    </div>
  )
}
