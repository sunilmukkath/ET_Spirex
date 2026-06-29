import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, RefreshCw, Save, Users } from 'lucide-react'
import { api, type InterviewerQcResult, type QcConfig, type SurveyVariable } from '../../api/client'

function isInterviewerCandidate(v: SurveyVariable): boolean {
  if (v.custom) return false
  const hay = `${v.code} ${v.text}`.toLowerCase()
  if (/interview|enumerator|field exec|field officer|supervisor|surveyor|\bfe\b/.test(hay)) return true
  return v.kind === 'single' || v.kind === 'text'
}

interface Props {
  surveyId: number
  variables: SurveyVariable[]
  qcConfig: QcConfig
  onConfigChange: (config: QcConfig) => void
  onSaveConfig: () => Promise<void>
  savingConfig: boolean
  hasScan: boolean
}

export function InterviewerQcTab({
  surveyId,
  variables,
  qcConfig,
  onConfigChange,
  onSaveConfig,
  savingConfig,
  hasScan,
}: Props) {
  const [stats, setStats] = useState<InterviewerQcResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const candidates = useMemo(() => {
    const hinted = variables.filter(isInterviewerCandidate)
    if (hinted.length > 0) return hinted
    return variables.filter((v) => !v.custom && (v.kind === 'single' || v.kind === 'text'))
  }, [variables])

  const selectedId = qcConfig.interviewer_variable_id ?? ''

  const load = useCallback(async () => {
    if (!selectedId) {
      setStats(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await api.getInterviewerQc(surveyId, selectedId)
      if (data.error && !data.rows?.length) {
        setError(data.error)
        setStats(data)
      } else {
        setStats(data)
        if (data.error) setError(data.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load interviewer QC')
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [surveyId, selectedId])

  useEffect(() => {
    if (hasScan && selectedId) void load()
    else if (!selectedId) setStats(null)
  }, [hasScan, selectedId, load])

  async function handleSaveVariable() {
    await onSaveConfig()
    if (selectedId) await load()
  }

  async function handleExport() {
    setExporting(true)
    try {
      await api.exportFieldReport(surveyId, 'interviewer-rejections', {
        interviewerVariableId: selectedId || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const checkColumns = stats?.check_columns ?? []

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[var(--et-teal)]" />
              <h3 className="text-sm font-semibold text-slate-900">Interviewer-wise QC</h3>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Compare completion and rejection rates by interviewer using your field team question.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => void handleSaveVariable()}
              disabled={savingConfig || !selectedId}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {savingConfig ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save selection
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || !selectedId || !hasScan}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting || !selectedId || !stats?.rows?.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Export CSV
            </button>
          </div>
        </div>

        <label className="mt-4 block max-w-xl text-sm">
          <span className="mb-1 block font-medium text-slate-700">Interviewer name variable</span>
          <select
            value={selectedId}
            onChange={(e) =>
              onConfigChange({
                ...qcConfig,
                interviewer_variable_id: e.target.value || null,
              })
            }
            className="et-select w-full"
          >
            <option value="">Select question…</option>
            {candidates.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} — {(v.text || v.code).slice(0, 56)}
              </option>
            ))}
          </select>
        </label>

        {!hasScan && (
          <p className="mt-3 text-sm text-amber-800">
            Run a QC scan on the Overview tab first, then return here for interviewer breakdowns.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      </div>

      {stats && stats.rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <p className="text-sm font-medium text-slate-800">{stats.interviewer_question}</p>
            <p className="text-xs text-slate-500">
              {stats.total_completed?.toLocaleString()} completed ·{' '}
              {stats.total_approved?.toLocaleString()} QC approved ·{' '}
              {stats.total_rejected?.toLocaleString()} rejected
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Interviewer</th>
                  <th className="px-4 py-2.5 text-right">Completed</th>
                  <th className="px-4 py-2.5 text-right">Approved</th>
                  <th className="px-4 py-2.5 text-right">Rejected</th>
                  <th className="px-4 py-2.5 text-right">Reject %</th>
                  {checkColumns.map((col) => (
                    <th key={col} className="px-3 py-2.5 text-right whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.rows.map((row) => (
                  <tr key={row.interviewer} className="hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{row.interviewer}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.completed}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{row.approved}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">{row.rejected}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.rejection_pct}%</td>
                    {checkColumns.map((col) => (
                      <td key={col} className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {row.checks[col] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stats && stats.rows.length === 0 && selectedId && hasScan && !loading && !error && (
        <p className="text-sm text-slate-500">No completed interviews found for this interviewer question.</p>
      )}
    </div>
  )
}
