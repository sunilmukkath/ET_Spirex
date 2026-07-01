import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2 } from 'lucide-react'

interface Props {
  title?: string
  enabled?: boolean
  toolbar?: ReactNode
  children: ReactNode
}

export function CrosstabViewPane({
  title = 'Crosstab tables',
  enabled = true,
  toolbar,
  children,
}: Props) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!maximized) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMaximized(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [maximized])

  if (!enabled) return <>{children}</>

  const toggle = (
    <button
      type="button"
      onClick={() => setMaximized((v) => !v)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)]/40 hover:bg-slate-50"
      title={maximized ? 'Exit full view (Esc)' : 'Maximize table view for reading'}
    >
      {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      {maximized ? 'Exit full view' : 'Maximize view'}
    </button>
  )

  if (maximized) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col bg-white">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-6">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{title}</h3>
          {toolbar}
          {toggle}
          <p className="w-full text-[11px] text-slate-400 sm:ml-0 sm:w-auto">Press Esc to exit</p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto et-scroll overscroll-y-contain p-4 sm:p-6 [&_table]:text-sm [&_th]:py-3 [&_td]:py-2.5">
          {children}
        </div>
      </div>,
      document.body,
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {toolbar}
        {toggle}
      </div>
      {children}
    </div>
  )
}
