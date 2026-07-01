import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  api,
  type QualAsset,
  type QualAssetInput,
  type QualSearchHit,
  type QualSummaryResult,
} from '../../api/client'
import { EmptyState, ErrorState } from '../States'

type Tab = 'library' | 'search' | 'summary'

const STATUS_LABELS = {
  draft: 'Draft',
  reviewed: 'Reviewed',
  coded: 'Coded',
} as const

const EMPTY_FORM: QualAssetInput = {
  title: '',
  asset_type: 'transcript',
  content: '',
  respondent_id: '',
  moderator: '',
  tags: [],
  status: 'draft',
}

interface Props {
  surveyId: number
}

export function QualPanel({ surveyId }: Props) {
  const [tab, setTab] = useState<Tab>('library')
  const [assets, setAssets] = useState<QualAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<QualAssetInput>(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<QualSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [summary, setSummary] = useState<QualSummaryResult | null>(null)
  const [summaryFocus, setSummaryFocus] = useState('')
  const [summarizing, setSummarizing] = useState(false)

  const selected = useMemo(
    () => assets.find((a) => a.id === selectedId) ?? null,
    [assets, selectedId],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getQualAssets(surveyId)
      setAssets(res.assets)
      if (res.assets.length && !selectedId) setSelectedId(res.assets[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load qual library')
    } finally {
      setLoading(false)
    }
  }, [surveyId, selectedId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) return
    setSaving(true)
    setError(null)
    try {
      const tags = (form.tags ?? []).filter(Boolean)
      const created = await api.createQualAsset(surveyId, { ...form, tags })
      setAssets((prev) => [created, ...prev])
      setSelectedId(created.id)
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(assetId: string) {
    if (!window.confirm('Delete this qual document?')) return
    try {
      await api.deleteQualAsset(surveyId, assetId)
      setAssets((prev) => prev.filter((a) => a.id !== assetId))
      if (selectedId === assetId) setSelectedId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  async function handleStatusChange(assetId: string, status: QualAsset['status']) {
    try {
      const updated = await api.updateQualAsset(surveyId, assetId, { status })
      setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  async function runSearch() {
    const q = searchQuery.trim()
    if (!q) {
      setSearchHits([])
      return
    }
    setSearching(true)
    try {
      const res = await api.searchQualAssets(surveyId, q)
      setSearchHits(res.hits)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  async function runSummary() {
    setSummarizing(true)
    setError(null)
    try {
      const res = await api.generateQualSummary(surveyId, {
        focus: summaryFocus.trim() || undefined,
        asset_ids: selectedId ? [selectedId] : undefined,
      })
      setSummary(res)
      setTab('summary')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Summary failed')
    } finally {
      setSummarizing(false)
    }
  }

  function handleFileUpload(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      setForm((f) => ({
        ...f,
        title: f.title || file.name.replace(/\.[^.]+$/, ''),
        content: text.slice(0, 500_000),
      }))
      setShowForm(true)
    }
    reader.readAsText(file)
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--canvas-subtle)]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <MessageSquare size={22} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">Qual library</h2>
              <p className="text-xs text-slate-500">
                Upload transcripts and session notes, search across sessions, and generate thematic summaries.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Upload size={14} />
              Import .txt
              <input
                type="file"
                accept=".txt,.vtt,.srt,.md,text/plain"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                  e.target.value = ''
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setShowForm(true)
                setForm(EMPTY_FORM)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              <Plus size={14} />
              Add session
            </button>
          </div>
        </div>
        <div className="mt-3 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(['library', 'search', 'summary'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                tab === key ? 'bg-white text-[var(--et-teal-dark)] shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <ErrorState message={error} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 et-scroll">
        {showForm && (
          <div className="mb-6 rounded-xl border border-[var(--et-teal)]/30 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">New qual document</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-600">Title</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="et-input w-full"
                  placeholder="e.g. FG1 — London, 12 Mar"
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block font-medium text-slate-600">Type</span>
                <select
                  value={form.asset_type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, asset_type: e.target.value as QualAssetInput['asset_type'] }))
                  }
                  className="et-select w-full"
                >
                  <option value="transcript">Transcript</option>
                  <option value="session_note">Session note</option>
                </select>
              </label>
              <label className="text-xs">
                <span className="mb-1 block font-medium text-slate-600">Respondent ID</span>
                <input
                  value={form.respondent_id ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, respondent_id: e.target.value }))}
                  className="et-input w-full"
                  placeholder="R001"
                />
              </label>
              <label className="text-xs sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-600">Content</span>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={8}
                  className="et-input w-full font-mono text-xs"
                  placeholder="Paste transcript or moderator notes…"
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={saving || !form.title.trim() || !form.content.trim()}
                onClick={() => void handleSave()}
                className="rounded-lg bg-[var(--et-teal)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save to library'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {tab === 'library' && (
          <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
            <aside className="space-y-2">
              {assets.length === 0 ? (
                <EmptyState
                  title="No qual material yet"
                  description="Import a .txt transcript or add a session manually to get started."
                />
              ) : (
                assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelectedId(asset.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selectedId === asset.id
                        ? 'border-[var(--et-teal)] bg-[var(--et-teal-light)]/30'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-900">{asset.title}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {asset.asset_type === 'transcript' ? 'Transcript' : 'Session note'} ·{' '}
                      {asset.word_count.toLocaleString()} words
                    </p>
                  </button>
                ))
              )}
            </aside>
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{selected.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {selected.respondent_id && <>Respondent {selected.respondent_id} · </>}
                        Added {new Date(selected.created_at * 1000).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={selected.status}
                        onChange={(e) =>
                          void handleStatusChange(selected.id, e.target.value as QualAsset['status'])
                        }
                        className="et-select text-xs"
                      >
                        {(Object.keys(STATUS_LABELS) as QualAsset['status'][]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleDelete(selected.id)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <pre className="mt-4 max-h-[min(28rem,60vh)] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-700 et-scroll">
                    {selected.content}
                  </pre>
                  <button
                    type="button"
                    onClick={() => void runSummary()}
                    disabled={summarizing}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[var(--et-teal)]/30 bg-[var(--et-teal-light)]/20 px-3 py-2 text-xs font-medium text-[var(--et-teal-dark)]"
                  >
                    {summarizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Summarise this session
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-slate-500">
                  <FileText size={32} className="mb-3 text-slate-300" />
                  Select a document from the list
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'search' && (
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
                  placeholder="Search transcripts, respondents, tags…"
                  className="et-input et-input-with-icon w-full"
                />
              </div>
              <button
                type="button"
                onClick={() => void runSearch()}
                disabled={searching}
                className="rounded-lg bg-[var(--et-teal)] px-4 py-2 text-xs font-medium text-white"
              >
                {searching ? '…' : 'Search'}
              </button>
            </div>
            {searchHits.length === 0 && searchQuery.trim() ? (
              <p className="text-sm text-slate-500">No matches.</p>
            ) : (
              <ul className="space-y-3">
                {searchHits.map((hit) => (
                  <li key={hit.asset_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => {
                        setSelectedId(hit.asset_id)
                        setTab('library')
                      }}
                    >
                      <p className="font-medium text-[var(--et-teal-dark)]">{hit.title}</p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">{hit.snippet}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'summary' && (
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-xs">
                <span className="mb-1 block font-medium text-slate-600">Review focus (optional)</span>
                <input
                  value={summaryFocus}
                  onChange={(e) => setSummaryFocus(e.target.value)}
                  className="et-input w-full"
                  placeholder="e.g. packaging perceptions, price sensitivity"
                />
              </label>
              <button
                type="button"
                onClick={() => void runSummary()}
                disabled={summarizing || assets.length === 0}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {summarizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Generate thematic summary
                {selectedId ? ' (selected session)' : ` (${assets.length} sessions)`}
              </button>
            </div>
            {summary ? (
              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{summary.asset_count} document(s)</span>
                  {summary.ai_used && (
                    <span className="rounded-full bg-[var(--et-teal-light)] px-2 py-0.5 font-medium text-[var(--et-teal-dark)]">
                      AI synthesis
                    </span>
                  )}
                </div>
                {summary.themes.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {summary.themes.map((theme) => (
                      <span
                        key={theme}
                        className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {summary.summary}
                </div>
              </article>
            ) : (
              <EmptyState
                title="No summary yet"
                description="Generate a thematic summary across all uploaded sessions, or select one session in the library tab."
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
