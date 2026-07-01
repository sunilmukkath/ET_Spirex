import { Link } from 'react-router-dom'
import { BarChart3, ClipboardList, MessageSquare, ShieldCheck } from 'lucide-react'
import type { PmPipelineProject } from '../../api/client'
import { buildSurveyWorkspaceHref } from '../../lib/workspaceNav'

const LINK_CLASS =
  'inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-[var(--et-teal-dark)] hover:border-[var(--et-teal)]/40 hover:bg-[var(--et-teal-light)]/20'

export function primarySurveyId(
  project: Pick<PmPipelineProject, 'linked_survey_ids' | 'limesurvey_survey_id'>,
): number | null {
  const ids = project.linked_survey_ids ?? []
  if (ids.length > 0) return ids[0]
  return project.limesurvey_survey_id ?? null
}

interface Props {
  project: PmPipelineProject
  /** Compact row in the pipeline table */
  variant?: 'table' | 'inline'
}

export function PmWorkspaceLinks({ project, variant = 'table' }: Props) {
  const sid = primarySurveyId(project)
  if (!sid) {
    return <span className="text-[11px] text-slate-400">Link a survey</span>
  }

  const showQuant = project.project_type !== 'qual'
  const showQual = project.project_type === 'qual' || project.project_type === 'mixed'
  const multi = (project.linked_survey_ids?.length ?? 0) > 1

  const links = (
    <div className={`flex flex-wrap gap-1 ${variant === 'table' ? 'max-w-[11rem]' : ''}`}>
      {showQuant && (
        <>
          <Link to={buildSurveyWorkspaceHref(sid, 'fields', 'fielding')} className={LINK_CLASS} title="Fielding & quotas">
            <ClipboardList size={11} />
            Field
          </Link>
          <Link to={buildSurveyWorkspaceHref(sid, 'fields', 'quality')} className={LINK_CLASS} title="QC review">
            <ShieldCheck size={11} />
            QC
          </Link>
          <Link
            to={buildSurveyWorkspaceHref(sid, 'explore', 'profile')}
            className={LINK_CLASS}
            title="Questions, crosstabs, and charts"
          >
            <BarChart3 size={11} />
            Analysis
          </Link>
        </>
      )}
      {showQual && (
        <Link to={buildSurveyWorkspaceHref(sid, 'qual')} className={LINK_CLASS} title="Qual library">
          <MessageSquare size={11} />
          Qual
        </Link>
      )}
    </div>
  )

  if (variant === 'inline') return links

  return (
    <div className="space-y-1">
      {multi && <p className="text-[10px] text-slate-400">Visit 1 · #{sid}</p>}
      {links}
      {multi &&
        project.linked_survey_ids!.slice(1).map((altSid, idx) => (
          <div key={altSid} className="flex flex-wrap gap-1 border-t border-slate-100 pt-1">
            <span className="w-full text-[10px] text-slate-400">
              Visit {idx + 2} · #{altSid}
            </span>
            {showQuant && (
              <>
                <Link to={buildSurveyWorkspaceHref(altSid, 'fields', 'fielding')} className={LINK_CLASS}>
                  Field
                </Link>
                <Link to={buildSurveyWorkspaceHref(altSid, 'fields', 'quality')} className={LINK_CLASS}>
                  QC
                </Link>
                <Link to={buildSurveyWorkspaceHref(altSid, 'explore', 'profile')} className={LINK_CLASS}>
                  Analysis
                </Link>
              </>
            )}
          </div>
        ))}
    </div>
  )
}
