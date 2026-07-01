import { useCallback, useEffect, useState } from 'react'
import { Download, FileText, Layers, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { AiStatusBadge } from '../ai/AiAssistPanel'
import {
  api,
  type AiStatus,
  type AnalysisBookmark,
  type BannerRequest,
  type PmAgentDraft,
  type ReportSectionPayload,
  type SlidePlanItem,
  type SurveyVariable,
} from '../../api/client'
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
  surveyTitle?: string
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
  surveyTitle,
  completionStatus,
  variables,
  filters,
  filterTree,
}: Props) {
  const [sections, setSections] = useState<ReportSection[]>([newSection()])
  const [bookmarks, setBookmarks] = useState<AnalysisBookmark[]>([])
  const [format, setFormat] = useState<'pdf' | 'pptx'>('pptx')
  const [aiNarrative, setAiNarrative] = useState(false)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [slidePlan, setSlidePlan] = useState<Record<string, SlidePlanItem>>({})
  const [planReady, setPlanReady] = useState(false)
  const [generatingPlan, setGeneratingPlan] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [generatingTopline, setGeneratingTopline] = useState(false)
  const [reportDraft, setReportDraft] = useState<PmAgentDraft | null>(null)
  const [toplineDraft, setToplineDraft] = useState<PmAgentDraft | null>(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getBookmarks(surveyId)
      .then((r) => setBookmarks(r.bookmarks ?? []))
      .catch(() => setBookmarks([]))
  }, [surveyId])

  useEffect(() => {
    api
      .getAiStatus()
      .then(setAiStatus)
      .catch(() => setAiStatus({ configured: false, provider: null, model: null, hints: {} }))
  }, [])

  const crosstabBookmarks = bookmarks.filter((b) => b.kind === 'crosstab')
  const deckTitle = surveyTitle?.trim() || `Survey ${surveyId}`

  const addSection = () => {
    setSections((s) => [...s, newSection()])
    setPlanReady(false)
  }
  const removeSection = (id: string) => {
    setSections((s) => s.filter((x) => x.id !== id))
    setSlidePlan((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setPlanReady(false)
  }
  const updateSection = (id: string, patch: Partial<ReportSection>) => {
    setSections((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    setPlanReady(false)
  }

  const buildSectionPayloads = useCallback((): ReportSectionPayload[] => {
    const payload = filterPayload(filters, filterTree)
    const out: ReportSectionPayload[] = []
    for (const section of sections) {
      if (section.kind === 'profile' && section.variable_id) {
        out.push({
          section_id: section.id,
          label: section.label,
          report_type: 'profile',
          variable_id: section.variable_id,
          completion_status: completionStatus,
          filters: payload.filters,
          filter_tree: payload.filter_tree,
        })
      } else if (section.kind === 'banner' && section.bookmark_id) {
        const bm = crosstabBookmarks.find((b) => b.id === section.bookmark_id)
        const req = bm?.config?.banner_request as BannerRequest | undefined
        if (req) {
          out.push({
            section_id: section.id,
            label: section.label,
            report_type: 'banner',
            completion_status: completionStatus,
            banner_request: req,
          })
        }
      }
    }
    return out
  }, [sections, completionStatus, filters, filterTree, crosstabBookmarks])

  const sectionPayload = useCallback(
    (section: ReportSection) => {
      const payloads = buildSectionPayloads()
      return payloads.find((p) => p.section_id === section.id) ?? null
    },
    [buildSectionPayloads],
  )

  const exportSection = useCallback(
    async (section: ReportSection) => {
      const base = sectionPayload(section)
      if (!base) throw new Error('Section is not configured')
      const plan = slidePlan[section.id]
      await api.exportReport(
        surveyId,
        {
          format,
          report_type: base.report_type,
          variable_id: base.variable_id,
          completion_status: base.completion_status,
          filter_tree: base.filter_tree,
          banner_request: base.banner_request,
          ai_narrative: aiNarrative && !plan,
        },
        `${section.label.replace(/\W+/g, '_')}.${format === 'pdf' ? 'pdf' : 'pptx'}`,
      )
    },
    [surveyId, format, aiNarrative, sectionPayload, slidePlan],
  )

  async function handleGeneratePlan() {
    const payloads = buildSectionPayloads()
    if (payloads.length === 0) {
      setError('Configure at least one section before generating a slide plan')
      return
    }
    setGeneratingPlan(true)
    setError(null)
    try {
      const res = await api.previewReportSlidePlan(surveyId, {
        deck_title: `${deckTitle} — Research findings`,
        sections: payloads,
      })
      const byId: Record<string, SlidePlanItem> = {}
      for (const slide of res.slides) {
        byId[slide.section_id] = slide
      }
      setSlidePlan(byId)
      setPlanReady(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Slide plan generation failed')
    } finally {
      setGeneratingPlan(false)
    }
  }

  async function handleGenerateTopline() {
    const payloads = buildSectionPayloads()
    if (payloads.length === 0) {
      setError('Configure at least one section before generating a topline')
      return
    }
    setGeneratingTopline(true)
    setError(null)
    try {
      const draft = await api.runToplineAgent(surveyId, {
        deck_title: `${deckTitle} — Topline`,
        sections: payloads,
      })
      setToplineDraft(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Topline agent failed')
    } finally {
      setGeneratingTopline(false)
    }
  }

  async function handleGenerateReportDraft() {
    const payloads = buildSectionPayloads()
    if (payloads.length === 0) {
      setError('Configure at least one section before drafting the report')
      return
    }
    setGeneratingReport(true)
    setError(null)
    try {
      const draft = await api.runReportWritingAgent(surveyId, {
        deck_title: `${deckTitle} — Research report`,
        sections: payloads,
      })
      setReportDraft(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report writing agent failed')
    } finally {
      setGeneratingReport(false)
    }
  }

  function updateSlidePlan(sectionId: string, patch: Partial<SlidePlanItem>) {
    setSlidePlan((prev) => ({
      ...prev,
      [sectionId]: { ...prev[sectionId], section_id: sectionId, ...patch },
    }))
  }

  async function handleExportDeck() {
    const payloads = buildSectionPayloads()
    if (payloads.length === 0) {
      setError('Configure at least one section')
      return
    }
    setExporting(true)
    setError(null)
    try {
      const planItems = payloads
        .map((p) => slidePlan[p.section_id])
        .filter((x): x is SlidePlanItem => Boolean(x))
      await api.exportReportDeck(
        surveyId,
        {
          deck_title: `${deckTitle} — Research findings`,
          sections: payloads,
          slide_plan: planItems.length ? planItems : undefined,
          include_charts: true,
          ai_narrative: aiNarrative && planItems.length === 0,
        },
        `${deckTitle.replace(/\W+/g, '_')}_deck.pptx`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deck export failed')
    } finally {
      setExporting(false)
    }
  }

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

  const aiReady = aiStatus?.configured === true
  const configuredCount = buildSectionPayloads().length

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--canvas-subtle)] p-4 sm:p-6 et-scroll">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <FileText size={20} className="text-[var(--et-navy)]" />
            <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Report builder</h2>
            <AiStatusBadge status={aiStatus} />
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Build a branded Elastic Tree deck — AI slide plan, topline, full report draft, then export
            PowerPoint using your template.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-700">Separate files</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'pdf' | 'pptx')}
              className="et-select text-sm"
            >
              <option value="pdf">PDF</option>
              <option value="pptx">PowerPoint</option>
            </select>
          </label>

          <label
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              aiReady
                ? 'border-[var(--et-yellow)]/40 bg-[var(--et-yellow-light)]'
                : 'border-[var(--et-gray-200)] bg-[var(--et-gray-50)] text-[var(--muted)]'
            }`}
            title={
              aiReady
                ? `Using ${aiStatus?.provider} (${aiStatus?.model})`
                : 'Add ANTHROPIC_API_KEY or Azure OpenAI keys on the server'
            }
          >
            <input
              type="checkbox"
              checked={aiNarrative}
              disabled={!aiReady}
              onChange={(e) => setAiNarrative(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--et-teal)]"
            />
            <Sparkles size={14} className={aiReady ? 'text-[var(--et-teal)]' : ''} />
            <span className="font-medium">AI when no plan</span>
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

        {!aiReady && (
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">AI optional.</span> Connect Claude API or
            Azure OpenAI in server env vars to generate slide plans. Export works without AI using
            data tables and charts.
          </p>
        )}

        {aiReady && (
          <div className="et-ai-panel flex flex-wrap items-center gap-2">
            <p className="w-full text-xs font-medium text-[var(--et-navy)]">
              AI connected: {aiStatus?.provider} · {aiStatus?.model}
            </p>
            <button
              type="button"
              onClick={() => void handleGeneratePlan()}
              disabled={generatingPlan || configuredCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--et-navy)]/15 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--et-navy)] hover:bg-[var(--et-yellow-light)] disabled:opacity-50"
            >
              {generatingPlan ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              Slide plan
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateTopline()}
              disabled={generatingTopline || configuredCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--et-navy)]/15 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--et-navy)] hover:bg-[var(--et-yellow-light)] disabled:opacity-50"
            >
              {generatingTopline ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              Topline report
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateReportDraft()}
              disabled={generatingReport || configuredCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg et-btn-accent px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {generatingReport ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}
              Full report draft
            </button>
            {planReady && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
                Plan ready — edit below before export
              </span>
            )}
          </div>
        )}

        {!aiReady && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleGenerateReportDraft()}
              disabled={generatingReport || configuredCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {generatingReport ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}
              Report writing agent (template)
            </button>
          </div>
        )}

        {toplineDraft && (
          <div className="rounded-xl border border-[var(--et-yellow)]/30 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--et-navy)]">
                Topline {toplineDraft.configured ? '(AI)' : '(template)'}
              </div>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(toplineDraft.draft_markdown)}
                className="text-xs font-medium text-[var(--et-navy)] hover:underline"
              >
                Copy markdown
              </button>
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold text-[var(--ink)]">{toplineDraft.title}</h3>
            <div className="mt-3 max-h-56 space-y-3 overflow-y-auto et-scroll">
              {toplineDraft.sections.map((s) => (
                <section key={s.heading}>
                  <h4 className="text-sm font-semibold text-[var(--ink)]">{s.heading}</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">{s.body}</p>
                </section>
              ))}
            </div>
          </div>
        )}

        {reportDraft && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--et-navy)]">
                Report draft {reportDraft.configured ? '(AI)' : '(template)'}
              </div>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(reportDraft.draft_markdown)}
                className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
              >
                Copy markdown
              </button>
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold text-slate-900">{reportDraft.title}</h3>
            <div className="mt-3 max-h-80 space-y-3 overflow-y-auto et-scroll">
              {reportDraft.sections.map((s) => (
                <section key={s.heading}>
                  <h4 className="text-sm font-semibold text-slate-800">{s.heading}</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{s.body}</p>
                </section>
              ))}
            </div>
            {reportDraft.actions.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                {reportDraft.actions.map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-3">
          {sections.map((section, index) => {
            const plan = slidePlan[section.id]
            return (
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

                {plan && (
                  <div className="mt-3 space-y-2 rounded-lg border border-[var(--et-teal)]/20 bg-[var(--et-teal-light)]/10 p-3">
                    <label className="block text-xs">
                      <span className="font-semibold text-slate-700">Slide title</span>
                      <input
                        type="text"
                        value={plan.title}
                        onChange={(e) =>
                          updateSlidePlan(section.id, { title: e.target.value, bullets: plan.bullets })
                        }
                        className="et-input mt-1 w-full text-sm"
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="font-semibold text-slate-700">Bullets (one per line)</span>
                      <textarea
                        value={(plan.bullets ?? []).join('\n')}
                        onChange={(e) =>
                          updateSlidePlan(section.id, {
                            title: plan.title,
                            bullets: e.target.value
                              .split('\n')
                              .map((l) => l.trim())
                              .filter(Boolean),
                          })
                        }
                        rows={4}
                        className="et-input mt-1 w-full text-sm"
                      />
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleExportDeck()}
            disabled={exporting || configuredCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
            Export merged deck (.pptx)
          </button>
          <button
            type="button"
            onClick={() => void handleExportAll()}
            disabled={exporting || sections.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Export separate files
          </button>
        </div>
      </div>
    </div>
  )
}
