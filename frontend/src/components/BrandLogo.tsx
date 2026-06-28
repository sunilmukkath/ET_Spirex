import elasticTreeMark from '../assets/elastic-tree-mark.png'

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  variant?: 'light' | 'dark'
}

export function BrandLogo({ size = 'md', showTagline = true, variant = 'dark' }: BrandLogoProps) {
  const isLight = variant === 'light'
  const markSize = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  const titleClass =
    size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-sm' : 'text-base'

  return (
    <div className="flex items-center gap-3">
      <div
        className={`${markSize} flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--et-navy)] p-0.5`}
      >
        <img
          src={elasticTreeMark}
          alt="Elastic Tree"
          className="h-full w-full object-contain"
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`font-bold tracking-tight ${titleClass} ${
              isLight ? 'text-white' : 'text-[var(--et-navy)]'
            }`}
          >
            ET Spirex
          </span>
        </div>
        {showTagline && (
          <p
            className={`truncate text-[10px] font-semibold uppercase tracking-[0.18em] ${
              isLight ? 'text-[var(--et-teal-light)]/80' : 'text-[var(--et-teal)]'
            }`}
          >
            Elastic Tree
          </p>
        )}
      </div>
    </div>
  )
}
