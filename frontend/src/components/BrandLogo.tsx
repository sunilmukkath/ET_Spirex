interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  variant?: 'light' | 'dark'
}

export function BrandLogo({ size = 'md', showTagline = true, variant = 'dark' }: BrandLogoProps) {
  const isLight = variant === 'light'
  const markSize = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  const titleClass = size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-sm' : 'text-base'

  return (
    <div className="flex items-center gap-3">
      <img
        src="/scout-mark.png"
        alt=""
        aria-hidden
        className={`${markSize} shrink-0 rounded-lg object-contain`}
      />
      <div className="min-w-0">
        <div className="flex items-baseline gap-0.5">
          <span
            className={`font-bold tracking-tight ${titleClass} ${
              isLight ? 'text-white' : 'text-[var(--et-navy)]'
            }`}
          >
            ET
          </span>
          <span
            className={`font-bold tracking-tight ${titleClass} ${
              isLight ? 'text-[var(--et-teal-light)]' : 'text-[var(--et-teal)]'
            }`}
          >
            Scout
          </span>
        </div>
        {showTagline && (
          <p
            className={`truncate text-[10px] font-semibold uppercase tracking-[0.18em] ${
              isLight ? 'text-[var(--et-teal-light)]/80' : 'text-slate-500'
            }`}
          >
            Elastic Tree Analytics
          </p>
        )}
      </div>
    </div>
  )
}
