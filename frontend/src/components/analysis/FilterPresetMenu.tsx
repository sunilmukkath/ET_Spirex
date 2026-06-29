import { useCallback, useEffect, useState } from 'react'
import { Bookmark, Loader2, Save, Trash2 } from 'lucide-react'
import { api, type FilterGroup, type FilterPreset, type FilterSpec } from '../../api/client'

interface Props {
  surveyId: number
  filters: FilterSpec[]
  filterTree: FilterGroup | null
  onApply: (preset: FilterPreset) => void
}

export function FilterPresetMenu({ surveyId, filters, filterTree, onApply }: Props) {
  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { presets: rows } = await api.getFilterPresets(surveyId)
      setPresets(rows)
    } catch {
      setPresets([])
    } finally {
      setLoading(false)
    }
  }, [surveyId])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave() {
    const label = name.trim() || `Preset ${presets.length + 1}`
    setSaving(true)
    try {
      await api.createFilterPreset(surveyId, {
        name: label,
        filter_tree: filterTree,
        filters: filterTree ? [] : filters,
      })
      setName('')
      setOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await api.deleteFilterPreset(surveyId, id)
    await load()
  }

  const hasFilters = Boolean(filterTree?.children?.length || filters.length)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs ring-1 ring-teal-200">
          <button type="button" onClick={() => onApply(p)} className="font-medium text-teal-900 hover:underline">
            {p.name}
          </button>
          <button type="button" onClick={() => handleDelete(p.id)} className="text-teal-500 hover:text-red-600">
            <Trash2 size={11} />
          </button>
        </span>
      ))}
      {loading && <Loader2 className="animate-spin text-slate-400" size={14} />}
      {open ? (
        <span className="inline-flex items-center gap-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Preset name"
            className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[var(--et-teal)]"
          />
          <button
            type="button"
            disabled={!hasFilters || saving}
            onClick={handleSave}
            className="rounded-lg bg-[var(--et-teal)] px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? '…' : 'Save'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={!hasFilters}
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40"
        >
          <Save size={12} /> Save preset
        </button>
      )}
      {presets.length > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
          <Bookmark size={11} /> Audiences
        </span>
      )}
    </div>
  )
}
