import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText, Mic, RefreshCw } from 'lucide-react'
import { api, type PmPipelineOverview, type Project } from '../api/client'
import { QualPanel } from '../components/analysis/QualPanel'
import { EmptyState, LoadingState } from '../components/States'

type StudyOption = {
  surveyId: number
  label: string
  source: 'lime' | 'pm'
  projectId?: string
}

export function QualitativePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [limeSurveys, setLimeSurveys] = useState<Project[]>([])
  const [pipeline, setPipeline] = useState<PmPipelineOverview | null>(null)
  const [pmEnabled, setPmEnabled] = useState(false)

  const surveyParam = searchParams.get('survey')
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(() => {
    const n = Number(surveyParam)
    return Number.isFinite(n) && n > 0 ? n : null
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [surveysRaw, pmStatus] = await Promise.all([
        api.getProjects().catch(() => [] as Project[]),
        api.getPmStatus().catch(() => ({ enabled: false, ready: false })),
      ])
      const surveys = Array.isArray(surveysRaw) ? surveysRaw : surveysRaw.projects
      setLimeSurveys(surveys)
      setPmEnabled(Boolean(pmStatus.enabled && pmStatus.ready))
      if (pmStatus.enabled && pmStatus.ready) {
        setPipeline(await api.getPmPipeline())
      } else {
        setPipeline(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load studies')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const studyOptions = useMemo(() => {
    const out: StudyOption[] = []
    const seen = new Set<number>()

    if (pipeline?.projects) {
      for (const p of pipeline.projects) {
        if (p.project_type === 'quant') continue
        for (const sid of p.linked_survey_ids ?? []) {
          if (seen.has(sid)) continue
          seen.add(sid)
          out.push({
            surveyId: sid,
            label: `${p.project_name} · #${sid}`,
            source: 'pm',
            projectId: p.project_id,
          })
        }
        if (p.limesurvey_survey_id && !seen.has(p.limesurvey_survey_id)) {
          seen.add(p.limesurvey_survey_id)
          out.push({
            surveyId: p.limesurvey_survey_id,
            label: `${p.project_name} · #${p.limesurvey_survey_id}`,
            source: 'pm',
            projectId: p.project_id,
          })
        }
      }
    }

    for (const s of limeSurveys) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      out.push({
        surveyId: s.id,
        label: s.title ? `${s.title} (#${s.id})` : `Study #${s.id}`,
        source: 'lime',
      })
    }

    out.sort((a, b) => a.label.localeCompare(b.label))
    return out
  }, [pipeline, limeSurveys])

  useEffect(() => {
    if (selectedSurveyId != null) return
    const first = studyOptions[0]?.surveyId
    if (first) setSelectedSurveyId(first)
  }, [studyOptions, selectedSurveyId])

  useEffect(() => {
    const n = Number(surveyParam)
    if (Number.isFinite(n) && n > 0) setSelectedSurveyId(n)
  }, [surveyParam])

  function selectStudy(surveyId: number) {
    setSelectedSurveyId(surveyId)
    setSearchParams(
      (prev) => {
        prev.set('survey', String(surveyId))
        return prev
      },
      { replace: true },
    )
  }

  const selectedOption = studyOptions.find((o) => o.surveyId === selectedSurveyId) ?? null

  if (loading) return <LoadingState message="Loading qualitative workspace…" />

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col">
      <div className="et-page et-page-wide shrink-0 space-y-4 border-b border-slate-200 bg-white py-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-900">Qualitative</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Upload transcripts and session notes, search across material, and generate thematic summaries for reporting.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </header>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[240px] flex-1 text-sm text-slate-700">
            <span className="mb-1 flex items-center gap-1.5 font-medium">
              <Mic size={14} className="text-[var(--et-teal)]" />
              Study / project
            </span>
            <select
              value={selectedSurveyId ?? ''}
              onChange={(e) => selectStudy(Number(e.target.value))}
              className="et-select w-full"
            >
              {studyOptions.length === 0 && <option value="">No studies available</option>}
              {studyOptions.map((o) => (
                <option key={o.surveyId} value={o.surveyId}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {selectedSurveyId != null && (
            <Link
              to={`/projects/${selectedSurveyId}?mode=qual`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileText size={14} />
              Open in survey workspace
            </Link>
          )}
          {selectedOption?.projectId && (
            <Link
              to={`/operations?tab=pipeline&project=${selectedOption.projectId}`}
              className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
            >
              View PM project
            </Link>
          )}
        </div>

        {pmEnabled && studyOptions.length === 0 && (
          <p className="text-xs text-amber-800">
            Link qual or mixed PM projects to surveys in{' '}
            <Link to="/operations" className="font-medium underline">
              Operations
            </Link>{' '}
            to prioritise them here, or pick any LimeSurvey study from the list once loaded.
          </p>
        )}
      </div>

      {selectedSurveyId == null ? (
        <div className="et-page et-page-wide flex flex-1 items-center justify-center py-16">
          <EmptyState
            title="Select a study"
            description="Choose a study above to upload transcripts and run qual reporting."
          />
        </div>
      ) : (
        <QualPanel surveyId={selectedSurveyId} />
      )}
    </div>
  )
}
