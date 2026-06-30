import { TrendingUp, Users } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'
import { FieldManagementPanel } from './FieldManagementPanel'
import { FieldingMonitorPanel } from './FieldingMonitorPanel'
import { FieldTeamPanel } from './FieldTeamPanel'

export type FieldView = 'fielding' | 'team'

interface Props {
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  view: FieldView
  onViewChange: (view: FieldView) => void
}

function FieldViewButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition ${
        active ? 'et-segment-btn-active' : 'et-segment-btn-inactive'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

const VIEW_HINT: Record<FieldView, string> = {
  fielding: 'Fielding pace, daily completes, and quota targets',
  team: 'Interviewer throughput and QC rejections',
}

export function FieldOperationsPanel({
  surveyId,
  completionStatus,
  variables,
  view,
  onViewChange,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
        <div className="et-segment">
          <FieldViewButton
            active={view === 'fielding'}
            onClick={() => onViewChange('fielding')}
            icon={<TrendingUp size={14} />}
          >
            Fielding & quotas
          </FieldViewButton>
          <FieldViewButton
            active={view === 'team'}
            onClick={() => onViewChange('team')}
            icon={<Users size={14} />}
          >
            Interviewers
          </FieldViewButton>
        </div>
        <p className="hidden text-xs text-slate-500 sm:block">{VIEW_HINT[view]}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--canvas-subtle)] et-scroll">
        {view === 'fielding' && (
          <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 pb-10">
            <FieldingMonitorPanel
              surveyId={surveyId}
              completionStatus={completionStatus}
              embedded
              nested
            />
            <FieldManagementPanel surveyId={surveyId} variables={variables} embedded nested />
          </div>
        )}
        {view === 'team' && (
          <FieldTeamPanel surveyId={surveyId} variables={variables} embedded />
        )}
      </div>
    </div>
  )
}
