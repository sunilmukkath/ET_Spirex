import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, PenLine, Plus, Sparkles } from 'lucide-react'
import { api, type EtStudioSurveyListItem } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

export function SurveyStudioPage() {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [surveys, setSurveys] = useState<EtStudioSurveyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const status = await api.getStudioStatus()
      setAvailable(status.available)
      if (!status.available) {
        setSurveys([])
        return
      }
      const res = await api.listStudioSurveys()
      setSurveys(res.surveys)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Survey Studio')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = title.trim()
    if (!name) return
    setCreating(true)
    try {
      const survey = await api.createStudioSurvey({ title: name })
      setTitle('')
      window.location.href = `/studio/${survey.workspace_id}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
      setCreating(false)
    }
  }

  if (loading) return <LoadingState message="Loading Survey Studio…" />

  return (
    <div className="et-page et-page-wide py-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles size={20} className="text-[var(--et-teal)]" />
            <h1 className="text-2xl font-semibold text-slate-900">Survey Studio</h1>
          </div>
          <p className="max-w-2xl text-sm text-slate-600">
            Program quant surveys inside ET Scout — customisable blocks, question types, and a hosted
            collector. Analysis, QC, and reports use the same workspace as LimeSurvey studies.
          </p>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {available === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Survey Studio needs <span className="font-mono">DATABASE_URL</span> (Postgres) on Railway — the same
          database used for Operations. Add it in Railway variables and redeploy.
        </div>
      )}

      {available && (
        <>
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="mb-8 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="min-w-[16rem] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">New survey title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. UK Brand Tracker Wave 3"
                className="et-input w-full"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Create survey
            </button>
          </form>

          {surveys.length === 0 ? (
            <EmptyState
              title="No ET surveys yet"
              description="Create your first native survey to replace LimeSurvey programming for new studies."
            />
          ) : (
            <ul className="space-y-3">
              {surveys.map((s) => (
                <li
                  key={s.workspace_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">{s.title}</p>
                    <p className="text-xs text-slate-500">
                      ID {s.workspace_id} · {s.status} · {s.response_count} completes · /s/{s.public_slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/studio/${s.workspace_id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <PenLine size={14} />
                      Build
                    </Link>
                    <Link
                      to={`/projects/${s.workspace_id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--et-navy)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    >
                      Open workspace
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
