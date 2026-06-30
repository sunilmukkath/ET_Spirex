import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Palette, Plus, RotateCcw, Trash2 } from 'lucide-react'
import {
  CHART_PALETTES,
  resolveChartPalette,
  type ChartPaletteSelection,
} from '../../lib/chartPalettes'
import type { UserChartPalette } from '../../lib/chartPaletteStore'

const PALETTE_SWATCH_COUNT = 8

interface Props {
  paletteSelection: ChartPaletteSelection
  onPaletteSelectionChange: (value: ChartPaletteSelection) => void
  colorMode: 'single' | 'multi'
  onColorModeChange: (value: 'single' | 'multi') => void
  primaryColor: string
  onPrimaryColorChange: (value: string) => void
  seriesColors: string[]
  onSeriesColorsChange: (value: string[]) => void
  seriesLabels: string[]
  chartTitle: string
  onChartTitleChange: (value: string) => void
  showLegend: boolean
  onShowLegendChange: (value: boolean) => void
  showGrid: boolean
  onShowGridChange: (value: boolean) => void
  userPalettes: UserChartPalette[]
  onSavePalette: (name: string, colors: string[]) => void
  onDeletePalette: (id: string) => void
  onResetSeriesColors: () => void
}

function ColorInput({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label?: string
}) {
  return (
    <label className="inline-flex items-center gap-2" title={label}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
      />
      <span className="hidden font-mono text-[10px] text-slate-400 sm:inline">{value}</span>
    </label>
  )
}

export function ChartStylePanel({
  paletteSelection,
  onPaletteSelectionChange,
  colorMode,
  onColorModeChange,
  primaryColor,
  onPrimaryColorChange,
  seriesColors,
  onSeriesColorsChange,
  seriesLabels,
  chartTitle,
  onChartTitleChange,
  showLegend,
  onShowLegendChange,
  showGrid,
  onShowGridChange,
  userPalettes,
  onSavePalette,
  onDeletePalette,
  onResetSeriesColors,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)

  const activePalette = useMemo(
    () => resolveChartPalette(paletteSelection, userPalettes),
    [paletteSelection, userPalettes],
  )

  const workingPaletteColors = useMemo(() => {
    return Array.from({ length: PALETTE_SWATCH_COUNT }, (_, i) => activePalette.colors[i] ?? activePalette.colors[0])
  }, [activePalette.colors])

  const effectiveSeriesColors = useMemo(() => {
    const base = workingPaletteColors
    if (!seriesLabels.length) return base
    return seriesLabels.map((_, i) => seriesColors[i] ?? base[i % base.length])
  }, [seriesLabels, seriesColors, workingPaletteColors])

  function updatePaletteColor(index: number, color: string) {
    const next = [...workingPaletteColors]
    next[index] = color
  if (colorMode === 'single' && index === 0) {
      onPrimaryColorChange(color)
    }
    if (seriesLabels.length) {
      const seriesNext = seriesLabels.map((_, i) => seriesColors[i] ?? workingPaletteColors[i % workingPaletteColors.length])
      seriesNext[index] = color
      onSeriesColorsChange(seriesNext)
      return
    }
    onSeriesColorsChange(next)
  }

  function handlePaletteChange(raw: string) {
    onPaletteSelectionChange(raw as ChartPaletteSelection)
    onSeriesColorsChange([])
    if (raw.startsWith('user:')) {
      const custom = userPalettes.find((p) => `user:${p.id}` === raw)
      if (custom?.colors[0]) onPrimaryColorChange(custom.colors[0])
    } else {
      const builtIn = CHART_PALETTES.find((p) => p.id === raw)
      if (builtIn?.colors[0]) onPrimaryColorChange(builtIn.colors[0])
    }
  }

  function handleSavePalette() {
    const colors = seriesColors.length ? effectiveSeriesColors : workingPaletteColors
    onSavePalette(saveName, colors)
    setSaveName('')
    setShowSaveForm(false)
  }

  const selectedUserId = paletteSelection.startsWith('user:') ? paletteSelection.slice(5) : null

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Palette size={16} className="text-[var(--et-teal)]" />
          Chart style & colours
        </span>
        {expanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3">
          <label className="block text-xs">
            <span className="font-medium text-slate-500">Chart title</span>
            <input
              type="text"
              value={chartTitle}
              onChange={(e) => onChartTitleChange(e.target.value)}
              placeholder="Optional — shown above the chart"
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-4 text-xs">
            <label className="inline-flex cursor-pointer items-center gap-2 text-slate-600">
              <input
                type="checkbox"
                checked={showLegend}
                onChange={(e) => onShowLegendChange(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--et-teal)]"
              />
              Legend
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-slate-600">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => onShowGridChange(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--et-teal)]"
              />
              Grid lines
            </label>
          </div>

          <div>
            <span className="text-xs font-medium text-slate-500">Palette</span>
            <select
              value={paletteSelection}
              onChange={(e) => handlePaletteChange(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
            >
              <optgroup label="Built-in">
                {CHART_PALETTES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
              {userPalettes.length > 0 && (
                <optgroup label="My palettes">
                  {userPalettes.map((p) => (
                    <option key={p.id} value={`user:${p.id}`}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">Colour mode</span>
              <div className="et-segment">
                <button
                  type="button"
                  onClick={() => onColorModeChange('multi')}
                  className={`et-segment-btn text-xs ${colorMode === 'multi' ? 'et-segment-btn-active' : 'et-segment-btn-inactive'}`}
                >
                  Multi
                </button>
                <button
                  type="button"
                  onClick={() => onColorModeChange('single')}
                  className={`et-segment-btn text-xs ${colorMode === 'single' ? 'et-segment-btn-active' : 'et-segment-btn-inactive'}`}
                >
                  Single
                </button>
              </div>
            </div>

            {colorMode === 'single' ? (
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-xs text-slate-600">Primary colour</span>
                <ColorInput value={primaryColor} onChange={onPrimaryColorChange} />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 rounded-lg bg-slate-50 p-3">
                {workingPaletteColors.map((color, i) => (
                  <ColorInput
                    key={i}
                    value={effectiveSeriesColors[i] ?? color}
                    onChange={(c) => updatePaletteColor(i, c)}
                    label={`Colour ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {seriesLabels.length > 0 && colorMode === 'multi' && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">Series colours</span>
                <button
                  type="button"
                  onClick={onResetSeriesColors}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-[var(--et-teal-dark)]"
                >
                  <RotateCcw size={11} />
                  Reset
                </button>
              </div>
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-slate-100 p-2">
                {seriesLabels.map((label, i) => (
                  <div key={`${label}-${i}`} className="flex items-center gap-2">
                    <ColorInput
                      value={effectiveSeriesColors[i]}
                      onChange={(c) => {
                        const next = [...effectiveSeriesColors]
                        next[i] = c
                        onSeriesColorsChange(next)
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={label}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            {!showSaveForm ? (
              <button
                type="button"
                onClick={() => setShowSaveForm(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus size={13} />
                Save palette
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Palette name"
                  className="min-w-[8rem] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={handleSavePalette}
                  disabled={!saveName.trim()}
                  className="rounded-lg bg-[var(--et-teal)] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveForm(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            )}
            {selectedUserId && (
              <button
                type="button"
                onClick={() => onDeletePalette(selectedUserId)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
              >
                <Trash2 size={13} />
                Delete palette
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
