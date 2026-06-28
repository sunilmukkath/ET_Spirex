const styles = {
  active: 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)] ring-[var(--et-teal)]/25',
  inactive: 'bg-slate-100 text-slate-700 ring-slate-200',
  expired: 'bg-amber-100 text-amber-800 ring-amber-200',
}

export function StatusBadge({ status }: { status: string }) {
  const key = status in styles ? (status as keyof typeof styles) : 'inactive'
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${styles[key]}`}
    >
      {status}
    </span>
  )
}
