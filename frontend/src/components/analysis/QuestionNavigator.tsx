import { memo, useDeferredValue, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'

const KIND_LABELS: Record<string, string> = {
  single: 'Choice',
  multi: 'Multi',
  array: 'Grid',
  numeric: 'Numeric',
  text: 'Text',
  rank: 'Rank',
  location: 'GPS',
  custom: 'Custom',
}

const KIND_DOT: Record<string, string> = {
  single: 'bg-sky-400',
  multi: 'bg-violet-400',
  array: 'bg-indigo-400',
  numeric: 'bg-amber-400',
  text: 'bg-slate-400',
  rank: 'bg-pink-400',
  location: 'bg-emerald-400',
  custom: 'bg-[var(--et-gold)]',
}

interface Props {
  variables: SurveyVariable[]
  groups: { id: number; title: string; variable_ids: string[] }[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
  compareMode?: boolean
  compareIds?: string[]
  onCompareToggle?: (id: string) => void
  onCompareRemove?: (id: string) => void
  sideRowIds?: string[]
  onSideRowToggle?: (id: string) => void
  onAfterSelect?: () => void
  className?: string
}

export const QuestionNavigator = memo(function QuestionNavigator({
  variables,
  groups,
  selectedId,
  onSelect,
  loading,
  compareMode,
  compareIds = [],
  onCompareToggle,
  onCompareRemove,
  sideRowIds = [],
  onSideRowToggle,
  onAfterSelect,
  className = '',
}: Props) {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(groups.map((g) => g.id)))

  const compareSet = useMemo(() => new Set(compareIds), [compareIds])
  const sideRowSet = useMemo(() => new Set(sideRowIds), [sideRowIds])
  const primarySideRowId = sideRowIds[0] ?? null

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])

  const filteredGroups = useMemo(() => {
    const q = deferredSearch.toLowerCase()
    return groups
      .map((g) => ({
        ...g,
        vars: g.variable_ids
          .map((id) => varMap.get(id))
          .filter((v): v is SurveyVariable => {
            if (!v) return false
            if (compareMode && !v.can_banner) return false
            if (q && !`${v.text ?? ''}`.toLowerCase().includes(q) && !`${v.code ?? ''}`.toLowerCase().includes(q)) return false
            return true
          }),
      }))
      .filter((g) => g.vars.length > 0)
  }, [groups, varMap, deferredSearch, compareMode])

  if (loading) {
    return (
      <aside className={`et-sidebar ${className}`.trim()}>
        <div className="et-sidebar-header">
          <div className="skeleton h-9 rounded-lg" />
        </div>
        <div className="space-y-3 p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-12 rounded-lg opacity-40" />
          ))}
        </div>
      </aside>
    )
  }

  return (
    <aside className={`et-sidebar ${className}`.trim()}>
      <div className="et-sidebar-header">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {compareMode ? 'Side / Banners' : 'Questions'}
        </p>
        {compareMode && (
          <p className="mb-2.5 text-[10px] leading-snug text-slate-500">
            Click = primary side row · <span className="text-indigo-300">S</span> = side row ·{' '}
            <span className="text-[var(--et-teal-light)]">+</span> = banner
          </p>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
          <input
            type="search"
            placeholder="Search questions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="et-sidebar-search"
          />
        </div>
      </div>

      <div className="sidebar-scroll flex-1 overflow-y-auto px-2 py-3">
        {filteredGroups.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">No questions match</p>
        ) : (
          filteredGroups.map((group) => (
            <div key={group.id} className="mb-1">
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    if (next.has(group.id)) next.delete(group.id)
                    else next.add(group.id)
                    return next
                  })
                }
                className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200"
              >
                {expanded.has(group.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="truncate">{group.title || `Section ${group.id}`}</span>
                <span className="ml-auto text-slate-600">{group.vars.length}</span>
              </button>
              {expanded.has(group.id) && (
                <ul className="mt-0.5 space-y-0.5 pb-2">
                  {group.vars.map((v) => {
                    const isBanner = compareSet.has(v.id)
                    const isSideRow = sideRowSet.has(v.id)
                    const isPrimarySideRow = compareMode && primarySideRowId === v.id
                    const canAddBanner = compareMode && onCompareToggle && v.can_banner

                    return (
                      <li key={v.id}>
                        <div
                          className={`group flex items-stretch rounded-lg transition ${
                            isPrimarySideRow
                              ? 'bg-[var(--sidebar-active)] ring-1 ring-indigo-400/40'
                              : isSideRow
                                ? 'bg-indigo-500/10 ring-1 ring-indigo-400/20'
                                : selectedId === v.id
                                  ? 'bg-[var(--sidebar-active)] ring-1 ring-[var(--et-teal)]/30'
                                  : 'hover:bg-[var(--sidebar-hover)]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelect(v.id)
                              onAfterSelect?.()
                            }}
                            className="min-w-0 flex-1 px-3 py-2.5 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[v.kind] || 'bg-slate-500'}`} />
                              <span className="text-[10px] font-medium text-slate-500">{KIND_LABELS[v.kind] || v.kind}</span>
                              {isPrimarySideRow && (
                                <span className="rounded bg-indigo-500/25 px-1.5 py-0.5 text-[9px] font-bold text-indigo-200">ROW</span>
                              )}
                              {isSideRow && !isPrimarySideRow && (
                                <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-200">SIDE</span>
                              )}
                              {isBanner && (
                                <span className="rounded bg-[var(--et-teal)]/20 px-1.5 py-0.5 text-[9px] font-bold text-[var(--et-teal-light)]">BANNER</span>
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-slate-100">
                              {v.text || v.code}
                            </p>
                          </button>
                          {compareMode && onSideRowToggle && v.can_banner && (
                            <button
                              type="button"
                              title={isSideRow ? 'Remove side row' : 'Add as side row'}
                              onClick={(e) => {
                                e.stopPropagation()
                                onSideRowToggle(v.id)
                              }}
                              className={`flex w-9 shrink-0 items-center justify-center border-l border-slate-700/50 text-xs font-bold transition ${
                                isSideRow
                                  ? 'bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25'
                                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                              }`}
                            >
                              S
                            </button>
                          )}
                          {canAddBanner && (
                            <button
                              type="button"
                              title={isBanner ? 'Remove banner column' : 'Add as banner column'}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isBanner && onCompareRemove) {
                                  onCompareRemove(v.id)
                                } else {
                                  onCompareToggle(v.id)
                                }
                              }}
                              className={`flex w-10 shrink-0 items-center justify-center border-l border-slate-700/50 transition ${
                                isBanner
                                  ? 'bg-[var(--et-teal)]/20 text-[var(--et-teal-light)] hover:bg-[var(--et-teal)]/30'
                                  : 'bg-slate-800/40 text-[var(--et-teal-light)] hover:bg-[var(--et-teal)]/20'
                              }`}
                            >
                              {isBanner ? <X size={15} /> : <Plus size={15} strokeWidth={2.5} />}
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  )
})
