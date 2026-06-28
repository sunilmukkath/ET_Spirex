import { useDeferredValue, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'

interface Props {
  variables: SurveyVariable[]
  groups: { id: number; title: string; variable_ids: string[] }[]
  selectedId: string | null
  onSelect: (id: string) => void
  disabled?: boolean
}

export function ChartVariablePicker({
  variables,
  groups,
  selectedId,
  onSelect,
  disabled,
}: Props) {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])

  const groupedOptions = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim()
    return groups
      .map((g) => ({
        title: g.title,
        vars: g.variable_ids
          .map((id) => varMap.get(id))
          .filter((v): v is SurveyVariable => {
            if (!v) return false
            if (!q) return true
            return (
              `${v.text ?? ''}`.toLowerCase().includes(q) ||
              `${v.code ?? ''}`.toLowerCase().includes(q)
            )
          }),
      }))
      .filter((g) => g.vars.length > 0)
  }, [groups, varMap, deferredSearch])

  const selected = selectedId ? varMap.get(selectedId) : null

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_minmax(0,2fr)] sm:items-end">
      <label className="block text-xs">
        <span className="font-semibold uppercase tracking-wide text-slate-500">Search</span>
        <div className="relative mt-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={14}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter questions…"
            disabled={disabled}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none ring-[var(--et-teal)] focus:ring-2 disabled:opacity-50"
          />
        </div>
      </label>

      <label className="block text-xs">
        <span className="font-semibold uppercase tracking-wide text-slate-500">
          Question / variable
        </span>
        <select
          value={selectedId ?? ''}
          onChange={(e) => e.target.value && onSelect(e.target.value)}
          disabled={disabled}
          className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-[var(--et-teal)] focus:ring-2 disabled:opacity-50"
        >
          <option value="">Choose a question…</option>
          {groupedOptions.map((group) => (
            <optgroup key={group.title} label={group.title}>
              {group.vars.map((v) => (
                <option key={v.id} value={v.id}>
                  [{v.code}] {v.text || v.code}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {selected && (
        <p className="text-[11px] text-slate-500 sm:col-span-2">
          <span className="font-medium text-slate-600">{selected.type_label}</span>
          {' · '}
          {selected.text}
        </p>
      )}
    </div>
  )
}
