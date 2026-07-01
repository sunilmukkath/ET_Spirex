import { useCallback, useEffect, useState } from 'react'
import { FileText, Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import type { QualAsset, QualReportSection, QualSummaryResult } from '../../api/client'
import type { QualWorkspaceScope } from '../../lib/qualScope'
import { qualWorkspaceApi } from '../../lib/qualScope'
import { EmptyState } from '../States'

interface Props {
  scope: QualWorkspaceScope
  assets: QualAsset[]
  summary: QualSummaryResult | null
  onGenerateSummary: () => Promise<void>
  summarizing: boolean
}

export function QualReportsPanel({
  scope,
  assets,
  summary,
  onGenerateSummary,
  summarizing,
}: Props) {
  const [sections, setSections] = useState<QualReportSection[]>([])
  const [savedReports, setSavedReports] = useState<
    Array<{ id: string; title: string; sections: QualReportSection[]; created_at: number }>
  >([])
  const [reportTitle, setReportTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (scope.type !== 'pm') {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const meta = await qualWorkspaceApi.getMeta(scope)
      setSections(meta?.report_template.sections ?? [])
      setSavedReports(meta?.reports ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report template')
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    void load()
  }, [load])

  async function persistTemplate(next: QualReportSection[]) {
    if (scope.type !== 'pm') return
    setSections(next)
    await qualWorkspaceApi.setReportTemplate(scope, next)
  }

  function updateSection(id: string, patch: Partial<QualReportSection>) {
    const next = sections.map((s) => (s.id === id ? { ...s, ...patch } : s))
    void persistTemplate(next)
  }

  function addSection() {
    const next: QualReportSection[] = [
      ...sections,
      {
        id: `sec_${Date.now()}`,
        heading: 'New section',
        section_type: 'custom',
        enabled: true,
        body: '',
      },
    ]
    void persistTemplate(next)
  }

  async function fillFromAnalysis() {
    await onGenerateSummary()
  }

  useEffect(() => {
    if (!summary) return
    const next = sections.map((section) => {
      if (!section.enabled || section.body.trim()) return section
      if (section.section_type === 'executive_summary' || section.section_type === 'themes') {
        return { ...section, body: summary.summary }
      }
      if (section.section_type === 'verbatims' && assets[0]) {
        return { ...section, body: assets.slice(0, 3).map((a) => `**${a.title}**\n${a.content.slice(0, 400)}…`).join('\n\n') }
      }
      return section
    })
    if (JSON.stringify(next) !== JSON.stringify(sections)) void persistTemplate(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when summary arrives
  }, [summary])

  async function handleSaveReport() {
    if (scope.type !== 'pm') return
    setSaving(true)
    setError(null)
    try {
      const saved = await qualWorkspaceApi.saveReport(scope, {
        title: reportTitle.trim() || `Qual report ${new Date().toLocaleDateString()}`,
        sections: sections.filter((s) => s.enabled),
      })
      setSavedReports((prev) => [saved, ...prev])
      setReportTitle('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save report')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteReport(reportId: string) {
    if (scope.type !== 'pm') return
    await qualWorkspaceApi.deleteReport(scope, reportId)
    setSavedReports((prev) => prev.filter((r) => r.id !== reportId))
  }

  if (scope.type !== 'pm') {
    return (
      <EmptyState
        title="Reports need a PM project"
        description="Select an Operations qual or mixed project to define report structure and save reports."
      />
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={28} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Report structure</h3>
            <p className="text-xs text-slate-500">Define sections for this project&apos;s qual deliverable.</p>
          </div>
          <button
            type="button"
            onClick={() => void fillFromAnalysis()}
            disabled={summarizing || assets.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--et-teal)]/30 bg-[var(--et-teal-light)]/20 px-3 py-1.5 text-xs font-medium text-[var(--et-teal-dark)] disabled:opacity-50"
          >
            {summarizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Pull from analysis
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {sections.map((section) => (
            <div key={section.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={section.enabled}
                  onChange={(e) => updateSection(section.id, { enabled: e.target.checked })}
                />
                <input
                  className="et-input min-w-[12rem] flex-1 text-sm"
                  value={section.heading}
                  onChange={(e) => updateSection(section.id, { heading: e.target.value })}
                />
                <select
                  className="et-select text-xs"
                  value={section.section_type}
                  onChange={(e) =>
                    updateSection(section.id, {
                      section_type: e.target.value as QualReportSection['section_type'],
                    })
                  }
                >
                  <option value="executive_summary">Executive summary</option>
                  <option value="methodology">Methodology</option>
                  <option value="themes">Themes</option>
                  <option value="verbatims">Verbatims</option>
                  <option value="recommendations">Recommendations</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <textarea
                className="et-input mt-2 w-full text-xs"
                rows={4}
                value={section.body}
                onChange={(e) => updateSection(section.id, { body: e.target.value })}
                placeholder="Section content…"
              />
            </div>
          ))}
          <button type="button" onClick={addSection} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--et-teal-dark)] hover:underline">
            <Plus size={12} /> Add section
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Save report snapshot</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="et-input min-w-[16rem] flex-1 text-sm"
            value={reportTitle}
            onChange={(e) => setReportTitle(e.target.value)}
            placeholder="Report title"
          />
          <button
            type="button"
            disabled={saving || sections.every((s) => !s.enabled)}
            onClick={() => void handleSaveReport()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save report
          </button>
        </div>
      </div>

      {savedReports.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Saved reports</h3>
          {savedReports.map((report) => (
            <article key={report.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-medium text-slate-900">{report.title}</h4>
                  <p className="text-[10px] text-slate-400">
                    {new Date(report.created_at * 1000).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteReport(report.id)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {report.sections.map((section) => (
                  <section key={section.id}>
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.heading}</h5>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{section.body || '—'}</p>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {savedReports.length === 0 && (
        <div className="flex flex-col items-center py-8 text-center text-sm text-slate-500">
          <FileText size={28} className="mb-2 text-slate-300" />
          No saved reports yet — build your structure above and save a snapshot.
        </div>
      )}
    </div>
  )
}
