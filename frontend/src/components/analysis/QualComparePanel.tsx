import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bookmark, Loader2, Plus, Save, Table2, Trash2, X } from 'lucide-react'
import type { QualAsset, QualBannerField, QualComparePreset, QualRowDimension, QualSessionFilter } from '../../api/client'
import {
  QUAL_BANNER_FIELDS,
  QUAL_ROW_DIMENSIONS,
  applySessionFilter,
  buildCompareTable,
  emptySessionFilter,
  uniqueFieldValues,
} from '../../lib/qualCompare'
import type { QualWorkspaceScope } from '../../lib/qualScope'
import { qualWorkspaceApi } from '../../lib/qualScope'

const LOCAL_PRESET_KEY = 'et-qual-compare-presets'

function localPresetKey(scope: QualWorkspaceScope): string {
  return scope.type === 'pm' ? `pm:${scope.projectId}` : `survey:${scope.surveyId}`
}

function loadLocalPresets(scope: QualWorkspaceScope): QualComparePreset[] {
  try {
    const raw = localStorage.getItem(LOCAL_PRESET_KEY)
    if (!raw) return []
    const all = JSON.parse(raw) as Record<string, QualComparePreset[]>
    return all[localPresetKey(scope)] ?? []
  } catch {
    return []
  }
}

function saveLocalPreset(scope: QualWorkspaceScope, preset: QualComparePreset) {
  const raw = localStorage.getItem(LOCAL_PRESET_KEY)
  const all: Record<string, QualComparePreset[]> = raw ? JSON.parse(raw) : {}
  const key = localPresetKey(scope)
  all[key] = [preset, ...(all[key] ?? []).filter((p) => p.id !== preset.id)]
  localStorage.setItem(LOCAL_PRESET_KEY, JSON.stringify(all))
}

function deleteLocalPreset(scope: QualWorkspaceScope, presetId: string) {
  const raw = localStorage.getItem(LOCAL_PRESET_KEY)
  if (!raw) return
  const all = JSON.parse(raw) as Record<string, QualComparePreset[]>
  const key = localPresetKey(scope)
  all[key] = (all[key] ?? []).filter((p) => p.id !== presetId)
  localStorage.setItem(LOCAL_PRESET_KEY, JSON.stringify(all))
}

interface Props {
  scope: QualWorkspaceScope
  assets: QualAsset[]
}

