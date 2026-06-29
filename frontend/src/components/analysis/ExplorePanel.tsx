import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Info, Loader2, Maximize2, Minimize2 } from 'lucide-react'
import type {
  FilterGroup,
  FilterPreset,
  FilterSpec,
  ProfileResult,
  SurveyVariable,
} from '../../api/client'
import { CollapsibleSection } from '../CollapsibleSection'
import { TableSkeleton } from '../States'
import { FilterEditor } from './FilterEditor'
import { ProfileResults } from './Results'
import { SuggestedCharts } from './SuggestedCharts'
import { SurveyOverviewBar } from './SurveyOverviewBar'
import type { ChartTypeId } from '../../lib/chartTypes'

function EmptyCanvas({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center sm:py-20">
      <div className="et-empty-icon">{icon}</div>
      <h3 className="mt-5 font-display text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>
    </div>
  )
}

export interface ExplorePanelProps {
  surveyId: number
  completionStatus: string
  selectedVar: SurveyVariable | null
  selectedId: string | null
  variables: SurveyVariable[]
  groups: { id: number; title: string; order: number; variable_ids: string[] }[]
  responseCount: number
  questionCount: number
  customVarCount: number
  filters: FilterSpec[]
  filterTree: FilterGroup | null
  onFiltersChange: (filters: FilterSpec[]) => void
  onFilterTreeChange: (tree: FilterGroup | null) => void
  onPresetApply: (preset: FilterPreset) => void
  analyzing: boolean
  profileResult: ProfileResult | null
  schemaLoading: boolean
  enriching: boolean
  onCompareQuestion: () => void
  onConfigureQuestion: () => void
  onOpenChart: (chartType: ChartTypeId) => void
  onExportReport: (format: 'pdf' | 'pptx') => void
  exportingReport: boolean
}

export function ExplorePanel({
  surveyId,
  completionStatus,
  selectedVar,
  selectedId,
  variables,
  groups,
  responseCount,
  questionCount,
  customVarCount,
  filters,
  filterTree,
  onFiltersChange,
  onFilterTreeChange,
  onPresetApply,
  analyzing,
  profileResult,
  schemaLoading,
  enriching,
  onCompareQuestion,
  onConfigureQuestion,
  onOpenChart,
  onExportReport,
  exportingReport,
}: ExplorePanelProps) {
  const [overviewOpen, setOverviewOpen] = useState(!selectedVar)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [chartsOpen, setChartsOpen] = useState(false)

  useEffect(() => {
    if (selectedVar) {
      setOverviewOpen(false)
      setFiltersOpen(true)
      setChartsOpen(false)
    } else {
      setOverviewOpen(true)
    }
  }, [selectedVar?.id])

  const overviewSummary = `${responseCount.toLocaleString()} responses · ${questionCount} questions`
  const filtersSummary = useMemo(() => {
    const count = filterTree?.children?.length ?? filters.length
    return count ? `${count} filter${count === 1 ? '' : 's'} active` : 'No filters applied'
  }, [filterTree, filters.length])
  const chartsSummary = selectedVar
    ? `${selectedVar.code} — quick chart shortcuts`
    : 'Select a question first'

  const anySectionOpen = overviewOpen || filtersOpen || chartsOpen

  function collapseAll() {
    setOverviewOpen(false)
    setFiltersOpen(false)
    setChartsOpen(false)
  }

  function expandAll() {
    setOverviewOpen(true)
    setFiltersOpen(true)
    setChartsOpen(true)
  }

  const overview = (
    <SurveyOverviewBar
      responseCount={responseCount}
      questionCount={questionCount}
      groupCount={groups.length}
      variables={variables}
      completionStatus={completionStatus}
      customVarCount={customVarCount}
      compact
    />
  )

  if (schemaLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto et-scroll overscroll-y-contain">
          <CollapsibleSection title="Survey overview" summary={overviewSummary} defaultOpen>
            {overview}
          </CollapsibleSection>
          <div className="space-y-4 p-6">
            <TableSkeleton rows={4} />
            <TableSkeleton rows={8} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto et-scroll overscroll-y-contain">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-sm sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {selectedVar && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {selectedVar.text || selectedVar.code}
                </p>
                <p className="truncate text-xs text-slate-500">{selectedVar.code}</p>
              </div>
            )}
            <button
              type="button"
              onClick={anySectionOpen ? collapseAll : expandAll}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {anySectionOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span className="hidden sm:inline">{anySectionOpen ? 'Minimize sections' : 'Expand sections'}</span>
            </button>
          </div>
        </div>

        <CollapsibleSection
          title="Survey overview"
          summary={overviewSummary}
          open={overviewOpen}
          onOpenChange={setOverviewOpen}
        >
          {overview}
        </CollapsibleSection>

        {selectedVar && (
          <>
            <CollapsibleSection
              title="Filters"
              summary={filtersSummary}
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
            >
              <FilterEditor
                surveyId={surveyId}
                completionStatus={completionStatus}
                variables={variables}
                filters={filters}
                filterTree={filterTree}
                onChange={onFiltersChange}
                onFilterTreeChange={onFilterTreeChange}
                showPresets
                onPresetApply={onPresetApply}
                compact
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Quick charts"
              summary={chartsSummary}
              open={chartsOpen}
              onOpenChange={setChartsOpen}
            >
              <SuggestedCharts variable={selectedVar} onSelectChart={onOpenChart} />
            </CollapsibleSection>
          </>
        )}

        <div className="p-4 pb-16 sm:p-6 sm:pb-20">
          {!selectedVar && (
            <EmptyCanvas
              icon={<BarChart3 size={40} />}
              title="Select a question"
              description="Choose any question from the sidebar to see its distribution, chart, and summary stats."
            />
          )}

          {selectedVar && enriching && !profileResult && !analyzing && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Loader2 className="animate-spin text-[var(--et-teal)]" size={28} />
              <p className="text-sm font-medium text-slate-700">Preparing analysis…</p>
              <p className="max-w-sm text-xs text-slate-500">Loading answer options for this question.</p>
            </div>
          )}

          {selectedVar && analyzing && (
            <div className="mb-4 flex items-center gap-2 text-sm text-[var(--et-teal-dark)]">
              <Loader2 className="animate-spin" size={16} />
              Analyzing…
            </div>
          )}

          {profileResult ? (
            <div className="animate-fade-in et-panel p-4 shadow-sm sm:p-6">
              <ProfileResults
                result={profileResult}
                onCompareQuestion={selectedId ? onCompareQuestion : undefined}
                onConfigureQuestion={selectedId ? onConfigureQuestion : undefined}
                onExportReport={selectedId ? onExportReport : undefined}
                exportingReport={exportingReport}
              />
            </div>
          ) : selectedVar && !analyzing && !enriching ? (
            <EmptyCanvas
              icon={<Info size={32} />}
              title="No data"
              description="This question has no response data yet, or the survey table is empty."
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
