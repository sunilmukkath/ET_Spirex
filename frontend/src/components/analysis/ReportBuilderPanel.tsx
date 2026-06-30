import { useCallback, useEffect, useState } from 'react'
import { Download, FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import { api, type AnalysisBookmark, type BannerRequest, type SurveyVariable } from '../../api/client'
import { filterPayload } from '../../lib/filterTree'
import type { FilterGroup, FilterSpec } from '../../api/client'

interface ReportSection {
  id: string
  kind: 'profile' | 'banner'
  label: string
  variable_id?: string
  bookmark_id?: string
}

interface Props {
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  filters: FilterSpec[]
  filterTree: FilterGroup | null
}

function newSection(): ReportSection {
  return {
    id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind: 'profile',
    label: 'New section',
  }
}

export function ReportBuilderPanel({
  surveyId,
  completionStatus,
  variables,
  filters,
  filterTree,
}: Props) {
  const [sections, setSections] = useState<ReportSection[]>([newSection()])
  const [bookmarks, setBookmarks] = useState<AnalysisBookmark[]>([])
  const [format, setFormat] = useState<'pdf' | 'pptx'>('pdf')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getBookmarks(surveyId)
      .then((r) => setBookmarks(r.bookmarks ?? []))
      .catch(() => setBookmarks([]))
  }, [surveyId])

  const crosstabBookmarks = bookmarks.filter((b) => b.kind === 'crosstab')

  const addSection = () => setSections((s) => [...s, newSection()])
  const removeSection = (id: string) => setSections((s) => s.filter((x) => x.id !== id))
  const updateSection = (id: string, patch: Partial<ReportSection>) =>
    setSections((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  const exportSection = useCallback(
    async (section: ReportSection) => {
      const payload = filterPayload(filters, filterTree)
      if (section.kind === 'profile' && section.variable_id) {
        await api.exportReport(
          surveyId,
          {
            format,
            report_type: 'profile',
            variable_id: section.variable_id,
            completion_status: completionStatus,
            filters: payload.filters,
            filter_tree: payload.filter_tree,
          },
          `${section.label.replace(/\W+/g, '_')}.${format === 'pdf' ? 'pdf' : 'pptx'}`,
        )
        return
      }
      if (section.kind === 'banner' && section.bookmark_id) {
        const bm = crosstabBookmarks.find((b) => b.id === section.bookmark_id)
        const req = bm?.config?.banner_request as BannerRequest | undefined
        if (!req) throw new Error('Bookmark has no crosstab configuration')
        await api.exportReport(
          surveyId,
          {
            format,
            report_type: 'banner',
            completion_status: completionStatus,
            banner_request: req,
          },
          `${section.label.replace(/\W+/g, '_')}.${format === 'pdf' ? 'pdf' : 'pptx'}`,
        )
      }
    },
    [surveyId, completionStatus, filters, filterTree, format, crosstabBookmarks],
  )

  async function handleExportAll() {
    setExporting(true)
    setError(null)
    try {
      for (const section of sections) {
        if (section.kind === 'profile' && !section.variable_id) continue
        if (section.kind === 'banner' && !section.bookmark_id) continue
        await exportSection(section)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--canvas-subtle)] p-4 sm:p-6 et-scroll">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-[var(--et-teal)]" />
            <h2 className="font-display text-xl font-semibold text-slate-900">Report builder</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Assemble profile and crosstab sections, then export client-ready PDF or PowerPoint decks.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-700">Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'pdf' | 'pptx')}
              className="et-select text-sm"
            >
              <option value="pdf">PDF</option>
              <option value="pptx">PowerPoint</option>
            </select>
          </label>
          <button
            type="button"
            onClick={addSection}
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--et-teal-dark)] hover:underline"
          >
            <Plus size={14} />
            Add section
          </button>
        </div>

        <div className="space-y-3">
          {sections.map((section, index) => (
            <div key={section.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">#{index + 1}</span>
                <input
                  type="text"
                  value={section.label}
                  onChange={(e) => updateSection(section.id, { label: e.target.value })}
                  className="et-input min-w-[8rem] flex-1 text-sm"
                  placeholder="Section title"
                />
                <select
                  value={section.kind}
                  onChange={(e) =>
                    updateSection(section.id, {
                      kind: e.target.value as 'profile' | 'banner',
                      variable_id: undefined,
                      bookmark_id: undefined,
                    })
                  }
                  className="et-select text-sm"
                >
                  <option value="profile">Question profile</option>
                  <option value="banner">Saved crosstab</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeSection(section.id)}
                  className="rounded p-1 text-slate-400 hover:text-rose-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {section.kind === 'profile' ? (
                <select
                  value={section.variable_id ?? ''}
                  onChange={(e) => updateSection(section.id, { variable_id: e.target.value })}
                  className="et-select mt-3 w-full text-sm"
                >
                  <option value="">Select question…</option>
                  {variables.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code} — {(v.text || v.code).slice(0, 48)}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={section.bookmark_id ?? ''}
                  onChange={(e) => updateSection(section.id, { bookmark_id: e.target.value })}
                  className="et-select mt-3 w-full text-sm"
                >
                  <option value="">Select saved crosstab…</option>
                  {crosstabBookmarks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        <button
          type="button"
          onClick={() => void handleExportAll()}
          disabled={exporting || sections.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Export all sections
        </button>
      </div>
    </div>
  )
}
