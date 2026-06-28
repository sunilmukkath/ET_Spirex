export type ChartPaletteId = 'et_teal' | 'ocean' | 'sunset' | 'berry' | 'slate' | 'rainbow'

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

export function getPalette(id: ChartPaletteId): ChartPalette {
  return CHART_PALETTES.find((p) => p.id === id) ?? CHART_PALETTES[0]
}
