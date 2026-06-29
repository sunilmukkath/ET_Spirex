import { useEffect, useState } from 'react'
import { Download, Loader2, Users } from 'lucide-react'
import { api, type InterviewerQcResult, type QcConfig, type SurveyVariable } from '../../api/client'
import { InterviewerQcTab } from './InterviewerQcTab'

interface Props {
  surveyId: number
  variables: SurveyVariable[]
}

export function FieldTeamPanel({ surveyId, variables }: Props) {
  const [qcConfig, setQcConfig] = useState<QcConfig>({
    disabled_checks: [],
    kept_response_ids: [],
    excluded_response_ids: [],
    thresholds: {},
    custom_rules: [],
  })
  const [stats, setStats] = useState<InterviewerQcResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([api.getQcConfig(surveyId), api.getInterviewerQc(surveyId)])
      .then(([cfg, result]) => {
        if (!cancelled) {
          setQcConfig(cfg)
          setStats(result)
        }
      })
      .catch(() => {
        if (!cancelled) setStats(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [surveyId])

  async function saveConfig() {
    setSavingConfig(true)
    try {
      const saved = await api.setQcConfig(surveyId, qcConfig)
      setQcConfig(saved)
    } finally {
      setSavingConfig(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-[var(--et-teal)]" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Field team</h2>
              <p className="text-xs text-slate-500">
                Interviewer throughput, completion rates, and QC rejections.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={exporting || !stats?.interviewer_variable_id}
            onClick={async () => {
              setExporting(true)
              try {
                await api.exportFieldReport(surveyId, 'interviewer-rejections', {
                  interviewerVariableId: stats?.interviewer_variable_id ?? undefined,
                })
              } finally {
                setExporting(false)
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export CSV
          </button>
        </div>

        {stats && stats.total_completed > 0 && (
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200">
              <span className="text-slate-500">Completed </span>
              <span className="font-semibold tabular-nums">{stats.total_completed}</span>
            </span>
            <span className="rounded-lg bg-rose-50 px-3 py-1.5 ring-1 ring-rose-200">
              <span className="text-rose-700">Rejected </span>
              <span className="font-semibold tabular-nums text-rose-800">{stats.total_rejected}</span>
            </span>
            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 ring-1 ring-emerald-200">
              <span className="text-emerald-700">Approved </span>
              <span className="font-semibold tabular-nums text-emerald-800">{stats.total_approved}</span>
            </span>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto et-scroll">
        <InterviewerQcTab
          surveyId={surveyId}
          variables={variables}
          qcConfig={qcConfig}
          onConfigChange={setQcConfig}
          onSaveConfig={saveConfig}
          savingConfig={savingConfig}
          hasScan
        />
      </div>
    </div>
  )
}
