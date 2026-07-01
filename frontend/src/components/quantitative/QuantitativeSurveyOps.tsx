import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Code2, Link2, Loader2 } from 'lucide-react'
import { api, type PmPipelineOverview, type PmSurveyLinkSuggestion, type Project } from '../../api/client'
import { pmWorkflowHref } from '../../lib/pmWorkflowLinks'

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

function confidenceBadge(conf: PmSurveyLinkSuggestion['confidence']) {
  if (conf === 'high') return 'bg-emerald-100 text-emerald-800'
  if (conf === 'medium') return 'bg-amber-100 text-amber-900'
  return 'bg-slate-100 text-slate-600'
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
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [agentSummary, setAgentSummary] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<PmSurveyLinkSuggestion[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)

  async function runLinkAgent(applyHighOnly = false) {
    setAgentLoading(true)
    setAgentError(null)
    try {
      const result = await api.runSurveyLinkAgent({ apply: applyHighOnly })
      setAgentSummary(result.summary)
      setSuggestions(result.suggestions)
      setSelected(
        new Set(
          result.suggestions
            .filter((s) => s.confidence === 'high')
            .map((s) => s.project_id),
        ),
      )
      if (applyHighOnly && result.applied_count > 0) {
        onReload()
      }
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : 'Agent failed')
    } finally {
      setAgentLoading(false)
    }
  }

  async function applySelected() {
    const links = suggestions
      .filter((s) => selected.has(s.project_id))
      .map((s) => ({ project_id: s.project_id, limesurvey_survey_id: s.limesurvey_survey_id }))
    if (links.length === 0) return
    setApplying(true)
    setAgentError(null)
    try {
      const result = await api.applySurveyLinks(links)
      if (result.errors.length) {
        setAgentError(result.errors.join(' · '))
      }
      setAgentSummary(`Applied ${result.applied_count} link(s).`)
      setSuggestions((prev) => prev.filter((s) => !selected.has(s.project_id)))
      setSelected(new Set())
      onReload()
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  function toggleSuggestion(projectId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

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
                      to={pmWorkflowHref(p.project_id)}
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

      <div className="rounded-xl border border-[var(--et-teal)]/25 bg-[var(--et-teal-light)]/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--et-navy)]">
              <Bot size={16} />
              Survey link agent
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Matches unlinked PM projects to LimeSurvey / Survey Studio studies by name and client — review before
              applying.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runLinkAgent(false)}
              disabled={agentLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--et-teal)]/40 bg-white px-3 py-1.5 text-xs font-medium text-[var(--et-teal-dark)] disabled:opacity-50"
            >
              {agentLoading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
              Suggest links
            </button>
            <button
              type="button"
              onClick={() => void runLinkAgent(true)}
              disabled={agentLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Apply high-confidence
            </button>
          </div>
        </div>

        {agentSummary && <p className="mt-3 text-xs text-slate-700">{agentSummary}</p>}
        {agentError && <p className="mt-2 text-xs text-rose-700">{agentError}</p>}

        {suggestions.length > 0 && (
          <div className="mt-4 space-y-2">
            <ul className="max-h-64 space-y-2 overflow-y-auto et-scroll">
              {suggestions.map((s) => (
                <li
                  key={s.project_id}
                  className="flex flex-wrap items-start gap-3 rounded-lg border border-white/80 bg-white/90 px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.project_id)}
                    onChange={() => toggleSuggestion(s.project_id)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{s.project_name}</p>
                    <p className="text-slate-600">
                      → #{s.limesurvey_survey_id} {s.survey_title}
                    </p>
                    <p className="text-slate-500">{s.reason}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${confidenceBadge(s.confidence)}`}>
                    {s.confidence}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void applySelected()}
              disabled={applying || selected.size === 0}
              className="rounded-lg bg-[var(--et-navy)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {applying ? <Loader2 size={14} className="animate-spin inline" /> : null}
              Apply {selected.size} selected
            </button>
          </div>
        )}
      </div>

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
