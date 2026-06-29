import { Layers, Plus, Trash2, X } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'
import { BannerPicker } from './BannerPicker'

interface Props {
  variables: SurveyVariable[]
  layers: string[][]
  onChange: (layers: string[][]) => void
  sideRowIds: string[]
  onCopySideRowsToLayer?: (layerIndex: number) => void
}

function truncate(text: string, max = 42) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function BannerLayerEditor({
  variables,
  layers,
  onChange,
  sideRowIds,
  onCopySideRowsToLayer,
}: Props) {
  const usedElsewhere = (id: string, layerIndex: number) =>
    layers.some((layer, idx) => idx !== layerIndex && layer.includes(id))

  function updateLayer(layerIndex: number, ids: string[]) {
    const next = layers.map((layer, idx) => (idx === layerIndex ? ids : layer))
    onChange(next)
  }

  function addToLayer(layerIndex: number, id: string) {
    if (layers[layerIndex]?.includes(id)) return
    updateLayer(layerIndex, [...(layers[layerIndex] ?? []), id])
  }

  function removeFromLayer(layerIndex: number, id: string) {
    updateLayer(
      layerIndex,
      (layers[layerIndex] ?? []).filter((x) => x !== id),
    )
  }

  function addLayer() {
    onChange([...layers, []])
  }

  function removeLayer(layerIndex: number) {
    if (layers.length <= 1) {
      onChange([[]])
      return
    }
    onChange(layers.filter((_, idx) => idx !== layerIndex))
  }

  const displayLayers = layers.length > 0 ? layers : [[]]

  return (
    <div className="space-y-3">
      {displayLayers.map((layerIds, layerIndex) => {
        const layerVars = layerIds
          .map((id) => variables.find((v) => v.id === id))
          .filter(Boolean) as SurveyVariable[]

        return (
          <div
            key={layerIndex}
            className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-[var(--et-teal)]" />
                <p className="text-xs font-semibold text-slate-700">
                  Banner layer {layerIndex + 1}
                  {layerIndex === 0 && displayLayers.length > 1 && (
                    <span className="ml-1 font-normal text-slate-500">(outer)</span>
                  )}
                  {layerIndex > 0 && (
                    <span className="ml-1 font-normal text-slate-500">(nested)</span>
                  )}
                </p>
              </div>
              {displayLayers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLayer(layerIndex)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-white hover:text-red-600"
                >
                  <Trash2 size={12} />
                  Remove layer
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {layerVars.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-[var(--et-teal-light)] px-2.5 py-1 text-xs font-medium text-[var(--et-teal-dark)] ring-1 ring-[var(--et-teal)]/25"
                >
                  <span className="truncate">{truncate(v.text || v.code)}</span>
                  <button
                    type="button"
                    onClick={() => removeFromLayer(layerIndex, v.id)}
                    className="shrink-0 text-[var(--et-teal-dark)]/70 hover:text-red-600"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <BannerPicker
                variables={variables.filter((v) => !layerIds.includes(v.id) && !usedElsewhere(v.id, layerIndex))}
                selectedIds={layerIds}
                onAdd={(id) => addToLayer(layerIndex, id)}
                onRemove={(id) => removeFromLayer(layerIndex, id)}
                onAddSideRowsAsBanners={
                  onCopySideRowsToLayer && sideRowIds.length > 0
                    ? () => onCopySideRowsToLayer(layerIndex)
                    : undefined
                }
                sideRowCount={sideRowIds.length}
                label="Add variable"
                pickerTitle={`Layer ${layerIndex + 1} variables`}
                emptyMessage="No questions available for this layer"
                variant="banner"
              />
            </div>
          </div>
        )
      })}

      <button
        type="button"
        onClick={addLayer}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--et-teal)]/40 bg-white px-3 py-2 text-xs font-semibold text-[var(--et-teal-dark)] hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
      >
        <Plus size={14} />
        Add banner layer
      </button>
      {displayLayers.length > 1 && (
        <p className="text-[11px] text-slate-500">
          Layers nest left to right — e.g. Layer 1 Gender, Layer 2 Age creates Male×18–24, Male×25–34, etc.
        </p>
      )}
    </div>
  )
}