export function QualComparePanel({ scope, assets }: Props) {
  const [rowDimension, setRowDimension] = useState<QualRowDimension>('tags')
  const [bannerLayers, setBannerLayers] = useState<QualBannerField[][]>([[]])
  const [sessionFilter, setSessionFilter] = useState<QualSessionFilter>(emptySessionFilter())
  const [tableFilters, setTableFilters] = useState<Record<string, string[]>>({})
  const [showColPct, setShowColPct] = useState(true)
  const [showRowPct, setShowRowPct] = useState(false)
  const [presets, setPresets] = useState<QualComparePreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)
  const [activeRowFilter, setActiveRowFilter] = useState<string | null>(null)
  const [rowFilterTags, setRowFilterTags] = useState<string[]>([])

  const loadPresets = useCallback(async () => {
    if (scope.type === 'pm') {
      try {
        const meta = await qualWorkspaceApi.getMeta(scope)
        setPresets(meta?.compare_presets ?? [])
      } catch {
        setPresets([])
      }
    } else {
      setPresets(loadLocalPresets(scope))
    }
  }, [scope])

  useEffect(() => {
    void loadPresets()
  }, [loadPresets])

  const filteredAssets = useMemo(() => applySessionFilter(assets, sessionFilter), [assets, sessionFilter])
  const table = useMemo(
    () => buildCompareTable(assets, rowDimension, bannerLayers, sessionFilter, tableFilters),
    [assets, rowDimension, bannerLayers, sessionFilter, tableFilters],
  )

  const allTags = useMemo(() => uniqueFieldValues(assets, 'tags'), [assets])

  async function handleSavePreset() {
    const name = presetName.trim() || `Compare ${presets.length + 1}`
    setSavingPreset(true)
    try {
      const body = {
        name,
        row_dimension: rowDimension,
        banner_layers: bannerLayers.filter((layer) => layer.length > 0),
        session_filter: sessionFilter,
        table_filters: tableFilters,
        show_col_pct: showColPct,
        show_row_pct: showRowPct,
      }
      if (scope.type === 'pm') {
        const saved = await qualWorkspaceApi.saveComparePreset(scope, body)
        setPresets((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)])
      } else {
        const saved: QualComparePreset = {
          ...body,
          id: `local_${Date.now()}`,
          created_at: Date.now() / 1000,
          created_by: null,
        }
        saveLocalPreset(scope, saved)
        setPresets((prev) => [saved, ...prev])
      }
      setPresetName('')
    } finally {
      setSavingPreset(false)
    }
  }

  async function handleDeletePreset(presetId: string) {
    if (scope.type === 'pm') {
      await qualWorkspaceApi.deleteComparePreset(scope, presetId)
    } else {
      deleteLocalPreset(scope, presetId)
    }
    setPresets((prev) => prev.filter((p) => p.id !== presetId))
  }

  function applyPreset(preset: QualComparePreset) {
    setRowDimension(preset.row_dimension)
    setBannerLayers(preset.banner_layers.length ? preset.banner_layers : [[]])
    setSessionFilter(preset.session_filter)
    setTableFilters(preset.table_filters)
    setShowColPct(preset.show_col_pct)
    setShowRowPct(preset.show_row_pct)
  }

  function toggleBannerField(layerIdx: number, field: QualBannerField) {
    setBannerLayers((prev) => {
      const next = prev.map((layer) => [...layer])
      while (next.length <= layerIdx) next.push([])
      const layer = next[layerIdx]
      if (layer.includes(field)) next[layerIdx] = layer.filter((f) => f !== field)
      else next[layerIdx] = [...layer, field]
      return next
    })
  }

  function saveRowFilter() {
    if (!activeRowFilter) return
    setTableFilters((prev) => ({
      ...prev,
      [activeRowFilter]: rowFilterTags,
    }))
    setActiveRowFilter(null)
    setRowFilterTags([])
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Table2 size={18} className="text-[var(--et-teal)]" />
          <h3 className="text-sm font-semibold text-slate-900">Qual compare tables</h3>
          <span className="text-xs text-slate-500">
            {filteredAssets.length} session{filteredAssets.length === 1 ? '' : 's'} in scope
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1 block font-medium text-slate-600">Row dimension</span>
            <select
              className="et-select w-full"
              value={rowDimension}
              onChange={(e) => setRowDimension(e.target.value as QualRowDimension)}
            >
              {QUAL_ROW_DIMENSIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-medium text-slate-600">Session filter (search)</span>
            <input
              className="et-input w-full"
              value={sessionFilter.query}
              onChange={(e) => setSessionFilter((f) => ({ ...f, query: e.target.value }))}
              placeholder="Filter sessions by text…"
            />
          </label>
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Banner layers (columns)</p>
          <div className="mt-2 space-y-3">
            {bannerLayers.map((layer, layerIdx) => (
              <div key={layerIdx} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase text-slate-500">Layer {layerIdx + 1}</span>
                  {bannerLayers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBannerLayers((prev) => prev.filter((_, i) => i !== layerIdx))}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUAL_BANNER_FIELDS.map((field) => (
                    <button
                      key={field.id}
                      type="button"
                      onClick={() => toggleBannerField(layerIdx, field.id)}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        layer.includes(field.id)
                          ? 'bg-[var(--et-teal)] text-white'
                          : 'bg-white text-slate-600 ring-1 ring-slate-200'
                      }`}
                    >
                      {field.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setBannerLayers((prev) => [...prev, []])}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
            >
              <Plus size={12} /> Add banner layer
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showColPct} onChange={(e) => setShowColPct(e.target.checked)} />
            Column %
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showRowPct} onChange={(e) => setShowRowPct(e.target.checked)} />
            Row %
          </label>
          <label className="min-w-[10rem] flex-1">
            <span className="mb-1 block text-slate-500">Filter by tag</span>
            <select
              className="et-select w-full"
              value={sessionFilter.tags[0] ?? ''}
              onChange={(e) =>
                setSessionFilter((f) => ({ ...f, tags: e.target.value ? [e.target.value] : [] }))
              }
            >
              <option value="">All tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Bookmark size={13} className="text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Table presets</span>
            {presets.map((preset) => (
              <span key={preset.id} className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs ring-1 ring-teal-200">
                <button type="button" onClick={() => applyPreset(preset)} className="font-medium text-teal-900 hover:underline">
                  {preset.name}
                </button>
                <button type="button" onClick={() => void handleDeletePreset(preset.id)} className="text-teal-500 hover:text-rose-600">
                  <Trash2 size={11} />
                </button>
              </span>
            ))}
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name"
              className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-xs"
            />
            <button
              type="button"
              disabled={savingPreset}
              onClick={() => void handleSavePreset()}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--et-teal)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {savingPreset ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Row</th>
              {table.columns.map((col) => (
                <th key={col.id} className="px-3 py-2 text-right font-semibold text-slate-700">
                  {col.labels.join(' · ') || 'Total'}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold text-slate-700">Total</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="px-3 py-2 font-medium text-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRowFilter(row.id)
                      setRowFilterTags(tableFilters[row.id] ?? [])
                    }}
                    className="text-left hover:text-[var(--et-teal-dark)] hover:underline"
                    title="Set table filter for this row"
                  >
                    {row.label}
                    {tableFilters[row.id]?.length ? (
                      <span className="ml-1 text-[10px] text-[var(--et-teal)]">filtered</span>
                    ) : null}
                  </button>
                </td>
                {row.counts.map((count, idx) => {
                  const colTotal = table.colTotals[idx] || 0
                  const colPct = colTotal > 0 ? Math.round((count / colTotal) * 100) : 0
                  const rowPct = row.rowTotal > 0 ? Math.round((count / row.rowTotal) * 100) : 0
                  return (
                    <td key={`${row.id}-${idx}`} className="px-3 py-2 text-right tabular-nums text-slate-700">
                      <div>{count}</div>
                      {(showColPct || showRowPct) && (
                        <div className="text-[10px] text-slate-400">
                          {showColPct && `${colPct}% col`}
                          {showColPct && showRowPct && ' · '}
                          {showRowPct && `${rowPct}% row`}
                        </div>
                      )}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">{row.rowTotal}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-medium">
              <td className="px-3 py-2 text-slate-700">Column total</td>
              {table.colTotals.map((total, idx) => (
                <td key={idx} className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {total}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                {table.rows.reduce((sum, row) => sum + row.rowTotal, 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {activeRowFilter && (
        <div className="rounded-xl border border-[var(--et-teal)]/30 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Table filter — {activeRowFilter}</p>
          <p className="mt-1 text-xs text-slate-500">Require these tags in addition to the row match.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setRowFilterTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                  )
                }
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  rowFilterTags.includes(tag)
                    ? 'bg-[var(--et-teal)] text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={saveRowFilter} className="et-btn-primary text-xs">
              Apply row filter
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveRowFilter(null)
                setRowFilterTags([])
              }}
              className="et-btn-secondary text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
