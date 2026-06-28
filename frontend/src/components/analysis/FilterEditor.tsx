import { useEffect, useMemo, useState } from 'react'
import { Filter, Loader2, Plus, X } from 'lucide-react'
import { api, type FilterSpec, type SurveyVariable } from '../../api/client'

interface Props {
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  filters: FilterSpec[]
  onChange: (filters: FilterSpec[]) => void
  compact?: boolean
  heading?: string
  applyLabel?: string
  onApply?: () => void
  applying?: boolean
}

function schemaFilterOptions(v: SurveyVariable): { code: string; label: string }[] {
  if (v.answer_options?.length) {
    return v.answer_options.map((o) => ({ code: o.code, label: o.label || o.code }))
  }
  if (v.subquestions?.length) {
    return v.subquestions.map((sq) => ({ code: sq.code, label: sq.label || sq.code }))
  }
  return []
}

export function FilterEditor({
  surveyId,
  completionStatus,
  variables,
  filters,
  onChange,
  compact,
  heading = 'Filters',
  applyLabel,
  onApply,
  applying,
}: Props) {
  const [open, setOpen] = useState(false)
  const [draftVarId, setDraftVarId] = useState('')
  const [draftValues, setDraftValues] = useState<string[]>([])
  const [fetchedOptions, setFetchedOptions] = useState<{ code: string; label: string }[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  const filterableVars = useMemo(
    () =>
      variables.filter(
        (v) => v.can_filter && ['single', 'multi', 'numeric'].includes(v.kind),
      ),
    [variables],
  )

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])
  const draftVar = draftVarId ? varMap.get(draftVarId) : null

  useEffect(() => {
    if (!draftVarId || !draftVar) {
      setFetchedOptions([])
      setOptionsError(null)
      return
    }

    const fromSchema = schemaFilterOptions(draftVar)
    if (fromSchema.length > 0) {
      setFetchedOptions(fromSchema)
      setOptionsError(null)
      return
    }

    let cancelled = false
    setOptionsLoading(true)
    setOptionsError(null)
    api
      .getFilterOptions(surveyId, draftVarId, completionStatus)
      .then((res) => {
        if (cancelled) return
        if (res.error && !res.options.length) {
          setOptionsError(res.error)
          setFetchedOptions([])
        } else {
          setFetchedOptions(
            res.options.map((o) => ({ code: o.code, label: o.label || o.code })),
          )
          setOptionsError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOptionsError(err instanceof Error ? err.message : 'Could not load options')
          setFetchedOptions([])
        }
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [surveyId, completionStatus, draftVarId, draftVar])

  const draftOptions = fetchedOptions

  function removeFilter(index: number) {
    onChange(filters.filter((_, i) => i !== index))
  }

  function addFilter() {
    if (!draftVarId || draftValues.length === 0) return
    const existing = filters.findIndex((f) => f.variable_id === draftVarId)
    const next = [...filters]
    if (existing >= 0) {
      next[existing] = { variable_id: draftVarId, values: draftValues }
    } else {
      next.push({ variable_id: draftVarId, values: draftValues })
    }
    onChange(next)
    setDraftVarId('')
    setDraftValues([])
    setOpen(false)
  }

  function toggleDraftValue(code: string) {
    setDraftValues((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )
  }

  function labelForFilter(f: FilterSpec) {
    const v = varMap.get(f.variable_id)
    if (!v) return f.variable_id
    const opts = schemaFilterOptions(v)
    const labels = f.values.map(
      (code) => opts.find((o) => o.code === code)?.label || code,
    )
    return `${v.text || v.code}: ${labels.join(', ')}`
  }

  return (
    <div className={compact ? '' : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Filter size={14} />
          {heading}
        </span>

        {filters.map((f, i) => (
          <span
            key={`${f.variable_id}-${i}`}
            className="inline-flex max-w-xs items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-900 ring-1 ring-amber-200"
          >
            <span className="truncate">{labelForFilter(f)}</span>
            <button
              type="button"
              onClick={() => removeFilter(i)}
              className="shrink-0 rounded-full hover:bg-amber-100"
              aria-label="Remove filter"
            >
              <X size={12} />
            </button>
          </span>
        ))}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)] hover:text-[var(--et-teal-dark)]"
        >
          <Plus size={14} />
          Add filter
        </button>

        {filters.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
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

      {open && (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {filterableVars.length === 0 ? (
            <p className="text-sm text-slate-500">
              No filterable questions loaded yet. Wait for the survey to finish loading.
            </p>
          ) : (
            <>
              <label className="block text-xs">
                <span className="font-medium text-slate-600">Filter by question</span>
                <select
                  value={draftVarId}
                  onChange={(e) => {
                    setDraftVarId(e.target.value)
                    setDraftValues([])
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
                >
                  <option value="">Choose a question…</option>
                  {filterableVars.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code} — {(v.text || v.code).slice(0, 80)}
                    </option>
                  ))}
                </select>
              </label>

              {draftVar && optionsLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="animate-spin" size={16} />
                  Loading answer options…
                </div>
              )}

              {draftVar && optionsError && !optionsLoading && (
                <p className="text-sm text-amber-700">{optionsError}</p>
              )}

              {draftVar && !optionsLoading && draftOptions.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-600">
                    Include responses where answer is:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {draftOptions.map((opt) => {
                      const checked = draftValues.includes(opt.code)
                      return (
                        <label
                          key={opt.code}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ring-1 transition ${
                            checked
                              ? 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)] ring-[var(--et-teal)]/30'
                              : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => toggleDraftValue(opt.code)}
                          />
                          {opt.label}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {draftVar && !optionsLoading && draftOptions.length === 0 && !optionsError && (
                <p className="text-sm text-slate-500">No answer values found for this question.</p>
              )}
            </>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setDraftVarId('')
                setDraftValues([])
              }}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draftVarId || draftValues.length === 0}
              onClick={addFilter}
              className="rounded-lg bg-[var(--et-teal)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
            >
              Apply filter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
