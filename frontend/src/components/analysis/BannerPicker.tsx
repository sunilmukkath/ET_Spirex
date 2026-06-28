import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'

interface Props {
  variables: SurveyVariable[]
  selectedIds: string[]
  excludeIds?: string[]
  onAdd: (id: string) => void
  onRemove?: (id: string) => void
  label?: string
}

export function BannerPicker({
  variables,
  selectedIds,
  excludeIds = [],
  onAdd,
  onRemove,
  label = 'Add banner column',
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const available = useMemo(() => {
    const q = search.toLowerCase()
    return variables.filter((v) => {
      if (!v.can_banner) return false
      if (excludeIds.includes(v.id)) return false
      if (selectedIds.includes(v.id)) return false
      if (q && !`${v.text ?? ''}`.toLowerCase().includes(q) && !`${v.code ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [variables, excludeIds, selectedIds, search])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--et-teal)]/40 bg-[var(--et-teal-light)]/50 px-3 py-1.5 text-xs font-semibold text-[var(--et-teal-dark)] hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]"
      >
        <Plus size={14} />
        {label}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Banner columns</p>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="search"
                autoFocus
                placeholder="Search questions…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
              />
            </div>
          </div>

          <ul className="max-h-64 overflow-y-auto p-2">
            {available.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-slate-400">No banner questions available</li>
            ) : (
              available.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(v.id)
                      setSearch('')
                    }}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--et-teal-light)]"
                  >
                    <Plus size={14} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
                    <span>
                      <span className="block text-[10px] uppercase text-slate-400">{v.type_label}</span>
                      <span className="line-clamp-2 text-sm text-slate-800">{v.text || v.code}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          {selectedIds.length > 0 && onRemove && (
            <div className="border-t border-slate-100 p-2">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Selected</p>
              {selectedIds.map((id) => {
                const v = variables.find((x) => x.id === id)
                if (!v) return null
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700"
                  >
                    <span className="truncate">{v.text || v.code}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(id)}
                      className="shrink-0 text-slate-400 hover:text-red-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
