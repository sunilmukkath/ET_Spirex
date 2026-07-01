import { lazy, Suspense } from 'react'
import { ClipboardList, Loader2, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'
import { FieldManagementPanel } from './FieldManagementPanel'
import { FieldingMonitorPanel } from './FieldingMonitorPanel'
import { FieldTeamPanel } from './FieldTeamPanel'

const ResponseQCPanel = lazy(() =>
  import('./ResponseQCPanel').then((m) => ({ default: m.ResponseQCPanel })),
)

export type FieldView = 'fielding' | 'quality' | 'team'

interface Props {
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  view: FieldView
  onViewChange: (view: FieldView) => void
  qcApprovedCount?: number | null
  onUseQcApproved?: () => void
  onReviewChanged?: () => void
  hideSubNav?: boolean
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

function PanelLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="animate-spin text-[var(--et-teal)]" size={28} />
    </div>
  )
}

const VIEW_HINT: Record<FieldView, string> = {
  fielding: 'Fielding pace, daily completes, and quota targets',
  quality: 'QC review — flagged responses, thresholds, and GPS proximity checks',
  team: 'Field team throughput, completion rates, and rejection stats',
}

export function FieldOperationsPanel({
  surveyId,
  completionStatus,
  variables,
  view,
  onViewChange,
  qcApprovedCount,
  onUseQcApproved,
  onReviewChanged,
  hideSubNav = false,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!hideSubNav && (
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
        <div className="et-segment">
          <FieldViewButton
            active={view === 'fielding'}
            onClick={() => onViewChange('fielding')}
            icon={<TrendingUp size={14} />}
          >
            Fielding
          </FieldViewButton>
          <FieldViewButton
            active={view === 'quality'}
            onClick={() => onViewChange('quality')}
            icon={<ShieldCheck size={14} />}
          >
            Quality
          </FieldViewButton>
          <FieldViewButton
            active={view === 'team'}
            onClick={() => onViewChange('team')}
            icon={<Users size={14} />}
          >
            Field team
          </FieldViewButton>
        </div>
        <p className="hidden text-xs text-slate-500 sm:block">{VIEW_HINT[view]}</p>
      </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--canvas-subtle)] et-scroll">
        {view === 'fielding' && (
          <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 pb-10">
            <header className="flex items-start gap-2">
              <ClipboardList size={20} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Fielding & quotas</h2>
                <p className="text-xs text-slate-500">
                  Monitor completion pace and configure quota fields for field teams.
                </p>
              </div>
            </header>
            <FieldingMonitorPanel
              surveyId={surveyId}
              completionStatus={completionStatus}
              embedded
              nested
            />
            <FieldManagementPanel surveyId={surveyId} variables={variables} embedded nested />
          </div>
        )}

        {view === 'quality' && (
          <div className="mx-auto max-w-5xl p-4 sm:p-6 pb-10">
            <header className="mb-4 flex items-start gap-2">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">QC review</h2>
                <p className="text-xs text-slate-500">
                  Run QC scans, review flagged records, and configure checks including GPS proximity.
                </p>
              </div>
            </header>
            <Suspense fallback={<PanelLoader />}>
              <ResponseQCPanel
                surveyId={surveyId}
                variables={variables}
                embedded
                qcApprovedCount={qcApprovedCount}
                onUseQcApproved={onUseQcApproved}
                onReviewChanged={onReviewChanged}
              />
            </Suspense>
          </div>
        )}

        {view === 'team' && (
          <div className="mx-auto max-w-5xl p-4 sm:p-6 pb-10">
            <header className="mb-4 flex items-start gap-2">
              <Users size={20} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Field team</h2>
                <p className="text-xs text-slate-500">
                  Interviewer throughput, completion rates, and rejection rates.
                </p>
              </div>
            </header>
            <FieldTeamPanel surveyId={surveyId} variables={variables} embedded />
          </div>
        )}
      </div>
    </div>
  )
}
