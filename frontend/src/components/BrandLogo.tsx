interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'light' | 'dark'
}

export function BrandLogo({ size = 'md', variant = 'dark' }: BrandLogoProps) {
  const isLight = variant === 'light'
  const markSize = size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'
  const titleClass = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg'

  return (
    <div className="flex items-center gap-3">
      <img
        src="/scout-mark.png"
        alt=""
        aria-hidden
        className={`${isLight ? 'et-scout-mark-light' : 'et-scout-mark'} ${markSize} shrink-0 object-contain`}
      />
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
            isLight ? 'text-[var(--et-yellow-bright)]' : 'text-[var(--et-yellow)]'
          }`}
        >
          Scout
        </span>
      </div>
    </div>
  )
}
