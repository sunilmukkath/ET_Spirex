import { useMemo, useState } from 'react'
import { Filter, Plus, X } from 'lucide-react'
import type { FilterSpec, SurveyVariable } from '../../api/client'

interface Props {
  variables: SurveyVariable[]
  filters: FilterSpec[]
  onChange: (filters: FilterSpec[]) => void
  compact?: boolean
}

function filterOptions(v: SurveyVariable): { code: string; label: string }[] {
  if (v.answer_options?.length) {
    return v.answer_options.map((o) => ({ code: o.code, label: o.label || o.code }))
  }
  if (v.subquestions?.length) {
    return v.subquestions.map((sq) => ({ code: sq.code, label: sq.label || sq.code }))
  }
  return []
}

export function FilterEditor({ variables, filters, onChange, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [draftVarId, setDraftVarId] = useState('')
  const [draftValues, setDraftValues] = useState<string[]>([])

  const filterableVars = useMemo(
    () =>
      variables.filter(
        (v) => v.can_filter && filterOptions(v).length > 0,
      ),
    [variables],
  )

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])
  const draftVar = draftVarId ? varMap.get(draftVarId) : null
  const draftOptions = draftVar ? filterOptions(draftVar) : []

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
    const opts = filterOptions(v)
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
          Filters
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
      </div>

      {open && (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
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
                  {v.text || v.code}
                </option>
              ))}
            </select>
          </label>

          {draftVar && draftOptions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Include responses where answer is:</p>
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
