import { AlertCircle, Inbox, Loader2 } from 'lucide-react'

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-[var(--et-yellow)]/25" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-[var(--et-yellow)]/30">
          <Loader2 className="animate-spin text-[var(--et-navy)]" size={26} />
        </div>
      </div>
      <p className="text-sm font-medium text-[var(--et-gray-600)]">{message}</p>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--et-negative)]/20 bg-[var(--et-negative-light)] p-4 text-[var(--et-negative)] shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100">
        <AlertCircle size={18} />
      </div>
      <div>
        <p className="font-semibold">Something went wrong</p>
        <p className="mt-1 text-sm leading-relaxed text-red-700/90">{message}</p>
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon?: React.ReactNode
}) {
  return (
    <div className="et-empty-state">
      <div className="et-empty-icon mx-auto">
        {icon ?? <Inbox size={28} strokeWidth={1.5} />}
      </div>
      <h3 className="mt-5 font-display text-lg font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">{description}</p>
    </div>
  )
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`}
      aria-hidden
    />
  )
}

export function ChartSkeleton() {
  return (
    <div className="et-panel space-y-4 p-6" aria-label="Loading chart">
      <SkeletonBlock className="h-4 w-48" />
      <SkeletonBlock className="h-72 w-full rounded-xl" />
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="et-panel space-y-3 p-4" aria-label="Loading">
      <SkeletonBlock className="h-8 w-full rounded-lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className="h-6 w-full" />
      ))}
    </div>
  )
}
