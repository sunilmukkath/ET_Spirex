import { useEffect, useState } from 'react'
import { Download, Loader2, Users } from 'lucide-react'
import { api, type InterviewerQcResult, type QcConfig, type SurveyVariable } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { captureQcDefaults, saveUserFieldDefaults } from '../../lib/surveyFieldDefaults'
import { InterviewerQcTab } from './InterviewerQcTab'

function defaultQcConfig(): QcConfig {
  return {
    disabled_checks: [],
    kept_response_ids: [],
    excluded_response_ids: [],
    thresholds: {
      speeder_time_basis: 'average',
      speeder_custom_reference_seconds: null,
      speeder_min_seconds: 0,
      speeder_median_fraction: 0.25,
      min_array_items_straight_line: 4,
      min_text_length_gibberish: 3,
      interviewer_duplicate_similarity_pct: 85,
      interviewer_gps_proximity_meters: 10,
      interviewer_min_gap_seconds: 300,
    },
    custom_rules: [],
    straight_line_variable_ids: null,
  }
}

interface Props {
  surveyId: number
  variables: SurveyVariable[]
  embedded?: boolean
}

export function FieldTeamPanel({ surveyId, variables, embedded }: Props) {
  const { user } = useAuth()
  const [qcConfig, setQcConfig] = useState<QcConfig>(defaultQcConfig())
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
      if (user?.username) {
        saveUserFieldDefaults(user.username, captureQcDefaults(saved, variables))
      }
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
    <div className={embedded ? 'pb-6' : 'flex min-h-0 flex-1 flex-col overflow-hidden'}>
      {!embedded && (
      <div className={`shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6`}>
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

        {stats && (stats.total_completed ?? 0) > 0 && (
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
      )}

      {embedded && (
      <div className="border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center justify-end gap-3">
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
      </div>
      )}

      <div className={embedded ? 'px-4 py-4 sm:px-6' : 'min-h-0 flex-1 overflow-y-auto et-scroll'}>
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
