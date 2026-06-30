import { useMemo, useState } from 'react'
import { Loader2, Plus, Save, Search, Settings2, Trash2 } from 'lucide-react'
import type { DataQualityResult, QcConfig, QcCustomRule, SurveyVariable } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { saveUserFieldDefaults } from '../../lib/surveyFieldDefaults'

const DEFAULT_THRESHOLDS: QcConfig['thresholds'] = {
  speeder_time_basis: 'average',
  speeder_custom_reference_seconds: null,
  speeder_min_seconds: 0,
  speeder_median_fraction: 0.25,
  min_array_items_straight_line: 4,
  min_text_length_gibberish: 3,
  interviewer_duplicate_similarity_pct: 85,
  interviewer_gps_proximity_meters: 10,
  interviewer_gps_proximity_min_cluster: 2,
  interviewer_gps_proximity_flag_all_in_cluster: false,
  interviewer_min_gap_seconds: 300,
}

function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—'
  const rounded = Math.round(seconds)
  if (rounded < 60) return `${rounded}s`
  const minutes = Math.floor(rounded / 60)
  const secs = rounded % 60
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`
}

function emptyRule(): QcCustomRule {
  return { variable_id: '', operator: 'in', values: [], name: '' }
}

interface Props {
  variables: SurveyVariable[]
  config: QcConfig
  onChange: (config: QcConfig) => void
  onSave: () => Promise<void>
  saving?: boolean
  speederStats?: DataQualityResult['speeders'] | null
  straightLineStats?: DataQualityResult['straight_liners'] | null
}

function itemCountForVariable(v: SurveyVariable): number {
  return Math.max(v.columns?.length ?? 0, v.subquestions?.length ?? 0)
}

function isGpsCandidate(v: SurveyVariable): boolean {
  if (v.custom) return false
  if (v.kind === 'location') return true
  const hay = `${v.code} ${v.text}`.toLowerCase()
  return /\b(gps|location|geolocation|coordinates|latitude|longitude|loctrac)\b/.test(hay)
}

function eligibleStraightLineVariables(
  variables: SurveyVariable[],
  minItems: number,
): SurveyVariable[] {
  return variables.filter(
    (v) => !v.custom && v.kind === 'array' && itemCountForVariable(v) >= minItems,
  )
}

export function QcSettingsPanel({
  variables,
  config,
  onChange,
  onSave,
  saving,
  speederStats,
  straightLineStats,
}: Props) {
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [straightSearch, setStraightSearch] = useState('')
  const thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds }
  const rules = config.custom_rules ?? []
  const timeBasis = thresholds.speeder_time_basis ?? 'average'
  const useCustomReference = (thresholds.speeder_custom_reference_seconds ?? 0) > 0
  const surveyAverage = speederStats?.average_seconds
  const surveyMedian = speederStats?.median_seconds
  const selectedSurveyTime = timeBasis === 'median' ? surveyMedian : surveyAverage
  const effectiveReference = useCustomReference
    ? thresholds.speeder_custom_reference_seconds ?? 0
    : selectedSurveyTime ?? 0
  const effectiveThreshold = Math.max(
    thresholds.speeder_min_seconds ?? 0,
    effectiveReference * (thresholds.speeder_median_fraction ?? 0.25),
  )

  const filterVars = variables.filter(
    (v) =>
      v.custom ||
      v.kind === 'single' ||
      v.kind === 'multi' ||
      v.kind === 'numeric' ||
      v.kind === 'text',
  )

  const minStraightItems = thresholds.min_array_items_straight_line
  const eligibleStraightLine = useMemo(
    () => eligibleStraightLineVariables(variables, minStraightItems),
    [variables, minStraightItems],
  )
  const rawStraightIds = config.straight_line_variable_ids
  const straightLineAutoMode = rawStraightIds == null
  const selectedStraightIds = straightLineAutoMode
    ? eligibleStraightLine.map((v) => v.id)
    : rawStraightIds
  const selectedStraightSet = useMemo(() => new Set(selectedStraightIds), [selectedStraightIds])

  const filteredStraightLine = useMemo(() => {
    const q = straightSearch.trim().toLowerCase()
    if (!q) return eligibleStraightLine
    return eligibleStraightLine.filter(
      (v) =>
        v.code.toLowerCase().includes(q) ||
        (v.text || '').toLowerCase().includes(q),
    )
  }, [eligibleStraightLine, straightSearch])

  const gpsCandidates = useMemo(() => {
    const hinted = variables.filter(isGpsCandidate)
    if (hinted.length > 0) return hinted
    return variables.filter((v) => !v.custom && v.kind === 'location')
  }, [variables])

  function setStraightLineSelection(nextIds: string[]) {
    const cleaned = nextIds.filter((id) => eligibleStraightLine.some((v) => v.id === id))
    onChange({
      ...config,
      straight_line_variable_ids:
        cleaned.length === eligibleStraightLine.length ? null : cleaned,
    })
  }

  function toggleStraightLineVariable(variableId: string) {
    const base = straightLineAutoMode ? eligibleStraightLine.map((v) => v.id) : [...selectedStraightIds]
    const next = base.includes(variableId)
      ? base.filter((id) => id !== variableId)
      : [...base, variableId]
    setStraightLineSelection(next)
  }

  function selectAllStraightLine() {
    onChange({ ...config, straight_line_variable_ids: null })
  }

  function clearAllStraightLine() {
    onChange({ ...config, straight_line_variable_ids: [] })
  }

  function addStraightLineVariable(variableId: string) {
    if (!variableId || selectedStraightSet.has(variableId)) return
    const base = straightLineAutoMode ? eligibleStraightLine.map((v) => v.id) : [...selectedStraightIds]
    setStraightLineSelection([...base, variableId])
  }

  function updateThresholds(patch: Partial<QcConfig['thresholds']>) {
    onChange({
      ...config,
      thresholds: { ...DEFAULT_THRESHOLDS, ...thresholds, ...patch },
    })
  }

  function updateRule(index: number, patch: Partial<QcCustomRule>) {
    const next = rules.map((r, i) => (i === index ? { ...r, ...patch } : r))
    onChange({ ...config, custom_rules: next })
  }

  function addRule() {
    onChange({ ...config, custom_rules: [...rules, emptyRule()] })
  }

  function removeRule(index: number) {
    onChange({ ...config, custom_rules: rules.filter((_, i) => i !== index) })
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Settings2 size={18} className="text-[var(--et-teal)]" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">QC thresholds & custom rules</h3>
            <p className="text-xs text-slate-500">
              Tune check sensitivity for this survey. Saved settings apply for all team members.
            </p>
          </div>
        </div>
        <span className="text-xs font-medium text-slate-400">{expanded ? 'Hide' : 'Show'}</span>
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-slate-100 px-5 py-4">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Speeders</p>
            <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <div>
                <span className="mb-2 block text-xs font-medium text-slate-600">Reference completion time</span>
                <div className="flex flex-wrap gap-2">
                  {(['average', 'median'] as const).map((basis) => (
                    <button
                      key={basis}
                      type="button"
                      onClick={() =>
                        updateThresholds({
                          speeder_time_basis: basis,
                          speeder_custom_reference_seconds: null,
                        })
                      }
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        timeBasis === basis && !useCustomReference
                          ? 'border-[var(--et-teal)] bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {basis === 'average' ? 'Average time' : 'Median time'}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-slate-500">
                  Choose whether speeder detection compares each interview to the survey average or median
                  completion time.
                </p>
              </div>

              {speederStats?.available && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Survey average</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-slate-800">
                      {formatDuration(surveyAverage)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Survey median</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-slate-800">
                      {formatDuration(surveyMedian)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Active threshold</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums text-slate-800">
                      {formatDuration(speederStats.threshold_seconds ?? effectiveThreshold)}
                    </p>
                  </div>
                </div>
              )}

              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={useCustomReference}
                  onChange={(e) =>
                    updateThresholds({
                      speeder_custom_reference_seconds: e.target.checked
                        ? Math.max(60, Math.round(selectedSurveyTime ?? 60))
                        : null,
                    })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--et-teal)] focus:ring-[var(--et-teal)]"
                />
                <span>
                  <span className="font-medium text-slate-700">Use custom reference time</span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    Override survey average/median with your own reference duration (seconds).
                  </span>
                </span>
              </label>

              {useCustomReference && (
                <label className="block max-w-xs text-xs">
                  <span className="mb-1 block font-medium text-slate-600">Custom reference (seconds)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={thresholds.speeder_custom_reference_seconds ?? ''}
                    onChange={(e) =>
                      updateThresholds({
                        speeder_custom_reference_seconds: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="et-input w-full"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">
                    {formatDuration(thresholds.speeder_custom_reference_seconds)}
                  </span>
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs">
                  <span className="mb-1 block font-medium text-slate-600">Speeder time fraction</span>
                  <input
                    type="number"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={thresholds.speeder_median_fraction}
                    onChange={(e) =>
                      updateThresholds({
                        speeder_median_fraction: Math.min(1, Math.max(0.05, Number(e.target.value) || 0.25)),
                      })
                    }
                    className="et-input w-full"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">
                    Flag completes faster than this share of the reference time
                  </span>
                </label>
                <label className="text-xs">
                  <span className="mb-1 block font-medium text-slate-600">Absolute floor (seconds)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={thresholds.speeder_min_seconds}
                    onChange={(e) =>
                      updateThresholds({ speeder_min_seconds: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="et-input w-full"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">
                    Optional minimum threshold; effective = max(floor, reference × fraction)
                  </span>
                </label>
              </div>

              {!speederStats?.available && effectiveReference > 0 && (
                <p className="text-[10px] text-slate-500">
                  Preview threshold: {formatDuration(effectiveThreshold)} (reference{' '}
                  {useCustomReference ? 'custom' : timeBasis} {formatDuration(effectiveReference)} ×{' '}
                  {Math.round((thresholds.speeder_median_fraction ?? 0.25) * 100)}%)
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Straight-lining</p>
            <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <label className="block max-w-xs text-xs">
                <span className="mb-1 block font-medium text-slate-600">Minimum grid items</span>
                <input
                  type="number"
                  min={2}
                  step={1}
                  value={thresholds.min_array_items_straight_line}
                  onChange={(e) =>
                    updateThresholds({
                      min_array_items_straight_line: Math.max(2, Number(e.target.value) || 4),
                    })
                  }
                  className="et-input w-full"
                />
                <span className="mt-1 block text-[10px] text-slate-400">
                  Flag when the same answer is given on at least this many grid rows
                </span>
              </label>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-700">
                    Grid questions checked
                    <span className="ml-1 font-normal text-slate-500">
                      ({selectedStraightIds.length} of {eligibleStraightLine.length})
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectAllStraightLine}
                      className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                    >
                      Select all
                    </button>
                    {!straightLineAutoMode && (
                      <button
                        type="button"
                        onClick={clearAllStraightLine}
                        className="text-xs font-medium text-slate-500 hover:underline"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  {straightLineAutoMode
                    ? 'All eligible grid/array questions are checked. Uncheck a question to customize.'
                    : 'Custom selection — only checked questions are scanned for straight-lining.'}
                </p>

                {straightLineStats?.checked_variables?.length ? (
                  <p className="mt-2 text-[10px] text-slate-500">
                    Last scan: {straightLineStats.checked_variables.length} question
                    {straightLineStats.checked_variables.length === 1 ? '' : 's'} checked
                  </p>
                ) : null}

                {eligibleStraightLine.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">
                    No grid questions with at least {minStraightItems} items found in this survey.
                  </p>
                ) : (
                  <>
                    <div className="relative mt-3">
                      <Search
                        size={14}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="search"
                        value={straightSearch}
                        onChange={(e) => setStraightSearch(e.target.value)}
                        placeholder="Search grid questions…"
                        className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
                      />
                    </div>

                    <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                      {filteredStraightLine.map((v) => {
                        const checked = selectedStraightSet.has(v.id)
                        const items = itemCountForVariable(v)
                        return (
                          <li key={v.id}>
                            <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleStraightLineVariable(v.id)}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--et-teal)] focus:ring-[var(--et-teal)]"
                              />
                              <span className="min-w-0 flex-1 text-xs">
                                <span className="font-medium text-slate-800">
                                  {v.code} · {(v.text || v.code).slice(0, 72)}
                                </span>
                                <span className="mt-0.5 block text-[10px] text-slate-500">
                                  {items} grid items · {v.type_label}
                                </span>
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>

                    {eligibleStraightLine.some((v) => !selectedStraightSet.has(v.id)) && (
                      <label className="mt-3 block text-xs">
                        <span className="mb-1 block font-medium text-slate-600">Add another grid question</span>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            addStraightLineVariable(e.target.value)
                            e.target.value = ''
                          }}
                          className="et-select w-full"
                        >
                          <option value="">Choose question to add…</option>
                          {eligibleStraightLine
                            .filter((v) => !selectedStraightSet.has(v.id))
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.code} — {(v.text || v.code).slice(0, 48)} ({itemCountForVariable(v)} items)
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Interviewer field checks
            </p>
            <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="text-xs text-slate-600">
                Require an interviewer question in QC or Field manage settings. Checks duplicate
                answers, interviews at the same GPS spot, and back-to-back completes with too little
                time between them.
              </p>
              <label className="block max-w-xl text-xs">
                <span className="mb-1 block font-medium text-slate-600">GPS / location question</span>
                <select
                  value={config.gps_variable_id ?? ''}
                  onChange={(e) => {
                    const gpsId = e.target.value || null
                    onChange({
                      ...config,
                      gps_variable_id: gpsId,
                    })
                    if (user?.username) {
                      const v = gpsId ? variables.find((item) => item.id === gpsId) : null
                      saveUserFieldDefaults(user.username, { gpsCode: v?.code ?? null })
                    }
                  }}
                  className="et-select w-full"
                >
                  <option value="">Auto-detect from survey export</option>
                  {gpsCandidates.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code} — {(v.text || v.code).slice(0, 56)}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] text-slate-400">
                  Used for proximity checks — flag when the same interviewer completes interviews
                  within the distance below
                </span>
              </label>
              <label className="block max-w-xs text-xs">
                <span className="mb-1 block font-medium text-slate-600">
                  Duplicate answer similarity (%)
                </span>
                <input
                  type="number"
                  min={80}
                  max={100}
                  step={1}
                  value={thresholds.interviewer_duplicate_similarity_pct ?? 85}
                  onChange={(e) =>
                    updateThresholds({
                      interviewer_duplicate_similarity_pct: Math.min(
                        100,
                        Math.max(80, Number(e.target.value) || 85),
                      ),
                    })
                  }
                  className="et-input w-full"
                />
                <span className="mt-1 block text-[10px] text-slate-400">
                  Flag when {thresholds.interviewer_duplicate_similarity_pct ?? 85}% or more of
                  comparable answers match an earlier record by the same interviewer
                </span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs">
                  <span className="mb-1 block font-medium text-slate-600">GPS proximity (metres)</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    value={thresholds.interviewer_gps_proximity_meters ?? 10}
                    onChange={(e) =>
                      updateThresholds({
                        interviewer_gps_proximity_meters: Math.min(
                          500,
                          Math.max(1, Number(e.target.value) || 10),
                        ),
                      })
                    }
                    className="et-input w-full"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">
                    Max distance between interviews at the same spot
                  </span>
                </label>
                <label className="text-xs">
                  <span className="mb-1 block font-medium text-slate-600">Min interviews at same spot</span>
                  <input
                    type="number"
                    min={2}
                    max={20}
                    step={1}
                    value={thresholds.interviewer_gps_proximity_min_cluster ?? 2}
                    onChange={(e) =>
                      updateThresholds({
                        interviewer_gps_proximity_min_cluster: Math.min(
                          20,
                          Math.max(2, Number(e.target.value) || 2),
                        ),
                      })
                    }
                    className="et-input w-full"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">
                    Only flag when this many interviews by the same interviewer fall within the
                    distance above (e.g. 3 = three completes at one GPS location)
                  </span>
                </label>
              </div>
              <label className="mt-3 inline-flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(thresholds.interviewer_gps_proximity_flag_all_in_cluster)}
                  onChange={(e) =>
                    updateThresholds({
                      interviewer_gps_proximity_flag_all_in_cluster: e.target.checked,
                    })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--et-teal)] focus:ring-[var(--et-teal)]"
                />
                <span>
                  <span className="font-medium text-slate-800">Flag every interview in the cluster</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    When off, only later interviews are flagged (first at each spot is kept). When on,
                    all interviews in a qualifying cluster are flagged.
                  </span>
                </span>
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs sm:col-span-2">
                  <span className="mb-1 block font-medium text-slate-600">Minimum gap (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    step={1}
                    value={Math.round((thresholds.interviewer_min_gap_seconds ?? 300) / 60)}
                    onChange={(e) =>
                      updateThresholds({
                        interviewer_min_gap_seconds: Math.min(
                          86400,
                          Math.max(60, (Number(e.target.value) || 5) * 60),
                        ),
                      })
                    }
                    className="et-input w-full"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">
                    Minimum time between consecutive interviews by the same interviewer
                  </span>
                </label>
              </div>
              {!config.interviewer_variable_id && (
                <p className="text-xs text-amber-800">
                  Set the interviewer variable on the <strong>Team</strong> tab or in Field manage
                  quotas so these checks can run.
                </p>
              )}
              {config.gps_variable_id && gpsCandidates.length === 0 && (
                <p className="text-xs text-amber-800">
                  No GPS-style questions were detected in this survey. Re-import data or pick auto-detect.
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Other thresholds</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                <span className="mb-1 block font-medium text-slate-600">Gibberish min length</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={thresholds.min_text_length_gibberish}
                  onChange={(e) =>
                    updateThresholds({
                      min_text_length_gibberish: Math.max(1, Number(e.target.value) || 3),
                    })
                  }
                  className="et-input w-full"
                />
              </label>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Custom variable rules</p>
              <button
                type="button"
                onClick={addRule}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
              >
                <Plus size={14} />
                Add rule
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Flag completed interviews that match a question or custom variable (e.g. test market, invalid code).
              Rules are saved for this survey and apply for all team members.
            </p>
            {rules.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                No custom rules yet.
              </p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule, index) => {
                  const selectedVar = filterVars.find((v) => v.id === rule.variable_id)
                  const options = selectedVar?.answer_options ?? []
                  return (
                    <div
                      key={index}
                      className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-[1fr_auto_auto_auto]"
                    >
                      <input
                        type="text"
                        placeholder="Rule label (optional)"
                        value={rule.name}
                        onChange={(e) => updateRule(index, { name: e.target.value })}
                        className="et-input text-xs sm:col-span-4"
                      />
                      <select
                        value={rule.variable_id}
                        onChange={(e) => updateRule(index, { variable_id: e.target.value, values: [] })}
                        className="et-select text-xs"
                      >
                        <option value="">Select variable…</option>
                        {filterVars.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.custom ? '[Custom] ' : ''}
                            {v.code} — {(v.text || v.code).slice(0, 40)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={rule.operator}
                        onChange={(e) =>
                          updateRule(index, { operator: e.target.value as QcCustomRule['operator'] })
                        }
                        className="et-select text-xs"
                      >
                        <option value="in">Matches any of</option>
                        <option value="not_in">Does not match</option>
                        <option value="is_empty">Is empty</option>
                        <option value="not_empty">Is not empty</option>
                      </select>
                      {rule.operator === 'in' || rule.operator === 'not_in' ? (
                        <select
                          multiple
                          value={rule.values}
                          onChange={(e) =>
                            updateRule(index, {
                              values: Array.from(e.target.selectedOptions).map((o) => o.value),
                            })
                          }
                          className="et-select min-h-[2.5rem] text-xs"
                        >
                          {options.map((o) => (
                            <option key={o.code} value={o.code}>
                              {o.label || o.code}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-xs text-slate-400 self-center">No values needed</div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRule(index)}
                        className="self-start rounded p-1 text-slate-400 hover:bg-white hover:text-red-600"
                        title="Remove rule"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save QC settings & re-scan
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
