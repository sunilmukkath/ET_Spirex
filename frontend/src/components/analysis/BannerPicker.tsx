import { useEffect, useMemo, useRef, useState } from 'react'
import { Layers, Plus, Search, X } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'

type PickerVariant = 'banner' | 'side'

interface Props {
  variables: SurveyVariable[]
  selectedIds: string[]
  excludeIds?: string[]
  onAdd: (id: string) => void
  onRemove?: (id: string) => void
  onAddAll?: () => void
  label?: string
  pickerTitle?: string
  emptyMessage?: string
  variant?: PickerVariant
  showAddAll?: boolean
}

const VARIANT_STYLES: Record<
  PickerVariant,
  {
    button: string
    itemHover: string
    icon: string
    addAll: string
  }
> = {
  banner: {
    button:
      'border-[var(--et-teal)]/40 bg-[var(--et-teal-light)]/50 text-[var(--et-teal-dark)] hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]',
    itemHover: 'hover:bg-[var(--et-teal-light)]',
    icon: 'text-[var(--et-teal)]',
    addAll:
      'border-[var(--et-teal)]/30 bg-[var(--et-teal-light)]/40 text-[var(--et-teal-dark)] hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]',
  },
  side: {
    button:
      'border-indigo-300/60 bg-indigo-50/80 text-indigo-800 hover:border-indigo-400 hover:bg-indigo-50',
    itemHover: 'hover:bg-indigo-50',
    icon: 'text-indigo-600',
    addAll:
      'border-indigo-300/60 bg-indigo-50/80 text-indigo-800 hover:border-indigo-400 hover:bg-indigo-100',
  },
}

export function BannerPicker({
  variables,
  selectedIds,
  excludeIds = [],
  onAdd,
  onRemove,
  onAddAll,
  label = 'Add banner column',
  pickerTitle,
  emptyMessage = 'No questions available',
  variant = 'banner',
  showAddAll = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const styles = VARIANT_STYLES[variant]
  const title = pickerTitle ?? (variant === 'side' ? 'Side rows' : 'Banner columns')

  const available = useMemo(() => {
    const q = search.toLowerCase()
    return variables.filter((v) => {
      if (!v.can_banner) return false
      if (excludeIds.includes(v.id)) return false
      if (selectedIds.includes(v.id)) return false
      if (q && !`${v.text ?? ''}`.toLowerCase().includes(q) && !`${v.code ?? ''}`.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [variables, excludeIds, selectedIds, search])

  const addAllCount = useMemo(() => {
    return variables.filter(
      (v) => v.can_banner && !excludeIds.includes(v.id) && !selectedIds.includes(v.id),
    ).length
  }, [variables, excludeIds, selectedIds])

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
        className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs font-semibold ${styles.button}`}
      >
        <Plus size={14} />
        {label}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">{title}</p>
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
            {showAddAll && onAddAll && addAllCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  onAddAll()
                  setSearch('')
                }}
                className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${styles.addAll}`}
              >
                <Layers size={14} />
                Add all questions ({addAllCount})
              </button>
            )}
          </div>

          <ul className="max-h-64 overflow-y-auto p-2">
            {available.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-slate-400">{emptyMessage}</li>
            ) : (
              available.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(v.id)
                      setSearch('')
                    }}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left ${styles.itemHover}`}
                  >
                    <Plus size={14} className={`mt-0.5 shrink-0 ${styles.icon}`} />
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
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Selected ({selectedIds.length})
              </p>
              <div className="max-h-36 overflow-y-auto">
                {selectedIds.slice(0, 12).map((id) => {
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
                {selectedIds.length > 12 && (
                  <p className="px-2 py-1.5 text-xs text-slate-400">
                    +{selectedIds.length - 12} more — use Clear all on the page
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
