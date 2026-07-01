import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, Search, Settings, X } from 'lucide-react'
import type { WorkflowAccess } from '../../api/client'
import { NAV_GROUP_LABELS } from '../../lib/etCopy'
import { searchNavItems, type WorkspaceNavItem } from '../../lib/workspaceNav'

export interface CommandPaletteItem {
  id: string
  label: string
  description: string
  group: string
  href: string
  keywords?: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  surveyId?: number
  surveyTitle?: string
  access?: WorkflowAccess | null
  extraItems?: CommandPaletteItem[]
}

function toPaletteItem(row: WorkspaceNavItem & { href: string }, index: number): CommandPaletteItem {
  return {
    id: `${row.mode}-${row.view ?? ''}-${index}`,
    label: row.label,
    description: row.description,
    group: row.group,
    href: row.href,
    keywords: row.keywords,
  }
}

export function CommandPalette({ open, onClose, surveyId, access, extraItems = [] }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => {
    const fromNav = searchNavItems(query, access, surveyId).map(toPaletteItem)
    if (!query.trim()) return [...fromNav, ...extraItems]
    const q = query.trim().toLowerCase()
    const filteredExtra = extraItems.filter((item) => {
      const haystack = [item.label, item.description, item.group, ...(item.keywords ?? [])].join(' ').toLowerCase()
      return haystack.includes(q)
    })
    return [...fromNav, ...filteredExtra]
  }, [query, access, surveyId, extraItems])

  const go = useCallback(
    (href: string) => {
      onClose()
      setQuery('')
      navigate(href)
    },
    [navigate, onClose],
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, items.length - 1)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && items[activeIndex]) {
        e.preventDefault()
        go(items[activeIndex].href)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, items, activeIndex, go, onClose])

  if (!open) return null

  const grouped = items.reduce<Record<string, CommandPaletteItem[]>>((acc, item) => {
    acc[item.group] = acc[item.group] ?? []
    acc[item.group].push(item)
    return acc
  }, {})

  let rowIndex = -1

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/50 p-4 pt-[12vh] backdrop-blur-sm">
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Jump to"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page or tool…"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[min(24rem,50vh)] overflow-y-auto py-2">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No matches</p>
          ) : (
            Object.entries(grouped).map(([group, rows]) => (
              <div key={group} className="px-2">
                <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {NAV_GROUP_LABELS[group] ?? group}
                </p>
                {rows.map((item) => {
                  rowIndex += 1
                  const idx = rowIndex
                  const active = idx === activeIndex
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(item.href)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                        active ? 'bg-[var(--et-teal-light)]/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="mt-0.5 text-[var(--et-teal-dark)]">
                        {item.group === 'App' ? (
                          item.label === 'Settings' ? <Settings size={16} /> : <LayoutGrid size={16} />
                        ) : (
                          <Search size={16} className="opacity-0" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900">{item.label}</span>
                        <span className="block text-xs text-slate-500">{item.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] text-slate-400">
          <kbd className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">↑↓</kbd> navigate{' '}
          <kbd className="ml-2 rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">↵</kbd> open{' '}
          <kbd className="ml-2 rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">esc</kbd> close
        </div>
      </div>
    </div>
  )
}

export function useCommandPaletteHotkey(onOpen: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpen()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpen])
}
