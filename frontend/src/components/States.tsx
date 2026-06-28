import { AlertCircle, Loader2 } from 'lucide-react'

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-slate-500">
      <Loader2 className="animate-spin" size={20} />
      <span>{message}</span>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
      <AlertCircle className="mt-0.5 shrink-0" size={18} />
      <div>
        <p className="font-medium">Something went wrong</p>
        <p className="mt-1 text-sm">{message}</p>
      </div>
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <h3 className="text-lg font-medium text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
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
    <div className="space-y-4" aria-label="Loading chart">
      <SkeletonBlock className="h-4 w-48" />
      <SkeletonBlock className="h-72 w-full" />
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-label="Loading">
      <SkeletonBlock className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className="h-6 w-full" />
      ))}
    </div>
  )
}
