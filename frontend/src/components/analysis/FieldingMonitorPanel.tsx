import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type FieldingStats } from '../../api/client'

interface Props {
  surveyId: number
  completionStatus: string
  embedded?: boolean
  nested?: boolean
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function FieldingMonitorPanel({ surveyId, completionStatus, embedded, nested }: Props) {
  const [stats, setStats] = useState<FieldingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setStats(await api.getFieldingStats(surveyId, completionStatus))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fielding data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [surveyId, completionStatus])

  if (loading && !stats) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
      </div>
    )
  }

  const content = (
    <div className={`mx-auto max-w-5xl space-y-6 ${nested ? '' : ''}`}>
        {!embedded && (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp size={20} className="text-[var(--et-teal)]" />
              <h2 className="font-display text-xl font-semibold text-slate-900">Fielding monitor</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Completion pace and interviewer throughput for the selected sample.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </header>
        )}

        {embedded && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
          </div>
        )}

        {error && <p className="text-sm text-rose-700">{error}</p>}

        {stats && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase text-slate-400">In sample</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{stats.total_responses.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase text-slate-400">Avg interview time</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {formatDuration(stats.average_completion_seconds)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase text-slate-400">Fielding days</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{stats.daily.length}</p>
              </div>
            </div>

            {!stats.has_submit_dates ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Submit dates were not found in the export — daily charts are unavailable for this survey.
              </p>
            ) : stats.daily.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Daily completes</h3>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="var(--et-teal)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            {stats.by_interviewer.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Completes by interviewer</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-slate-500">
                        <th className="px-3 py-2">Interviewer</th>
                        <th className="px-3 py-2">Completes</th>
                        <th className="px-3 py-2">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.by_interviewer.map((row) => (
                        <tr key={row.interviewer}>
                          <td className="px-3 py-2 font-medium text-slate-800">{row.interviewer}</td>
                          <td className="px-3 py-2 tabular-nums">{row.count}</td>
                          <td className="px-3 py-2 tabular-nums text-slate-600">
                            {stats.total_responses > 0
                              ? `${Math.round((row.count / stats.total_responses) * 100)}%`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
  )

  if (nested) {
    return content
  }

  return (
    <div className={`${embedded ? 'h-full' : 'flex-1'} overflow-y-auto bg-[var(--canvas-subtle)] p-4 sm:p-6 et-scroll`}>
      {content}
    </div>
  )
}
