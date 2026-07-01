import { Link } from 'react-router-dom'
import { Code2, Link2 } from 'lucide-react'
import { api, type PmPipelineOverview, type Project } from '../../api/client'

type OpsTab = 'programming' | 'links'

type Props = {
  tab: OpsTab
  pipeline: PmPipelineOverview | null
  limeSurveys: Project[]
  selectedProjectId: string
  linkSurveyId: string
  onSelectProject: (projectId: string) => void
  onLinkSurveyIdChange: (surveyId: string) => void
  onLinkSurvey: (projectId: string) => void
  onReload: () => void
  onSwitchTab: (tab: OpsTab) => void
}

export function QuantitativeSurveyOps({
  tab,
  pipeline,
  limeSurveys,
  selectedProjectId,
  linkSurveyId,
  onSelectProject,
  onLinkSurveyIdChange,
  onLinkSurvey,
  onReload,
  onSwitchTab,
}: Props) {
  const projects = pipeline?.projects ?? []
  const surveyTitleById = new Map(limeSurveys.map((s) => [s.id, s.title]))

  if (tab === 'programming') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Survey programming uses LimeSurvey as the engine. Link a survey to a PM project in{' '}
          <button
            type="button"
            className="font-medium text-[var(--et-teal-dark)] underline"
            onClick={() => onSwitchTab('links')}
          >
            Survey links
          </button>
          , then open the workspace for question setup, quotas, and spec export.
        </p>
        <ul className="space-y-3">
          {projects.map((p) => (
            <li
              key={p.project_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-slate-900">{p.project_name}</p>
                <p className="text-xs text-slate-500">Stage: {p.stage}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.limesurvey_survey_id ? (
                  <>
                    <Link
                      to={`/projects/${p.limesurvey_survey_id}?mode=variables`}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                    >
                      Data setup
                    </Link>
                    <Link
                      to={`/projects/${p.limesurvey_survey_id}?mode=workflow`}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                    >
                      Workflow
                    </Link>
                    <a
                      href={`/api/projects/${p.limesurvey_survey_id}/questionnaire/export?format=xlsx`}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                    >
                      Export spec
                    </a>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProject(p.project_id)
                      onSwitchTab('links')
                    }}
                    className="text-xs font-medium text-amber-700 underline"
                  >
                    Link survey first
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {projects.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            No PM projects yet — create them in{' '}
            <Link to="/operations" className="text-[var(--et-teal-dark)] hover:underline">
              Operations
            </Link>
            .
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Assign each LimeSurvey study to exactly one PM project. Team members open the linked workspace from{' '}
        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
          <Link2 size={14} />
          LimeSurvey studies
        </span>{' '}
        or the Operations pipeline.
      </p>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">PM project</th>
              <th className="px-4 py-3">LimeSurvey ID</th>
              <th className="px-4 py-3">Assign</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.project_id} className="border-b border-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium">{p.project_name}</p>
                  <p className="text-xs text-slate-500">{p.client_name}</p>
                </td>
                <td className="px-4 py-3">
                  {p.limesurvey_survey_id ? (
                    <Link
                      to={`/projects/${p.limesurvey_survey_id}`}
                      className="font-mono text-[var(--et-teal-dark)] hover:underline"
                    >
                      {p.limesurvey_survey_id}
                      {surveyTitleById.get(p.limesurvey_survey_id)
                        ? ` — ${surveyTitleById.get(p.limesurvey_survey_id)}`
                        : ''}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedProjectId === p.project_id ? linkSurveyId : ''}
                      onFocus={() => onSelectProject(p.project_id)}
                      onChange={(e) => {
                        onSelectProject(p.project_id)
                        onLinkSurveyIdChange(e.target.value)
                      }}
                      className="et-select max-w-[220px] text-xs"
                    >
                      <option value="">Select survey…</option>
                      {limeSurveys.map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.id} — {s.title.slice(0, 40)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onLinkSurvey(p.project_id)}
                      className="rounded-lg bg-[var(--et-teal)] px-3 py-1.5 text-xs text-white"
                    >
                      Save link
                    </button>
                    {p.limesurvey_survey_id && (
                      <button
                        type="button"
                        onClick={() => void api.linkPmSurvey(p.project_id, null).then(() => onReload())}
                        className="text-xs text-slate-500 hover:text-red-600"
                      >
                        Unlink
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {projects.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">No PM projects to link yet.</p>
        )}
      </div>
      {(pipeline?.unlinked_survey_ids.length ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">
            {pipeline!.unlinked_survey_ids.length} LimeSurvey stud
            {pipeline!.unlinked_survey_ids.length === 1 ? 'y' : 'ies'} not assigned to a PM project
          </p>
        </div>
      )}
    </div>
  )
}

export const QUANTITATIVE_OPS_TABS = [
  ['programming', 'Programming', Code2],
  ['links', 'Survey links', Link2],
] as const
