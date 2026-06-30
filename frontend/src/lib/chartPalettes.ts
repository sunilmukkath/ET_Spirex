import type { ChartDisplayOptions } from './chartDataHelpers'
import type { UserChartPalette } from './chartPaletteStore'

export type ChartPaletteId = 'et_teal' | 'ocean' | 'sunset' | 'berry' | 'slate' | 'rainbow'

/** Built-in palette id or `user:<paletteId>` for saved custom palettes. */
export type ChartPaletteSelection = ChartPaletteId | `user:${string}`

export interface ChartPalette {
  id: ChartPaletteId
  label: string
  colors: string[]
  heatmapRgb: [number, number, number]
}

export const CHART_PALETTES: ChartPalette[] = [
  {
    id: 'et_teal',
    label: 'ET Teal',
    colors: ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#6366f1', '#8b5cf6', '#f59e0b', '#ec4899'],
    heatmapRgb: [13, 148, 136],
  },
  {
    id: 'ocean',
    label: 'Ocean',
    colors: ['#0369a1', '#0284c7', '#0ea5e9', '#38bdf8', '#06b6d4', '#0891b2', '#155e75', '#164e63'],
    heatmapRgb: [2, 132, 199],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    colors: ['#c2410c', '#ea580c', '#f97316', '#fb923c', '#dc2626', '#e11d48', '#db2777', '#9333ea'],
    heatmapRgb: [234, 88, 12],
  },
  {
    id: 'berry',
    label: 'Berry',
    colors: ['#7c3aed', '#8b5cf6', '#a78bfa', '#c026d3', '#d946ef', '#ec4899', '#f43f5e', '#6366f1'],
    heatmapRgb: [124, 58, 237],
  },
  {
    id: 'slate',
    label: 'Slate',
    colors: ['#334155', '#475569', '#64748b', '#94a3b8', '#0f766e', '#115e59', '#1e40af', '#3730a3'],
    heatmapRgb: [71, 85, 105],
  },
  {
    id: 'rainbow',
    label: 'Rainbow',
    colors: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'],
    heatmapRgb: [59, 130, 246],
  },
]

const DEFAULT_PALETTE = CHART_PALETTES[0]

export function getPalette(id: ChartPaletteId): ChartPalette {
  return CHART_PALETTES.find((p) => p.id === id) ?? DEFAULT_PALETTE
}

export function isUserPaletteSelection(
  selection: ChartPaletteSelection,
): selection is `user:${string}` {
  return selection.startsWith('user:')
}

export function userPaletteId(selection: ChartPaletteSelection): string | null {
  return isUserPaletteSelection(selection) ? selection.slice(5) : null
}

export function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '')
  if (cleaned.length !== 6) return DEFAULT_PALETTE.heatmapRgb
  const n = Number.parseInt(cleaned, 16)
  if (!Number.isFinite(n)) return DEFAULT_PALETTE.heatmapRgb
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function resolveChartPalette(
  selection: ChartPaletteSelection,
  userPalettes: UserChartPalette[] = [],
): { label: string; colors: string[]; heatmapRgb: [number, number, number] } {
  const userId = userPaletteId(selection)
  if (userId) {
    const custom = userPalettes.find((p) => p.id === userId)
    if (custom?.colors.length) {
      return {
        label: custom.label,
        colors: custom.colors,
        heatmapRgb: hexToRgb(custom.colors[0]),
      }
    }
  }
  const builtIn = getPalette(
    (isUserPaletteSelection(selection) ? 'et_teal' : selection) as ChartPaletteId,
  )
  return builtIn
}

export function paletteSelectionFromLegacy(id: string): ChartPaletteSelection {
  if (id.startsWith('user:')) return id as ChartPaletteSelection
  if (CHART_PALETTES.some((p) => p.id === id)) return id as ChartPaletteId
  return 'et_teal'
}

export function resolveChartColors(
  options: ChartDisplayOptions,
  userPalettes: UserChartPalette[] = [],
): string[] {
  const selection = options.paletteSelection ?? options.paletteId
  const base = resolveChartPalette(selection, userPalettes).colors

  if (options.seriesColors?.length) {
    const max = Math.max(options.seriesColors.length, base.length, options.maxItems)
    return Array.from({ length: max }, (_, i) => options.seriesColors?.[i] ?? base[i % base.length])
  }

  if (options.colorMode === 'single') {
    return [options.primaryColor ?? base[0]]
  }

  return base
}

export function resolveHeatmapRgb(
  options: ChartDisplayOptions,
  userPalettes: UserChartPalette[] = [],
): [number, number, number] {
  const selection = options.paletteSelection ?? options.paletteId
  if (options.colorMode === 'single' && options.primaryColor) {
    return hexToRgb(options.primaryColor)
  }
  if (options.seriesColors?.[0]) {
    return hexToRgb(options.seriesColors[0])
  }
  return resolveChartPalette(selection, userPalettes).heatmapRgb
}
