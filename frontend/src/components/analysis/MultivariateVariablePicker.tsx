import { useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'

interface Props {
  variables: SurveyVariable[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  mode: 'multi' | 'single'
  max?: number
  emptyMessage?: string
}

export function MultivariateVariablePicker({
  variables,
  selectedIds,
  onChange,
  mode,
  max = 12,
  emptyMessage = 'No matching variables',
}: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return variables
    return variables.filter(
      (v) =>
        v.code.toLowerCase().includes(q) ||
        (v.text || '').toLowerCase().includes(q) ||
        v.type_label.toLowerCase().includes(q),
    )
  }, [variables, query])

  function toggle(id: string) {
    if (mode === 'single') {
      onChange(selectedIds.includes(id) ? [] : [id])
      return
    }
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else if (selectedIds.length < max) {
      onChange([...selectedIds, id])
    }
  }

  function selectAll() {
    onChange(filtered.slice(0, max).map((v) => v.id))
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white ring-1 ring-slate-100">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <Search size={14} className="shrink-0 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>

      {mode === 'multi' && (
        <div className="flex items-center justify-between border-b border-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
          <span>
            {selectedIds.length} / {max} selected
          </span>
          <button
            type="button"
            onClick={selectAll}
            className="font-medium text-[var(--et-teal-dark)] hover:underline"
          >
            Select visible
          </button>
        </div>
      )}

      <ul className="max-h-56 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-slate-400">{emptyMessage}</li>
        )}
        {filtered.map((v) => {
          const selected = selectedIds.includes(v.id)
          const disabled = mode === 'multi' && !selected && selectedIds.length >= max
          return (
            <li key={v.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(v.id)}
                className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm transition ${
                  selected
                    ? 'bg-[var(--et-teal-light)]/60'
                    : disabled
                      ? 'opacity-40'
                      : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    selected
                      ? 'border-[var(--et-teal)] bg-[var(--et-teal)] text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selected && <Check size={10} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-800">{v.code}</span>
                  <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                    {v.type_label}
                  </span>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{v.text || v.code}</p>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function VariableSlotSelect({
  label,
  hint,
  value,
  onChange,
  variables,
}: {
  label: string
  hint?: string
  value: string
  onChange: (id: string) => void
  variables: SurveyVariable[]
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
      <MultivariateVariablePicker
        variables={variables}
        selectedIds={value ? [value] : []}
        onChange={(ids) => onChange(ids[0] ?? '')}
        mode="single"
      />
    </div>
  )
}
