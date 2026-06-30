import { lazy, Suspense } from 'react'
import { Loader2, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import type { SurveyVariable } from '../../api/client'
import { FieldManagementPanel } from './FieldManagementPanel'
import { FieldingMonitorPanel } from './FieldingMonitorPanel'
import { FieldTeamPanel } from './FieldTeamPanel'

const ResponseQCPanel = lazy(() =>
  import('./ResponseQCPanel').then((m) => ({ default: m.ResponseQCPanel })),
)

export type FieldView = 'fielding' | 'team'

interface Props {
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  view: FieldView
  onViewChange: (view: FieldView) => void
  qcApprovedCount?: number | null
  onUseQcApproved?: () => void
  onReviewChanged?: () => void
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
  team: 'Interviewer performance and response-level QC review',
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
            Team & quality
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
          <div className="mx-auto max-w-5xl space-y-10 p-4 sm:p-6 pb-10">
            <section>
              <header className="mb-4 flex items-start gap-2">
                <Users size={20} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Interviewers</h2>
                  <p className="text-xs text-slate-500">
                    Throughput, completion rates, and rejection rates by interviewer.
                  </p>
                </div>
              </header>
              <FieldTeamPanel surveyId={surveyId} variables={variables} embedded />
            </section>

            <section className="border-t border-slate-200 pt-8">
              <header className="mb-4 flex items-start gap-2">
                <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Response QC</h2>
                  <p className="text-xs text-slate-500">
                    Flagged records, manual review, and QC settings — check alongside interviewer stats.
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
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
