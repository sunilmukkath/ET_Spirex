interface ElasticTreeLogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const HEIGHT: Record<NonNullable<ElasticTreeLogoProps['size']>, string> = {
  sm: 'h-5',
  md: 'h-6',
  lg: 'h-7',
}

export function ElasticTreeLogo({ size = 'md', className = '' }: ElasticTreeLogoProps) {
  return (
    <img
      src="/elastic-tree-logo.png"
      alt="Elastic Tree"
      className={`${HEIGHT[size]} w-auto shrink-0 object-contain ${className}`.trim()}
    />
  )
}
