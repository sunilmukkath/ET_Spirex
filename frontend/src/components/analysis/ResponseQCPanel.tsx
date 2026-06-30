import { useCallback, useEffect, useMemo, useState, Component, type ReactNode, useRef } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { api, type DataQualityResult, type QcConfig, type SurveyVariable } from '../../api/client'
import {
  aggregateFlaggedRows,
  checkCount,
  computeQcMetrics,
  CUSTOM_RULES_CHECK,
  disabledChecksFromEnabled,
  enabledChecksFromDisabled,
  enrichFlaggedRowsWithInterviewers,
  exportFlaggedCsv,
  isCheckAvailable,
  isIncludedInQcSample,
  normalizeQcResult,
  QC_CHECKS,
  qcCacheKey,
  setQcSampleInclusion,
  type QcCheckId,
  type QcFlaggedRow,
  type QcReviewState,
} from '../../lib/qcHelpers'
import { useAuth } from '../../auth/AuthContext'
import {
  applyQcDefaultsIfEmpty,
  captureQcDefaults,
  loadUserFieldDefaults,
  saveUserFieldDefaults,
} from '../../lib/surveyFieldDefaults'
import { ErrorState } from '../States'
import { InterviewerQcTab } from './InterviewerQcTab'
import { QcSettingsPanel } from './QcSettingsPanel'

interface Props {
  surveyId: number
  variables?: SurveyVariable[]
  onUseQcApproved?: () => void
  onReviewChanged?: () => void
  qcApprovedCount?: number | null
  embedded?: boolean
}

function defaultQcConfig(): QcConfig {
  return {
    disabled_checks: [],
    kept_response_ids: [],
    excluded_response_ids: [],
    thresholds: {
      speeder_time_basis: 'average',
      speeder_custom_reference_seconds: null,
      speeder_min_seconds: 0,
      speeder_median_fraction: 0.25,
      min_array_items_straight_line: 4,
      min_text_length_gibberish: 3,
      interviewer_duplicate_similarity_pct: 85,
      interviewer_gps_proximity_meters: 10,
      interviewer_min_gap_seconds: 300,
    },
    custom_rules: [],
    straight_line_variable_ids: null,
  }
}

