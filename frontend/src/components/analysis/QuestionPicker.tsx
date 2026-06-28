import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'
import { KindBadge } from './Results'

interface Props {
  variables: SurveyVariable[]
  groups: { id: number; title: string; variable_ids: string[] }[]
  selectedId: string | null
  onSelect: (id: string) => void
  filterKinds?: string[]
  title?: string
  multiSelect?: boolean
  selectedIds?: string[]
  onMultiSelect?: (ids: string[]) => void
}

export function QuestionPicker({
  variables,
  groups,
  selectedId,
  onSelect,
  filterKinds,
  title = 'Questions',
  multiSelect = false,
  selectedIds = [],
  onMultiSelect,
}: Props) {
  const [search, setSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set(groups.map((g) => g.id)))

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])

  const filteredGroups = useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        vars: g.variable_ids
          .map((id) => varMap.get(id))
          .filter((v): v is SurveyVariable => {
            if (!v) return false
            if (filterKinds && !filterKinds.includes(v.kind)) return false
            if (search && !`${v.text ?? ''}`.toLowerCase().includes(search.toLowerCase()) && !`${v.code ?? ''}`.toLowerCase().includes(search.toLowerCase())) {
              return false
            }
            return true
          }),
      }))
      .filter((g) => g.vars.length > 0)
  }, [groups, varMap, filterKinds, search])

  function toggleGroup(gid: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(gid)) next.delete(gid)
      else next.add(gid)
      return next
    })
  }

  function handleClick(id: string) {
    if (multiSelect && onMultiSelect) {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
      onMultiSelect(next)
    } else {
      onSelect(id)
    }
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="search"
            placeholder="Search questions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs outline-none ring-[var(--et-teal)] focus:ring-1"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filteredGroups.map((group) => (
          <div key={group.id} className="mb-2">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <span>{group.title || `Group ${group.id}`}</span>
              <span className="text-slate-400">{group.vars.length}</span>
            </button>
            {expandedGroups.has(group.id) && (
              <ul className="ml-1 space-y-0.5">
                {group.vars.map((v) => {
                  const isSelected = multiSelect ? selectedIds.includes(v.id) : selectedId === v.id
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => handleClick(v.id)}
                        className={`w-full rounded-lg px-2 py-2 text-left transition ${
                          isSelected
                            ? 'bg-[var(--et-teal-light)] ring-1 ring-[var(--et-teal)]/25'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <KindBadge kind={v.kind} />
                          <span className="text-[10px] text-slate-400">{v.code}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-800">{v.text}</p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
