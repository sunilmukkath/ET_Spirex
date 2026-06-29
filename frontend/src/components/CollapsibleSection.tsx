import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  summary?: React.ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
  className?: string
}

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  children,
  className = '',
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = controlledOpen ?? internalOpen

  function setOpen(next: boolean) {
    onOpenChange?.(next)
    if (controlledOpen === undefined) setInternalOpen(next)
  }

  return (
    <section className={`border-b border-slate-200 bg-white ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition hover:bg-slate-50 sm:gap-3 sm:px-6 sm:py-3.5"
      >
        <ChevronDown
          size={18}
          className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">{title}</span>
          {!open && summary ? (
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{summary}</span>
          ) : null}
        </span>
      </button>
      {open ? <div className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-5">{children}</div> : null}
    </section>
  )
}