function loadCached(surveyId: number): { result: DataQualityResult; at: number } | null {
  try {
    const raw = sessionStorage.getItem(qcCacheKey(surveyId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { result: DataQualityResult; at: number }
    if (!parsed?.result) return null
    return { result: normalizeQcResult(parsed.result), at: parsed.at }
  } catch {
    return null
  }
}

function saveCached(surveyId: number, result: DataQualityResult) {
  try {
    sessionStorage.setItem(
      qcCacheKey(surveyId),
      JSON.stringify({ result, at: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

export function ResponseQCPanel({ surveyId, variables = [], onUseQcApproved, onReviewChanged, qcApprovedCount, embedded }: Props) {
  return (
    <QcErrorBoundary onReset={() => sessionStorage.removeItem(qcCacheKey(surveyId))}>
      <ResponseQCPanelInner
        surveyId={surveyId}
        variables={variables}
        onUseQcApproved={onUseQcApproved}
        onReviewChanged={onReviewChanged}
        qcApprovedCount={qcApprovedCount}
        embedded={embedded}
      />
    </QcErrorBoundary>
  )
}

function ResponseQCPanelInner({ surveyId, variables = [], onUseQcApproved, onReviewChanged, qcApprovedCount, embedded }: Props) {
  const { user } = useAuth()
  const qcDefaultsSynced = useRef(false)
  const [result, setResult] = useState<DataQualityResult | null>(() => loadCached(surveyId)?.result ?? null)
  const [lastRunAt, setLastRunAt] = useState<number | null>(() => loadCached(surveyId)?.at ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterCheck, setFilterCheck] = useState<QcCheckId | 'all'>('all')
  const [search, setSearch] = useState('')
  const [qcConfig, setQcConfig] = useState<QcConfig>(defaultQcConfig)
  const [configLoading, setConfigLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reviewSaving, setReviewSaving] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [qcTab, setQcTab] = useState<'overview' | 'interviewer'>('overview')
  const [interviewerLabels, setInterviewerLabels] = useState<Record<string, string>>({})
  const [interviewerVariableId, setInterviewerVariableId] = useState<string | null>(null)

  const showInterviewerColumn = Boolean(interviewerVariableId)

  const enabledChecks = useMemo(
    () => enabledChecksFromDisabled(qcConfig.disabled_checks ?? []),
    [qcConfig.disabled_checks],
  )
  const review = useMemo<QcReviewState>(
    () => ({
      kept: new Set(qcConfig.kept_response_ids ?? []),
      excluded: new Set(qcConfig.excluded_response_ids ?? []),
    }),
    [qcConfig.kept_response_ids, qcConfig.excluded_response_ids],
  )
  const hasCustomRules = (qcConfig.custom_rules?.length ?? 0) > 0

  const surveyReady = Number.isFinite(surveyId) && surveyId > 0

  const persistConfig = useCallback(
    async (next: QcConfig) => {
      setQcConfig(next)
      setReviewSaving(true)
      try {
        const saved = await api.setQcConfig(surveyId, next)
        setQcConfig(saved)
        onReviewChanged?.()
      } catch {
        const cfg = await api.getQcConfig(surveyId).catch(() => null)
        if (cfg) setQcConfig(cfg)
      } finally {
        setReviewSaving(false)
      }
    },
    [surveyId, onReviewChanged],
  )

  const persistReview = useCallback(
    async (nextReview: QcReviewState, checks: Set<QcCheckId>) => {
      await persistConfig({
        ...qcConfig,
        disabled_checks: disabledChecksFromEnabled(checks),
        kept_response_ids: [...nextReview.kept],
        excluded_response_ids: [...nextReview.excluded],
      })
    },
    [qcConfig, persistConfig],
  )

  useEffect(() => {
    const cached = loadCached(surveyId)
    setResult(cached?.result ?? null)
    setLastRunAt(cached?.at ?? null)
    setError(null)
    setLoading(false)
    setFilterCheck('all')
    setSearch('')
  }, [surveyId])

  useEffect(() => {
    if (!surveyReady) {
      setInterviewerLabels({})
      setInterviewerVariableId(null)
      return
    }
    let cancelled = false
    api
      .getInterviewerLabels(surveyId, qcConfig.interviewer_variable_id ?? undefined)
      .then((res) => {
        if (!cancelled) {
          setInterviewerVariableId(res.interviewer_variable_id ?? null)
          setInterviewerLabels(res.labels ?? {})
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInterviewerLabels({})
          setInterviewerVariableId(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [surveyId, surveyReady, qcConfig.interviewer_variable_id, lastRunAt])

  useEffect(() => {
    qcDefaultsSynced.current = false
  }, [surveyId])

  useEffect(() => {
    let cancelled = false
    setConfigLoading(true)
    api
      .getQcConfig(surveyId)
      .then((cfg) => {
        if (!cancelled) {
          setQcConfig({ ...defaultQcConfig(), ...cfg })
        }
      })
      .catch(() => {
        if (!cancelled) setQcConfig(defaultQcConfig())
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [surveyId])

  useEffect(() => {
    if (!variables.length || configLoading || qcDefaultsSynced.current) return
    const userDefaults = user?.username ? loadUserFieldDefaults(user.username) : null
    const { config: patched, changed } = applyQcDefaultsIfEmpty(qcConfig, variables, userDefaults)
    if (!changed) {
      qcDefaultsSynced.current = true
      return
    }
    qcDefaultsSynced.current = true
    setQcConfig(patched)
    void api.setQcConfig(surveyId, patched).catch(() => {})
  }, [surveyId, variables, configLoading, qcConfig, user?.username])

  function rememberQcDefaults(config: QcConfig) {
    if (!user?.username || !variables.length) return
    saveUserFieldDefaults(user.username, captureQcDefaults(config, variables))
  }

  const runScan = useCallback(
    async (refresh = true) => {
      if (!surveyReady) {
        setError('Invalid survey ID — return to the dashboard and open the survey again.')
        return
      }
      setLoading(true)
      setError(null)
      try {
        const data = normalizeQcResult(await api.getDataQuality(surveyId, 'complete', refresh))
        setResult(data)
        const at = Date.now()
        setLastRunAt(at)
        saveCached(surveyId, data)
        onReviewChanged?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'QC scan failed')
      } finally {
        setLoading(false)
      }
    },
    [surveyId, surveyReady, onReviewChanged],
  )

  const toggleCheck = useCallback(
    async (checkId: QcCheckId, include: boolean) => {
      const next = new Set(enabledChecks)
      if (include) next.add(checkId)
      else next.delete(checkId)
      await persistReview(review, next)
    },
    [enabledChecks, review, persistReview],
  )

  const saveQcSettings = useCallback(
    async (nextConfig: QcConfig) => {
      setSettingsSaving(true)
      try {
        const saved = await api.setQcConfig(surveyId, nextConfig)
        setQcConfig(saved)
        rememberQcDefaults(saved)
        onReviewChanged?.()
        await runScan(true)
      } catch {
        const cfg = await api.getQcConfig(surveyId).catch(() => null)
        if (cfg) setQcConfig(cfg)
      } finally {
        setSettingsSaving(false)
      }
    },
    [surveyId, onReviewChanged, runScan],
  )

  const saveQcConfigOnly = useCallback(async () => {
    setSettingsSaving(true)
    try {
      const saved = await api.setQcConfig(surveyId, qcConfig)
      setQcConfig(saved)
      rememberQcDefaults(saved)
      onReviewChanged?.()
    } catch {
      const cfg = await api.getQcConfig(surveyId).catch(() => null)
      if (cfg) setQcConfig(cfg)
    } finally {
      setSettingsSaving(false)
    }
  }, [surveyId, qcConfig, onReviewChanged])

  const metrics = useMemo(() => {
    if (!result) return null
    return computeQcMetrics(result, enabledChecks)
  }, [result, enabledChecks])

  const activeRows = useMemo(() => {
    if (!result) return []
    let rows: QcFlaggedRow[]
    if (filterCheck !== 'all') {
      rows = aggregateFlaggedRows(result, new Set([filterCheck]))
    } else {
      rows = aggregateFlaggedRows(result, enabledChecks)
    }
    return enrichFlaggedRowsWithInterviewers(rows, interviewerLabels)
  }, [result, enabledChecks, filterCheck, interviewerLabels])

  const exportRows = useMemo(() => {
    if (!result) return []
    return enrichFlaggedRowsWithInterviewers(
      aggregateFlaggedRows(result, enabledChecks),
      interviewerLabels,
    )
  }, [result, enabledChecks, interviewerLabels])

  const enabledFlaggedCount = exportRows.length

  const flaggedIdSet = useMemo(
    () => new Set(exportRows.map((row) => row.response_id)),
    [exportRows],
  )

  const excludedFromSampleCount = useMemo(() => {
    return exportRows.filter((row) => !isIncludedInQcSample(row.response_id, flaggedIdSet, review)).length
  }, [exportRows, flaggedIdSet, review])

  const setInclusion = useCallback(
    (responseId: string, include: boolean) => {
      const next = setQcSampleInclusion(responseId, include, flaggedIdSet, review)
      void persistReview(next, enabledChecks)
    },
    [flaggedIdSet, review, persistReview, enabledChecks],
  )

  const applyBulkInclusion = useCallback(
    (include: boolean) => {
      let next = review
      for (const id of selectedIds) {
        next = setQcSampleInclusion(id, include, flaggedIdSet, next)
      }
      void persistReview(next, enabledChecks)
      setSelectedIds(new Set())
    },
    [selectedIds, flaggedIdSet, review, persistReview, enabledChecks],
  )

  const resetReview = useCallback(() => {
    void persistReview({ kept: new Set(), excluded: new Set() }, enabledChecks)
    setSelectedIds(new Set())
  }, [persistReview, enabledChecks])

  const toggleSelected = useCallback((responseId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(responseId)) next.delete(responseId)
      else next.add(responseId)
      return next
    })
  }, [])

  const filteredRows = useMemo(() => {
    let rows = activeRows
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (r) =>
          r.response_id.toLowerCase().includes(q) ||
          r.detail.toLowerCase().includes(q) ||
          (r.interviewer?.toLowerCase().includes(q) ?? false) ||
          r.checks.some((c) => c.includes(q)),
      )
    }
    return rows
  }, [activeRows, search])

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(filteredRows.map((row) => row.response_id)))
  }, [filteredRows])

  if (!surveyReady) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8">
        <ErrorState message="Invalid survey ID." />
      </div>
    )
  }

  if (!result && loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={36} />
        <div className="text-center">
          <h2 className="text-lg font-semibold text-slate-900">Running QC scan</h2>
          <p className="mt-1 text-sm text-slate-500">
            Checking completed interviews — large surveys may take a few minutes.
          </p>
        </div>
      </div>
    )
  }

  if (!result && !loading && !error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]">
            <ShieldCheck size={28} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Response QC</h2>
          <p className="mt-2 text-sm text-slate-500">
            Scan completed interviews for speeders, test responses, duplicate phones,
            straight-lining, and gibberish text. Toggle checks on or off to control what
            counts toward <strong>QC Approved</strong>.
          </p>
          <button
            type="button"
            onClick={() => runScan(true)}
            disabled={loading}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--et-teal)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
          >
            <Play size={16} />
            Run scan
          </button>
          <p className="mt-3 text-xs text-slate-400">
            Large surveys may take 1–3 minutes on first run.
          </p>
        </div>
      </div>
    )
  }

  if (error && !result) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8">
        <ErrorState message={error} />
        <button
          type="button"
          onClick={() => runScan(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white"
        >
          <RefreshCw size={16} />
          Retry scan
        </button>
      </div>
    )
  }

  if (!result || !metrics) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8">
        <ErrorState message="QC results could not be displayed. Try running the scan again." />
        <button
          type="button"
          onClick={() => runScan(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white"
        >
          <RefreshCw size={16} />
          Run scan
        </button>
      </div>
    )
  }

  return (
    <div className={embedded ? '' : 'min-h-0 flex-1 overflow-y-auto p-6'}>
      <div className={embedded ? 'space-y-5' : 'mx-auto max-w-5xl space-y-5'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!embedded && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Response QC</h2>
            <p className="text-xs text-slate-500">
              {lastRunAt
                ? `Last scan ${new Date(lastRunAt).toLocaleString()} · completed interviews only`
                : 'Completed interviews only'}
            </p>
          </div>
          )}
          {embedded && (
          <p className="text-xs text-slate-500">
            {lastRunAt
              ? `Last scan ${new Date(lastRunAt).toLocaleString()} · completed interviews only`
              : 'Completed interviews only'}
          </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {onUseQcApproved && result && (
              <button
                type="button"
                onClick={onUseQcApproved}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--et-teal)]/40 bg-[var(--et-teal-light)]/50 px-3 py-2 text-xs font-semibold text-[var(--et-teal-dark)] hover:bg-[var(--et-teal-light)]"
              >
                <CheckCircle2 size={14} />
                Use QC Approved sample
                {qcApprovedCount != null && (
                  <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] tabular-nums">
                    {qcApprovedCount}
                  </span>
                )}
              </button>
            )}
            {exportRows.length > 0 && (
              <button
                type="button"
                onClick={() => exportFlaggedCsv(exportRows, `survey_${surveyId}_qc_flags.csv`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download size={14} />
                Export flags
              </button>
            )}
            <button
              type="button"
              onClick={() => runScan(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <RefreshCw size={14} />
              )}
              {loading ? 'Scanning…' : 'Run scan'}
            </button>
          </div>
        </div>

        <div className="et-segment w-fit">
          <button
            type="button"
            onClick={() => setQcTab('overview')}
            className={`et-segment-btn text-xs ${qcTab === 'overview' ? 'et-segment-btn-active' : 'et-segment-btn-inactive'}`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setQcTab('interviewer')}
            className={`et-segment-btn text-xs ${qcTab === 'interviewer' ? 'et-segment-btn-active' : 'et-segment-btn-inactive'}`}
          >
            By interviewer
          </button>
        </div>

        {qcTab === 'interviewer' ? (
          <InterviewerQcTab
            surveyId={surveyId}
            variables={variables}
            qcConfig={qcConfig}
            onConfigChange={setQcConfig}
            onSaveConfig={saveQcConfigOnly}
            savingConfig={settingsSaving}
            hasScan={Boolean(result)}
            duplicateStats={result?.interviewer_duplicates}
            gpsProximityStats={result?.interviewer_gps_proximity}
            shortGapStats={result?.interviewer_short_gap}
          />
        ) : (
          <>
        {loading && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Loader2 className="animate-spin text-[var(--et-teal)]" size={16} />
            Running QC checks — this may take a few minutes on large surveys…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {result.message && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {result.message}
          </div>
        )}

        <QcSettingsPanel
          variables={variables}
          config={qcConfig}
          onChange={setQcConfig}
          onSave={() => saveQcSettings(qcConfig)}
          saving={settingsSaving}
          speederStats={result?.speeders}
          straightLineStats={result?.straight_liners}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryTile label="Sample size" value={metrics.total} />
          <SummaryTile label="Passed QC" value={metrics.clean} tone="pass" />
          <SummaryTile label="Failed QC" value={metrics.flagged} tone="fail" />
          <SummaryTile
            label="QC Approved sample"
            value={qcApprovedCount ?? '—'}
            tone="pass"
          />
          <SummaryTile label="Pass rate" value={`${metrics.passRate.toFixed(1)}%`} />
        </div>

        {(review.kept.size > 0 || review.excluded.size > 0) && (
          <p className="text-xs text-slate-500">
            Manual review: {review.kept.size} flagged kept · {review.excluded.size} excluded
            {reviewSaving && ' · saving…'}
            {!reviewSaving && (
              <button type="button" onClick={resetReview} className="ml-2 text-[var(--et-teal-dark)] hover:underline">
                Reset to auto
              </button>
            )}
          </p>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Issue type</h3>
            <p className="text-xs text-slate-500">
              Click a check to view only those flags. Disabled checks are excluded from pass/fail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <IssueChip
              label="All issues"
              count={enabledFlaggedCount}
              active={filterCheck === 'all'}
              onClick={() => setFilterCheck('all')}
            />
            {QC_CHECKS.map((check) => {
              const count = checkCount(check.id, result)
              const included = enabledChecks.has(check.id)
              return (
                <IssueChip
                  key={check.id}
                  label={check.title}
                  count={count}
                  active={filterCheck === check.id}
                  muted={!included}
                  onClick={() => setFilterCheck(filterCheck === check.id ? 'all' : check.id)}
                />
              )
            })}
            {(hasCustomRules || (result.custom_rules?.count ?? 0) > 0) && (
              <IssueChip
                label={CUSTOM_RULES_CHECK.title}
                count={checkCount('custom_rules', result)}
                active={filterCheck === 'custom_rules'}
                muted={!enabledChecks.has('custom_rules')}
                onClick={() =>
                  setFilterCheck(filterCheck === 'custom_rules' ? 'all' : 'custom_rules')
                }
              />
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-800">QC checks</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Turn off checks you do not want to count toward QC Approved (e.g. gibberish on name fields).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5 font-semibold">Check</th>
                  <th className="px-5 py-2.5 font-semibold">Found</th>
                  <th className="px-5 py-2.5 font-semibold">Severity</th>
                  <th className="px-5 py-2.5 font-semibold">Include in QC</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {QC_CHECKS.map((check) => {
                  const count = checkCount(check.id, result)
                  const available = isCheckAvailable(check.id, result)
                  const included = enabledChecks.has(check.id)
                  const active = filterCheck === check.id
                  return (
                    <tr
                      key={check.id}
                      className={`border-b border-slate-50 transition hover:bg-slate-50/80 ${
                        active ? 'bg-[var(--et-teal-light)]/30' : ''
                      } ${!included ? 'opacity-70' : ''}`}
                    >
                      <td
                        className="cursor-pointer px-5 py-3"
                        onClick={() => setFilterCheck(active ? 'all' : check.id)}
                      >
                        <p className="font-medium text-slate-900">{check.title}</p>
                        <p className="text-xs text-slate-500">{check.description}</p>
                      </td>
                      <td className="px-5 py-3 tabular-nums font-semibold text-slate-800">
                        {count}
                      </td>
                      <td className="px-5 py-3">
                        <SeverityBadge severity={check.severity} />
                      </td>
                      <td className="px-5 py-3">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={included}
                            disabled={configLoading}
                            onChange={(e) => toggleCheck(check.id, e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-[var(--et-teal)] focus:ring-[var(--et-teal)]"
                          />
                          <span className="text-xs text-slate-600">
                            {included ? 'On' : 'Off'}
                          </span>
                        </label>
                      </td>
                      <td
                        className="cursor-pointer px-5 py-3 text-xs text-slate-500"
                        onClick={() => setFilterCheck(active ? 'all' : check.id)}
                      >
                        {!available
                          ? 'Not available'
                          : count === 0
                            ? 'All clear'
                            : included
                              ? 'View flags ↓'
                              : 'Excluded from QC'}
                      </td>
                    </tr>
                  )
                })}
                {(hasCustomRules || (result.custom_rules?.count ?? 0) > 0) && (() => {
                  const check = CUSTOM_RULES_CHECK
                  const count = checkCount('custom_rules', result)
                  const available = isCheckAvailable('custom_rules', result)
                  const included = enabledChecks.has('custom_rules')
                  const active = filterCheck === 'custom_rules'
                  return (
                    <tr
                      className={`border-b border-slate-50 transition hover:bg-slate-50/80 ${
                        active ? 'bg-[var(--et-teal-light)]/30' : ''
                      } ${!included ? 'opacity-70' : ''}`}
                    >
                      <td
                        className="cursor-pointer px-5 py-3"
                        onClick={() => setFilterCheck(active ? 'all' : 'custom_rules')}
                      >
                        <p className="font-medium text-slate-900">{check.title}</p>
                        <p className="text-xs text-slate-500">{check.description}</p>
                      </td>
                      <td className="px-5 py-3 tabular-nums font-semibold text-slate-800">
                        {count}
                      </td>
                      <td className="px-5 py-3">
                        <SeverityBadge severity={check.severity} />
                      </td>
                      <td className="px-5 py-3">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={included}
                            disabled={configLoading}
                            onChange={(e) => toggleCheck('custom_rules', e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-[var(--et-teal)] focus:ring-[var(--et-teal)]"
                          />
                          <span className="text-xs text-slate-600">
                            {included ? 'On' : 'Off'}
                          </span>
                        </label>
                      </td>
                      <td
                        className="cursor-pointer px-5 py-3 text-xs text-slate-500"
                        onClick={() => setFilterCheck(active ? 'all' : 'custom_rules')}
                      >
                        {!available
                          ? 'Not available'
                          : count === 0
                            ? 'All clear'
                            : included
                              ? 'View flags ↓'
                              : 'Excluded from QC'}
                      </td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                Flagged records ({filteredRows.length}
                {filterCheck !== 'all' || search ? ` of ${activeRows.length}` : ''})
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Uncheck to remove from QC Approved analysis · {excludedFromSampleCount} excluded by default
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedIds.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => applyBulkInclusion(false)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100"
                  >
                    Exclude selected ({selectedIds.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBulkInclusion(true)}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    Keep selected
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                Select all
              </button>
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={showInterviewerColumn ? 'Search ID, interviewer, or detail…' : 'Search ID or detail…'}
                  className="w-48 rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
                />
              </div>
            </div>
          </div>
          {filteredRows.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-8 text-sm text-slate-500">
              <CheckCircle2 size={18} className="text-[var(--et-teal)]" />
              {activeRows.length === 0
                ? 'No flagged records for the selected checks.'
                : 'No records match your filter.'}
            </p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-3 py-2" aria-label="Select" />
                    <th className="px-3 py-2 font-semibold">In QC sample</th>
                    <th className="px-5 py-2 font-semibold">Response ID</th>
                    {showInterviewerColumn && (
                      <th className="px-5 py-2 font-semibold">Interviewer</th>
                    )}
                    <th className="px-5 py-2 font-semibold">Checks</th>
                    <th className="px-5 py-2 font-semibold">Severity</th>
                    <th className="px-5 py-2 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <FlaggedTableRow
                      key={row.response_id}
                      row={row}
                      showInterviewer={showInterviewerColumn}
                      selected={selectedIds.has(row.response_id)}
                      included={isIncludedInQcSample(row.response_id, flaggedIdSet, review)}
                      onToggleSelected={() => toggleSelected(row.response_id)}
                      onToggleInclusion={(include) => setInclusion(row.response_id, include)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
          </>
        )}
      </div>
    </div>
  )
}

function IssueChip({
  label,
  count,
  active,
  muted,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-[var(--et-teal)] bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]'
          : muted
            ? 'border-slate-200 bg-slate-50 text-slate-400'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
          active ? 'bg-white/80' : 'bg-slate-100'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone?: 'pass' | 'fail'
}) {
  const toneClass =
    tone === 'pass'
      ? 'border-emerald-200 bg-emerald-50/50'
      : tone === 'fail'
        ? 'border-rose-200 bg-rose-50/50'
        : 'border-slate-200 bg-white'
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const cls =
    severity === 'high'
      ? 'bg-rose-100 text-rose-800 ring-rose-200'
      : severity === 'medium'
        ? 'bg-amber-100 text-amber-900 ring-amber-200'
        : 'bg-slate-100 text-slate-700 ring-slate-200'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${cls}`}>
      {severity}
    </span>
  )
}

function FlaggedTableRow({
  row,
  showInterviewer,
  selected,
  included,
  onToggleSelected,
  onToggleInclusion,
}: {
  row: QcFlaggedRow
  showInterviewer?: boolean
  selected: boolean
  included: boolean
  onToggleSelected: () => void
  onToggleInclusion: (include: boolean) => void
}) {
  return (
    <tr className={`border-t border-slate-50 hover:bg-slate-50/50 ${!included ? 'bg-rose-50/30' : ''}`}>
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          className="h-4 w-4 rounded border-slate-300 text-[var(--et-teal)] focus:ring-[var(--et-teal)]"
          aria-label={`Select response ${row.response_id}`}
        />
      </td>
      <td className="px-3 py-2.5">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={included}
            onChange={(e) => onToggleInclusion(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-[var(--et-teal)] focus:ring-[var(--et-teal)]"
          />
          <span className={included ? 'text-emerald-700' : 'text-rose-700'}>
            {included ? 'Include' : 'Excluded'}
          </span>
        </label>
      </td>
      <td className="px-5 py-2.5 font-mono text-xs font-medium text-slate-800">
        {row.response_id}
      </td>
      {showInterviewer && (
        <td className="px-5 py-2.5 text-xs font-medium text-slate-700">
          {row.interviewer || '—'}
        </td>
      )}
      <td className="px-5 py-2.5">
        <div className="flex flex-wrap gap-1">
          {row.checks.map((c) => (
            <span
              key={c}
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {QC_CHECKS.find((x) => x.id === c)?.title ??
                (c === 'custom_rules' ? CUSTOM_RULES_CHECK.title : c)}
            </span>
          ))}
        </div>
      </td>
      <td className="px-5 py-2.5">
        <SeverityBadge severity={row.severity} />
      </td>
      <td className="max-w-md px-5 py-2.5 text-xs text-slate-600">{row.detail}</td>
    </tr>
  )
}

class QcErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { error: string | null }
> {
  state = { error: null as string | null }

  static getDerivedStateFromError(err: Error) {
    return { error: err.message || 'QC panel crashed' }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8">
          <ErrorState message={this.state.error} />
          <button
            type="button"
            onClick={() => {
              this.props.onReset?.()
              this.setState({ error: null })
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white"
          >
            <RefreshCw size={16} />
            Reset QC view
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
