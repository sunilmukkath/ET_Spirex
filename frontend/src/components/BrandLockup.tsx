import { BrandLogo } from './BrandLogo'
import { ElasticTreeLogo } from './ElasticTreeLogo'

interface BrandLockupProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'light' | 'dark'
}

export function BrandLockup({ size = 'md', variant = 'dark' }: BrandLockupProps) {
  const isLight = variant === 'light'
  const gap = size === 'sm' ? 'gap-2.5' : 'gap-3'
  const dividerHeight = size === 'sm' ? 'h-6' : size === 'lg' ? 'h-9' : 'h-7'

  return (
    <div className={`flex items-center ${gap}`}>
      <ElasticTreeLogo size={size} />
      <div
        className={`w-px shrink-0 ${dividerHeight} ${
          isLight ? 'bg-white/25' : 'bg-slate-200'
        }`}
        aria-hidden
      />
      <BrandLogo size={size} variant={variant} />
    </div>
  )
}
