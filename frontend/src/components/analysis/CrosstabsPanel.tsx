import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Maximize2, Minimize2, Table2 } from 'lucide-react'
import type {
  AnalysisBookmark,
  BannerResult,
  FilterGroup,
  FilterPreset,
  FilterSpec,
  SurveyVariable,
} from '../../api/client'
import { CollapsibleSection } from '../CollapsibleSection'
import { AnalysisBookmarkMenu } from './AnalysisBookmarkMenu'
import { TeamPresetsMenu } from './TeamPresetsMenu'
import { BannerLayerEditor } from './BannerLayerEditor'
import { BannerPicker } from './BannerPicker'
import { FilterEditor } from './FilterEditor'
import { CrosstabsResults } from './Results'

function metricLabel(metric: string): string {
  const labels: Record<string, string> = {
    auto: 'Auto',
    distribution: 'Distribution %',
    checkbox_rate: '% Selected',
    count: 'Count',
    pct: 'Column %',
    mean: 'Mean',
    top2box: 'Top 2 box %',
    bottom2box: 'Bottom 2 box %',
    net_score: 'Net score',
    rank_avg: 'Rank average',
  }
  return labels[metric] || metric
}

function SelectionChips({
  vars,
  onRemove,
  onClearAll,
  chipClassName,
  maxVisible = 3,
}: {
  vars: SurveyVariable[]
  onRemove: (id: string) => void
  onClearAll: () => void
  chipClassName: string
  maxVisible?: number
}) {
  if (vars.length === 0) return null

  const visible = vars.slice(0, maxVisible)
  const hiddenCount = vars.length - visible.length

  return (
    <>
      {vars.length > maxVisible && (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
          {vars.length} selected
        </span>
      )}
      {visible.map((v) => (
        <span key={v.id} className={chipClassName}>
          <span className="truncate">{v.text || v.code}</span>
          <button type="button" onClick={() => onRemove(v.id)} className="ml-0.5 rounded-full hover:opacity-70">
            ×
          </button>
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
          +{hiddenCount} more
        </span>
      )}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-medium text-slate-400 hover:text-red-600"
      >
        Clear all
      </button>
    </>
  )
}

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

export interface CrosstabsPanelProps {
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  sideRowVars: SurveyVariable[]
  sideRowIds: string[]
  bannerVars: SurveyVariable[]
  bannerLayers: string[][]
  onBannerLayersChange: (layers: string[][]) => void
  onAddSideRow: (id: string) => void
  onAddAllSideRows: () => void
  onAddAllBanners: () => void
  onCopySideRowsToBannerLayer: (layerIndex: number) => void
  onClearSideRows: () => void
  onClearBanners: () => void
  onRemoveSideRow: (id: string) => void
  filters: FilterSpec[]
  filterTree: FilterGroup | null
  onFiltersChange: (filters: FilterSpec[]) => void
  onFilterTreeChange: (tree: FilterGroup | null) => void
  metric: string
  onMetricChange: (m: string) => void
  availableMetrics: string[]
  showCounts: boolean
  onShowCountsChange: (v: boolean) => void
  showColPct: boolean
  onShowColPctChange: (v: boolean) => void
  showRowPct: boolean
  onShowRowPctChange: (v: boolean) => void
  sigEnabled: boolean
  onSigEnabledChange: (v: boolean) => void
  confidenceLevel: number
  onConfidenceLevelChange: (v: number) => void
  analyzing: boolean
  bannerProgress?: { done: number; total: number } | null
  exporting: boolean
  onRun: () => void
  onRunAllOnTotal: () => void
  onExport: () => void
  bannerResult: BannerResult | null
  schemaLoading: boolean
  tableFilters: Record<string, FilterSpec[]>
  onTableFiltersChange: (rowId: string, filters: FilterSpec[]) => void
  onRefreshTable: (rowId: string, tableIndex: number) => void
  refreshingTableId: string | null
  onPresetApply: (preset: FilterPreset) => void
  onTablePresetApply: (rowId: string, preset: FilterPreset) => void
  onLoadBookmark: (bm: AnalysisBookmark) => void
  buildBookmarkConfig: () => { name: string; config: Record<string, unknown> }
  onExportReport: (format: 'pdf' | 'pptx') => void
  exportingReport: boolean
}

export function CrosstabsPanel(props: CrosstabsPanelProps) {
  const {
    surveyId,
    completionStatus,
    variables,
    sideRowVars,
    sideRowIds,
    bannerVars,
    bannerLayers,
    onBannerLayersChange,
    onAddSideRow,
    onAddAllSideRows,
    onAddAllBanners,
    onCopySideRowsToBannerLayer,
    onClearSideRows,
    onClearBanners,
    onRemoveSideRow,
    filters,
    filterTree,
    onFiltersChange,
    onFilterTreeChange,
    metric,
    onMetricChange,
    availableMetrics,
    showCounts,
    onShowCountsChange,
    showColPct,
    onShowColPctChange,
    showRowPct,
    onShowRowPctChange,
    sigEnabled,
    onSigEnabledChange,
    confidenceLevel,
    onConfidenceLevelChange,
    analyzing,
    bannerProgress,
    exporting,
    onRun,
    onRunAllOnTotal,
    onExport,
    bannerResult,
    schemaLoading,
    tableFilters,
    onTableFiltersChange,
    onRefreshTable,
    refreshingTableId,
    onPresetApply,
    onTablePresetApply,
    onLoadBookmark,
    buildBookmarkConfig,
    onExportReport,
    exportingReport,
  } = props

  const canRun = sideRowVars.length > 0 && !schemaLoading
  const canRunAllOnTotal = (variables.filter((v) => v.can_banner).length > 0) && !schemaLoading
  const hasResults = Boolean(bannerResult && !bannerResult.error)

  const [setupOpen, setSetupOpen] = useState(true)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    if (hasResults) {
      setSetupOpen(false)
      setOptionsOpen(false)
      setFiltersOpen(false)
    }
  }, [hasResults])

  const setupSummary = useMemo(() => {
    const bannerCount = bannerLayers.reduce((n, layer) => n + layer.length, 0)
    const sideLabel =
      sideRowVars.length === 0
        ? 'No side rows'
        : `${sideRowVars.length} side row${sideRowVars.length === 1 ? '' : 's'}`
    const bannerLabel =
      bannerCount === 0
        ? 'no banners'
        : `${bannerCount} banner${bannerCount === 1 ? '' : 's'}`
    return `${sideLabel} · ${bannerLabel}`
  }, [sideRowVars.length, bannerLayers])

  const optionsSummary = useMemo(() => {
    const showParts = [
      showCounts ? 'Counts' : null,
      showColPct ? 'Col %' : null,
      showRowPct ? 'Row %' : null,
    ].filter(Boolean)
    const sig = sigEnabled ? `${Math.round(confidenceLevel * 100)}% sig` : 'Sig off'
    return `${metricLabel(metric)} · ${sig}${showParts.length ? ` · ${showParts.join(', ')}` : ''}`
  }, [metric, sigEnabled, confidenceLevel, showCounts, showColPct, showRowPct])

  const filtersSummary = useMemo(() => {
    const count = filters.length
    return count === 0 ? 'No default filters' : `${count} default filter${count === 1 ? '' : 's'}`
  }, [filters.length])

  const anySectionOpen = setupOpen || optionsOpen || filtersOpen

  function collapseAllSections() {
    setSetupOpen(false)
    setOptionsOpen(false)
    setFiltersOpen(false)
  }

  function expandAllSections() {
    setSetupOpen(true)
    setOptionsOpen(true)
    setFiltersOpen(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto et-scroll overscroll-y-contain">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRunAllOnTotal}
            disabled={!canRunAllOnTotal || analyzing}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--et-teal)]/40 bg-[var(--et-teal-light)]/50 px-3 py-2 text-sm font-medium text-[var(--et-teal-dark)] hover:bg-[var(--et-teal-light)] disabled:opacity-40 sm:px-4"
            title="Add every banner-ready question as a side row and build tables with Total column only"
          >
            {analyzing ? <Loader2 className="animate-spin" size={16} /> : <Table2 size={16} />}
            Run all on Total
          </button>

          <button
            type="button"
            onClick={onRun}
            disabled={!canRun || analyzing || bannerVars.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 sm:px-4"
            title={bannerVars.length === 0 ? 'Add at least one banner column, or use Run all on Total' : undefined}
          >
            {analyzing ? <Loader2 className="animate-spin" size={16} /> : <Table2 size={16} />}
            Build crosstab
          </button>

          {hasResults && (
            <>
              <button
                type="button"
                onClick={onExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                type="button"
                onClick={() => onExportReport('pdf')}
                disabled={exportingReport}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                PDF
              </button>
              <button
                type="button"
                onClick={() => onExportReport('pptx')}
                disabled={exportingReport}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                PPT
              </button>
            </>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={anySectionOpen ? collapseAllSections : expandAllSections}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title={anySectionOpen ? 'Collapse setup sections' : 'Expand setup sections'}
            >
              {anySectionOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span className="hidden sm:inline">{anySectionOpen ? 'Minimize setup' : 'Expand setup'}</span>
            </button>
          </div>
        </div>
        </div>

        <CollapsibleSection
          title="Row & banner setup"
          summary={setupSummary}
          open={setupOpen}
          onOpenChange={setSetupOpen}
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Side (rows)</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <SelectionChips
                  vars={sideRowVars}
                  onRemove={onRemoveSideRow}
                  onClearAll={onClearSideRows}
                  chipClassName="inline-flex max-w-full items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800 ring-1 ring-indigo-200 sm:max-w-[220px]"
                />
                <BannerPicker
                  variables={variables}
                  selectedIds={sideRowIds}
                  onAdd={onAddSideRow}
                  onRemove={onRemoveSideRow}
                  onAddAll={onAddAllSideRows}
                  label="Add side row"
                  pickerTitle="Side rows"
                  emptyMessage="No side row questions available"
                  variant="side"
                  showAddAll
                />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Banners (columns)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onAddAllBanners}
                    className="text-[10px] font-medium text-[var(--et-teal-dark)] hover:underline"
                  >
                    Add all
                  </button>
                  {sideRowIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onCopySideRowsToBannerLayer(0)}
                      className="text-[10px] font-medium text-[var(--et-teal-dark)] hover:underline"
                    >
                      Copy side rows
                    </button>
                  )}
                  {bannerLayers.some((layer) => layer.length > 0) && (
                    <button
                      type="button"
                      onClick={onClearBanners}
                      className="text-[10px] font-medium text-slate-500 hover:text-red-600"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <BannerLayerEditor
                  variables={variables.filter((v) => v.can_banner)}
                  layers={bannerLayers}
                  onChange={onBannerLayersChange}
                  sideRowIds={sideRowIds}
                  onCopySideRowsToLayer={onCopySideRowsToBannerLayer}
                />
              </div>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-400">
            Use the question panel on the left, or the pickers above. <strong>+</strong> adds a banner column ·{' '}
            <strong>S</strong> adds a side row · a question can be both.
          </p>
        </CollapsibleSection>

        <CollapsibleSection
          title="Table options"
          summary={optionsSummary}
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
        >
          <div className="flex flex-wrap items-end gap-3 sm:gap-4">
            <label className="min-w-[8rem] flex-1 text-xs sm:flex-none">
              <span className="font-medium text-slate-500">Metric</span>
              <select
                value={metric}
                onChange={(e) => onMetricChange(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              >
                {availableMetrics.map((m) => (
                  <option key={m} value={m}>
                    {metricLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[8rem] flex-1 text-xs sm:flex-none">
              <span className="font-medium text-slate-500">Sig. level</span>
              <select
                value={sigEnabled ? String(confidenceLevel) : 'off'}
                onChange={(e) => {
                  if (e.target.value === 'off') {
                    onSigEnabledChange(false)
                  } else {
                    onSigEnabledChange(true)
                    onConfidenceLevelChange(Number(e.target.value))
                  }
                }}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              >
                <option value="off">Off</option>
                <option value="0.9">90%</option>
                <option value="0.95">95%</option>
                <option value="0.99">99%</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
            <span className="font-medium text-slate-500">Show:</span>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showCounts} onChange={(e) => onShowCountsChange(e.target.checked)} />
              Counts
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showColPct} onChange={(e) => onShowColPctChange(e.target.checked)} />
              Column %
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showRowPct} onChange={(e) => onShowRowPctChange(e.target.checked)} />
              Row %
            </label>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Filters & bookmarks"
          summary={filtersSummary}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
        >
          <AnalysisBookmarkMenu
            surveyId={surveyId}
            kind="crosstab"
            onSave={buildBookmarkConfig}
            onLoad={onLoadBookmark}
          />
          <TeamPresetsMenu
            surveyId={surveyId}
            kind="banner"
            onSave={buildBookmarkConfig}
            onLoad={(config) =>
              onLoadBookmark({
                id: '',
                name: '',
                kind: 'crosstab',
                config,
                created_at: 0,
                updated_at: 0,
              })
            }
          />
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
            heading="Default filters"
          />
          <p className="text-xs text-slate-400">
            Default filters apply to all tables on build. Override filters per table in each result section below.
          </p>
        </CollapsibleSection>

        <div className="p-4 pb-12 sm:p-6 sm:pb-16">
        {!bannerResult && !analyzing && (
          <EmptyCanvas
            icon={<Table2 size={40} />}
            title="Advanced crosstabs"
            description="Add side row and banner questions, set table options, then build the crosstab."
          />
        )}
        {analyzing && !bannerResult && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center sm:py-20">
            <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
            <p className="text-sm font-medium text-slate-700">Building crosstab…</p>
            <p className="max-w-sm px-4 text-xs text-slate-500">
              Large studies load response data first, then build tables in batches so nothing times out.
            </p>
          </div>
        )}
        {analyzing && bannerResult && bannerProgress && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--et-teal)]/25 bg-[var(--et-teal-light)]/40 px-4 py-3">
            <Loader2 className="shrink-0 animate-spin text-[var(--et-teal)]" size={18} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">
                Building table {bannerProgress.done} of {bannerProgress.total}…
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                <div
                  className="h-full rounded-full bg-[var(--et-teal)] transition-all duration-300"
                  style={{ width: `${Math.round((bannerProgress.done / bannerProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
        {bannerResult && (
          <div className="animate-fade-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
            <CrosstabsResults
              result={bannerResult}
              multiControls={{
                surveyId,
                completionStatus,
                variables,
                globalFilters: filters,
                tableFilters,
                onTableFiltersChange,
                onRefreshTable,
                refreshingTableId,
                onTablePresetApply: onTablePresetApply,
              }}
            />
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
