import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Briefcase, FileText, RefreshCw } from 'lucide-react'
import { api, type PmPipelineOverview } from '../api/client'
import { QualPanel } from '../components/analysis/QualPanel'
import { EmptyState, LoadingState } from '../components/States'
import { ModuleQuickNav } from '../components/ModuleQuickNav'
import type { QualWorkspaceScope } from '../lib/qualScope'

type ProjectOption = {
  projectId: string
  label: string
  clientName: string | null
  surveyIds: number[]
}

export function QualitativePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pipeline, setPipeline] = useState<PmPipelineOverview | null>(null)
  const [pmEnabled, setPmEnabled] = useState(false)

  const projectParam = searchParams.get('project')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectParam)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const pmStatus = await api.getPmStatus().catch(() => ({ enabled: false, ready: false }))
      setPmEnabled(Boolean(pmStatus.enabled && pmStatus.ready))
      if (pmStatus.enabled && pmStatus.ready) {
        setPipeline(await api.getPmPipeline())
      } else {
        setPipeline(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const projectOptions = useMemo(() => {
    const out: ProjectOption[] = []
    for (const p of pipeline?.projects ?? []) {
      if (p.project_type === 'quant') continue
      const surveyIds = [
        ...(p.linked_survey_ids ?? []),
        ...(p.limesurvey_survey_id ? [p.limesurvey_survey_id] : []),
      ].filter((id, idx, arr) => arr.indexOf(id) === idx)
      out.push({
        projectId: p.project_id,
        label: p.project_name,
        clientName: p.client_name ?? null,
        surveyIds,
      })
    }
    out.sort((a, b) => a.label.localeCompare(b.label))
    return out
  }, [pipeline])

  useEffect(() => {
    if (selectedProjectId) return
    const first = projectOptions[0]?.projectId
    if (first) setSelectedProjectId(first)
  }, [projectOptions, selectedProjectId])

  useEffect(() => {
    if (projectParam) setSelectedProjectId(projectParam)
  }, [projectParam])

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId)
    setSearchParams(
      (prev) => {
        prev.set('project', projectId)
        prev.delete('survey')
        return prev
      },
      { replace: true },
    )
  }

  const selectedOption = projectOptions.find((o) => o.projectId === selectedProjectId) ?? null

  const scope: QualWorkspaceScope | null = selectedProjectId
    ? { type: 'pm', projectId: selectedProjectId }
    : null

  if (loading) return <LoadingState message="Loading qualitative workspace…" />

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col">
      <div className="et-page et-page-wide shrink-0 space-y-4 border-b border-slate-200 bg-white py-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-900">Qualitative</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Upload project-wise transcripts and session notes, interact with your qual data, run thematic analysis, build compare tables, and structure client reports.
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

        <ModuleQuickNav current="qualitative" />

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        )}

        {!pmEnabled && (
          <p className="text-sm text-amber-800">
            Operations PM is not available — enable the project database to use project-wise qual libraries.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[280px] flex-1 text-sm text-slate-700">
            <span className="mb-1 flex items-center gap-1.5 font-medium">
              <Briefcase size={14} className="text-[var(--et-teal)]" />
              PM project
            </span>
            <select
              value={selectedProjectId ?? ''}
              onChange={(e) => selectProject(e.target.value)}
              className="et-select w-full"
              disabled={!pmEnabled}
            >
              {projectOptions.length === 0 && <option value="">No qual / mixed projects</option>}
              {projectOptions.map((o) => (
                <option key={o.projectId} value={o.projectId}>
                  {o.label}
                  {o.clientName ? ` · ${o.clientName}` : ''}
                </option>
              ))}
            </select>
          </label>
          {selectedOption && selectedOption.surveyIds[0] != null && (
            <Link
              to={`/projects/${selectedOption.surveyIds[0]}?mode=qual`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileText size={14} />
              Open linked survey workspace
            </Link>
          )}
          {selectedProjectId && (
            <Link
              to={`/operations?tab=pipeline&project=${selectedProjectId}`}
              className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
            >
              View in Operations
            </Link>
          )}
        </div>

        {pmEnabled && projectOptions.length === 0 && (
          <p className="text-xs text-amber-800">
            Create a qual or mixed project in{' '}
            <Link to="/operations" className="font-medium underline">
              Operations
            </Link>{' '}
            to start uploading transcripts.
          </p>
        )}
      </div>

      {!scope ? (
        <div className="et-page et-page-wide flex flex-1 items-center justify-center py-16">
          <EmptyState
            title="Select a project"
            description="Choose a qual or mixed PM project above to upload transcripts, run analysis, and build reports."
          />
        </div>
      ) : (
        <QualPanel scope={scope} />
      )}
    </div>
  )
}
