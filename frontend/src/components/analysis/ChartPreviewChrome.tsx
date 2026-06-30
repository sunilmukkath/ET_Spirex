import {
  FileDown,
  ImageDown,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import type { ChartTypeId } from '../../lib/chartTypes'
import { chartShortLabel } from './ChartTypePicker'
import { KindBadge } from './Results'
import type { SurveyVariable } from '../../api/client'
import { ChartTypeIcon } from '../../lib/chartTypeIcons'
import { EmptyState, ErrorState, ChartSkeleton } from '../States'
import type { ReactNode } from 'react'

interface Props {
  valueVar: SurveyVariable | null
  yVar?: SurveyVariable | null
  chartType: ChartTypeId
  chartTitle?: string
  baseN?: number | null
  categoryCount?: number
  loading: boolean
  error: string | null
  hasData: boolean
  slotsReady: boolean
  schemaLoading: boolean
  filtersStale: boolean
  valueModeSupported: boolean
  valueMode: 'count' | 'percent'
  onValueModeChange: (mode: 'count' | 'percent') => void
  showDataLabels: boolean
  onShowDataLabelsChange: (show: boolean) => void
  onRefresh: () => void
  onExportCsv: () => void
  onExportPng: () => void
  exportingCsv: boolean
  exportingPng: boolean
  children: ReactNode
}

export function ChartPreviewChrome({
  valueVar,
  yVar,
  chartType,
  chartTitle,
  baseN,
  categoryCount,
  loading,
  error,
  hasData,
  slotsReady,
  schemaLoading,
  filtersStale,
  valueModeSupported,
  valueMode,
  onValueModeChange,
  showDataLabels,
  onShowDataLabelsChange,
  onRefresh,
  onExportCsv,
  onExportPng,
  exportingCsv,
  exportingPng,
  children,
}: Props) {
  const displayTitle = chartTitle || valueVar?.text

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 bg-white px-5 py-4">
        <div className="min-w-0 flex-1">
          {valueVar ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <KindBadge kind={valueVar.kind} label={valueVar.type_label} />
                <span className="text-xs font-medium text-slate-500">{valueVar.code}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  <ChartTypeIcon typeId={chartType} size={12} />
                  {chartShortLabel(chartType)}
                </span>
              </div>
              <h3 className="mt-2 font-display text-lg font-semibold leading-snug text-slate-900">
                {displayTitle}
              </h3>
              {yVar && (
                <p className="mt-1 text-xs text-slate-500">
                  Secondary: <span className="font-medium text-slate-700">{yVar.text}</span>
                </p>
              )}
            </>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Preview</p>
              <h3 className="mt-1 font-display text-lg font-semibold text-slate-800">Chart canvas</h3>
              <p className="mt-0.5 text-sm text-slate-500">Select a question to begin</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {baseN != null && (
            <span className="rounded-lg bg-[var(--et-teal-light)]/50 px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--et-teal-dark)]">
              n={baseN.toLocaleString()}
            </span>
          )}
          {categoryCount != null && categoryCount > 0 && (
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-600">
              {categoryCount} categories
            </span>
          )}
          {hasData && !loading && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
              <Sparkles size={11} />
              Live
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        {hasData && valueModeSupported && (
          <div className="et-segment">
            <button
              type="button"
              onClick={() => onValueModeChange('count')}
              className={`et-segment-btn text-xs ${valueMode === 'count' ? 'et-segment-btn-active' : 'et-segment-btn-inactive'}`}
            >
              Counts
            </button>
            <button
              type="button"
              onClick={() => onValueModeChange('percent')}
              className={`et-segment-btn text-xs ${valueMode === 'percent' ? 'et-segment-btn-active' : 'et-segment-btn-inactive'}`}
            >
              %
            </button>
          </div>
        )}

        {hasData && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showDataLabels}
              onChange={(e) => onShowDataLabelsChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--et-teal)]"
            />
            Labels
          </label>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            disabled={!slotsReady || loading}
            title={filtersStale ? 'Filters changed — refresh chart' : 'Refresh chart'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
              filtersStale
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            {filtersStale ? 'Apply filters' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={!hasData || loading || exportingCsv}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {exportingCsv ? <Loader2 className="animate-spin" size={14} /> : <FileDown size={14} />}
            CSV
          </button>
          <button
            type="button"
            onClick={onExportPng}
            disabled={!hasData || loading || exportingPng}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {exportingPng ? <Loader2 className="animate-spin" size={14} /> : <ImageDown size={14} />}
            PNG
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col overflow-auto p-5">
        <div className="chart-canvas relative min-h-[420px] flex-1 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          {schemaLoading && (
            <EmptyState
              title="Loading questions"
              description="Answer options and chart slots will be ready in a moment."
            />
          )}

          {!schemaLoading && !slotsReady && (
            <EmptyState
              title="Configure your chart"
              description="Pick a chart type and map the required questions in the left panel. The preview updates automatically."
            />
          )}

          {!schemaLoading && slotsReady && loading && <ChartSkeleton />}

          {!schemaLoading && slotsReady && error && !loading && (
            <div className="flex min-h-[280px] items-center justify-center p-4">
              <ErrorState message={error} />
            </div>
          )}

          {!schemaLoading && slotsReady && !loading && !error && !hasData && (
            <EmptyState
              title="Building chart…"
              description="If nothing appears, check required variable slots or click Refresh."
            />
          )}

          {!schemaLoading && slotsReady && !loading && !error && hasData && children}
        </div>
      </div>
    </div>
  )
}
