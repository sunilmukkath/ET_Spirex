import { ClipboardList, TrendingUp, Users } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'
import { FieldManagementPanel } from './FieldManagementPanel'
import { FieldingMonitorPanel } from './FieldingMonitorPanel'
import { FieldTeamPanel } from './FieldTeamPanel'

export type FieldView = 'monitor' | 'team' | 'quotas'

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
  monitor: 'Daily completes and interview pace',
  team: 'Interviewer throughput and QC rejections',
  quotas: 'Quota targets, layers, and completion checks',
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
            active={view === 'monitor'}
            onClick={() => onViewChange('monitor')}
            icon={<TrendingUp size={14} />}
          >
            Fielding
          </FieldViewButton>
          <FieldViewButton
            active={view === 'team'}
            onClick={() => onViewChange('team')}
            icon={<Users size={14} />}
          >
            Field team
          </FieldViewButton>
          <FieldViewButton
            active={view === 'quotas'}
            onClick={() => onViewChange('quotas')}
            icon={<ClipboardList size={14} />}
          >
            Quotas
          </FieldViewButton>
        </div>
        <p className="hidden text-xs text-slate-500 sm:block">{VIEW_HINT[view]}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {view === 'monitor' && (
          <FieldingMonitorPanel
            surveyId={surveyId}
            completionStatus={completionStatus}
            embedded
          />
        )}
        {view === 'team' && (
          <FieldTeamPanel surveyId={surveyId} variables={variables} embedded />
        )}
        {view === 'quotas' && (
          <FieldManagementPanel surveyId={surveyId} variables={variables} />
        )}
      </div>
    </div>
  )
}
