import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, RefreshCw, Save, Users } from 'lucide-react'
import { api, type DataQualityResult, type InterviewerQcResult, type QcConfig, type SurveyVariable } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { saveUserFieldDefaults } from '../../lib/surveyFieldDefaults'

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
  duplicateStats?: DataQualityResult['interviewer_duplicates'] | null
  gpsProximityStats?: DataQualityResult['interviewer_gps_proximity'] | null
  shortGapStats?: DataQualityResult['interviewer_short_gap'] | null
}

export function InterviewerQcTab({
  surveyId,
  variables,
  qcConfig,
  onConfigChange,
  onSaveConfig,
  savingConfig,
  hasScan,
  duplicateStats,
  gpsProximityStats,
  shortGapStats,
}: Props) {
  const { user } = useAuth()
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
            onChange={(e) => {
              const interviewerId = e.target.value || null
              onConfigChange({
                ...qcConfig,
                interviewer_variable_id: interviewerId,
              })
              if (user?.username) {
                const v = interviewerId ? variables.find((item) => item.id === interviewerId) : null
                saveUserFieldDefaults(user.username, { interviewerCode: v?.code ?? null })
              }
            }}
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
        {duplicateStats?.available === false && duplicateStats.message && (
          <p className="mt-3 text-sm text-amber-800">{duplicateStats.message}</p>
        )}
        {duplicateStats?.available && (duplicateStats.by_interviewer?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
            <p className="text-xs font-semibold text-amber-900">
              Duplicate answer patterns (≥{duplicateStats.threshold_pct ?? 85}% match)
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-900/90">
              {duplicateStats.by_interviewer?.map((row) => (
                <li key={row.interviewer}>
                  <span className="font-medium">{row.interviewer}</span>
                  {' — '}
                  {row.flagged_count} flagged record{row.flagged_count === 1 ? '' : 's'}
                  {row.max_similarity_pct ? ` (up to ${row.max_similarity_pct}% match)` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {gpsProximityStats?.available === false && gpsProximityStats.message && (
          <p className="mt-3 text-sm text-amber-800">{gpsProximityStats.message}</p>
        )}
        {gpsProximityStats?.available && (gpsProximityStats.by_interviewer?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/80 p-3">
            <p className="text-xs font-semibold text-rose-900">
              Same GPS spot (within {gpsProximityStats.proximity_meters ?? 10}m
              {(gpsProximityStats.min_cluster ?? 2) > 2
                ? `, min ${gpsProximityStats.min_cluster} interviews`
                : ''}
              )
            </p>
            <ul className="mt-2 space-y-1 text-xs text-rose-900/90">
              {gpsProximityStats.by_interviewer?.map((row) => (
                <li key={row.interviewer}>
                  <span className="font-medium">{row.interviewer}</span>
                  {' — '}
                  {row.flagged_count} flagged record{row.flagged_count === 1 ? '' : 's'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {shortGapStats?.available === false && shortGapStats.message && (
          <p className="mt-3 text-sm text-amber-800">{shortGapStats.message}</p>
        )}
        {shortGapStats?.available && (shortGapStats.by_interviewer?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/80 p-3">
            <p className="text-xs font-semibold text-orange-900">
              Short gaps between interviews (&lt;{Math.round((shortGapStats.min_gap_seconds ?? 300) / 60)} min)
            </p>
            <ul className="mt-2 space-y-1 text-xs text-orange-900/90">
              {shortGapStats.by_interviewer?.map((row) => (
                <li key={row.interviewer}>
                  <span className="font-medium">{row.interviewer}</span>
                  {' — '}
                  {row.flagged_count} flagged record{row.flagged_count === 1 ? '' : 's'}
                </li>
              ))}
            </ul>
          </div>
        )}
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
