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
    if (!payload.name.trim()) return
    setSaving(true)
    try {
      await api.createBookmark(surveyId, { name: payload.name, kind, config: payload.config })
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Bookmark size={13} /> Saved
      </span>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
      >
        {saving ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
        Save view
      </button>
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
  )
}
