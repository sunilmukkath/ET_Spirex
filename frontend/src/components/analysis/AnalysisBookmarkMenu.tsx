import { useCallback, useEffect, useState } from 'react'
import { Bookmark, Loader2, Save, Trash2 } from 'lucide-react'
import { api, type AnalysisBookmark } from '../../api/client'

interface Props {
  surveyId: number
  kind: AnalysisBookmark['kind']
  onSave: () => { name: string; config: Record<string, unknown> }
  onLoad: (bookmark: AnalysisBookmark) => void
}

export function AnalysisBookmarkMenu({ surveyId, kind, onSave, onLoad }: Props) {
  const [bookmarks, setBookmarks] = useState<AnalysisBookmark[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { bookmarks: rows } = await api.getBookmarks(surveyId)
      setBookmarks(rows.filter((b) => b.kind === kind))
    } catch {
      setBookmarks([])
    } finally {
      setLoading(false)
    }
  }, [surveyId, kind])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave() {
    const payload = onSave()
    const name = saveName.trim() || payload.name.trim()
    if (!name) return
    setSaving(true)
    try {
      await api.createBookmark(surveyId, { name, kind, config: payload.config })
      setSaveName('')
      setSaveOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await api.deleteBookmark(surveyId, id)
    await load()
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Bookmark size={13} /> Analysis templates
        </span>
        {saveOpen ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Template name"
              className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[var(--et-teal)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
                if (e.key === 'Escape') setSaveOpen(false)
              }}
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--et-teal)] px-2.5 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setSaveOpen(false)
                setSaveName('')
              }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              const suggested = onSave().name
              setSaveName(suggested)
              setSaveOpen(true)
            }}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            <Save size={12} />
            Save template
          </button>
        )}
        {loading && <Loader2 className="animate-spin text-slate-400" size={14} />}
        {bookmarks.map((bm) => (
          <span key={bm.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs ring-1 ring-indigo-200">
            <button type="button" onClick={() => onLoad(bm)} className="font-medium text-indigo-800 hover:underline">
              {bm.name}
            </button>
            <button type="button" onClick={() => handleDelete(bm.id)} className="text-indigo-400 hover:text-red-600">
              <Trash2 size={11} />
            </button>
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        Save your current rows, banners, metrics, filters, and per-table overrides as a reusable template shared with the whole team.
      </p>
    </div>
  )
}
