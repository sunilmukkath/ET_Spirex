import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Loader2,
  Minus,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  api,
  type QuotaCheckField,
  type QuotaCheckLayer,
  type QuotaCheckResult,
  type QuotaConfig,
  type QuotaFieldConfig,
  type QuotaLayerCellTarget,
  type QuotaLayerConfig,
  type SurveyVariable,
} from '../../api/client'

interface Props {
  surveyId: number
  variables: SurveyVariable[]
}

function emptyConfig(): QuotaConfig {
  return {
    basis: 'complete',
    tolerance_count: 0,
    tolerance_pct: 2,
    fields: [],
    layers: [],
  }
}

function eligibleForQuota(v: SurveyVariable): boolean {
  return (v.kind === 'single' || v.kind === 'rank') && (v.answer_options?.length ?? 0) > 0
}

function statusClass(status: string): string {
  if (status === 'met') return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
  if (status === 'under') return 'bg-amber-50 text-amber-800 ring-amber-200'
  if (status === 'over') return 'bg-rose-50 text-rose-800 ring-rose-200'
  return 'bg-slate-50 text-slate-600 ring-slate-200'
}

function StatusBadge({ status }: { status: string }) {
  const Icon =
    status === 'met' ? CheckCircle2 : status === 'over' ? XCircle : status === 'under' ? AlertTriangle : Minus
  const tone =
    status === 'met'
      ? 'text-emerald-600'
      : status === 'over'
        ? 'text-rose-600'
        : status === 'under'
          ? 'text-amber-600'
          : 'text-slate-400'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusClass(status)}`}>
      <Icon size={12} className={tone} />
      {status}
    </span>
  )
}

function buildField(variable: SurveyVariable): QuotaFieldConfig {
  return {
    variable_id: variable.id,
    quota_type: 'count',
    cells: (variable.answer_options ?? []).map((o) => ({
      code: o.code,
      target: 0,
      min_value: null,
      max_value: null,
    })),
  }
}

function syncField(field: QuotaFieldConfig, variable: SurveyVariable): QuotaFieldConfig {
  const byCode = new Map(field.cells.map((c) => [c.code, c]))
  return {
    ...field,
    cells: (variable.answer_options ?? []).map((o) => {
      const prev = byCode.get(o.code)
      return {
        code: o.code,
        target: prev?.target ?? 0,
        min_value: prev?.min_value ?? null,
        max_value: prev?.max_value ?? null,
      }
    }),
  }
}

function generateLayerCells(
  variableIds: string[],
  varMap: Map<string, SurveyVariable>,
  maxCells = 60,
): QuotaLayerCellTarget[] {
  const vars = variableIds.map((id) => varMap.get(id)).filter((v): v is SurveyVariable => Boolean(v))
  if (vars.length < 2) return []

  let combos: Record<string, string>[] = [{}]
  for (const v of vars) {
    const next: Record<string, string>[] = []
    for (const combo of combos) {
      for (const opt of v.answer_options ?? []) {
        next.push({ ...combo, [v.id]: opt.code })
      }
    }
    combos = next
  }
  if (combos.length > maxCells) return []

  return combos.map((codes) => ({
    codes,
    target: 0,
    min_value: null,
    max_value: null,
  }))
}

function layerCellLabel(codes: Record<string, string>, varMap: Map<string, SurveyVariable>): string {
  return Object.entries(codes)
    .map(([vid, code]) => {
      const v = varMap.get(vid)
      const opt = v?.answer_options?.find((o) => o.code === code)
      return opt?.label || code
    })
    .join(' · ')
}

export function FieldManagementPanel({ surveyId, variables }: Props) {
  const [config, setConfig] = useState<QuotaConfig>(emptyConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [checkResult, setCheckResult] = useState<QuotaCheckResult | null>(null)
  const [checkBasis, setCheckBasis] = useState<'complete' | 'qc_approved'>('complete')

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])
  const eligible = useMemo(() => variables.filter(eligibleForQuota), [variables])
  const usedIds = useMemo(() => new Set(config.fields.map((f) => f.variable_id)), [config.fields])
  const available = useMemo(() => eligible.filter((v) => !usedIds.has(v.id)), [eligible, usedIds])

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getQuotaConfig(surveyId)
      const merged = { ...emptyConfig(), ...data, layers: data.layers ?? [] }
      setCheckBasis(merged.basis)
      setConfig(merged)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load quota settings')
      setConfig(emptyConfig())
    } finally {
      setLoading(false)
    }
  }, [surveyId])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (!variables.length) return
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields
        .map((f) => {
          const v = varMap.get(f.variable_id)
          return v ? syncField(f, v) : f
        })
        .filter((f) => varMap.has(f.variable_id)),
    }))
  }, [variables, varMap])

  const resultByField = useMemo(() => {
    const map = new Map<string, QuotaCheckField>()
    for (const row of checkResult?.fields ?? []) {
      map.set(row.variable_id, row)
    }
    return map
  }, [checkResult])

  const resultByLayer = useMemo(() => {
    const map = new Map<string, QuotaCheckLayer>()
    for (const row of checkResult?.layers ?? []) {
      map.set(row.id, row)
    }
    return map
  }, [checkResult])

  async function persistConfig(): Promise<QuotaConfig> {
    const saved = await api.setQuotaConfig(surveyId, {
      ...config,
      basis: checkBasis,
      layers: config.layers ?? [],
    })
    const next = { ...saved, layers: saved.layers ?? [] }
    setConfig(next)
    return next
  }

  async function handleSave() {
    setSaving(true)
    setNotice(null)
    setError(null)
    try {
      await persistConfig()
      setNotice('Quota targets saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleCheck() {
    if (config.fields.length === 0 && (config.layers ?? []).length === 0) {
      setError('Add at least one quota question or layer first.')
      return
    }
    setChecking(true)
    setError(null)
    setNotice(null)
    try {
      await persistConfig()
      const result = await api.checkQuotas(surveyId, checkBasis)
      setCheckResult({ ...result, layers: result.layers ?? [] })
      setNotice('Quota check complete.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quota check failed')
    } finally {
      setChecking(false)
    }
  }

  async function exportCsv(kind: 'quota' | 'qc') {
    setExporting(kind)
    setError(null)
    try {
      await api.exportFieldReport(surveyId, kind, { completionStatus: checkBasis })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  function addField(variableId: string) {
    const v = varMap.get(variableId)
    if (!v) return
    setConfig((prev) => ({ ...prev, fields: [...prev.fields, buildField(v)] }))
    setCheckResult(null)
  }

  function removeField(variableId: string) {
    setConfig((prev) => ({ ...prev, fields: prev.fields.filter((f) => f.variable_id !== variableId) }))
    setCheckResult(null)
  }

  function updateField(variableId: string, patch: Partial<QuotaFieldConfig>) {
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.variable_id === variableId ? { ...f, ...patch } : f)),
    }))
    setCheckResult(null)
  }

  function updateTarget(variableId: string, code: string, target: number) {
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.variable_id !== variableId
          ? f
          : {
              ...f,
              cells: f.cells.map((c) => (c.code === code ? { ...c, target } : c)),
            },
      ),
    }))
    setCheckResult(null)
  }

  function updateCellBounds(
    variableId: string,
    code: string,
    patch: { min_value?: number | null; max_value?: number | null },
  ) {
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.variable_id !== variableId
          ? f
          : {
              ...f,
              cells: f.cells.map((c) => (c.code === code ? { ...c, ...patch } : c)),
            },
      ),
    }))
    setCheckResult(null)
  }

  function addLayer() {
    const id = `layer_${Date.now()}`
    setConfig((prev) => ({
      ...prev,
      layers: [
        ...(prev.layers ?? []),
        { id, name: 'New layer', variable_ids: [], quota_type: 'count', cells: [] },
      ],
    }))
    setCheckResult(null)
  }

  function removeLayer(layerId: string) {
    setConfig((prev) => ({
      ...prev,
      layers: (prev.layers ?? []).filter((l) => l.id !== layerId),
    }))
    setCheckResult(null)
  }

  function updateLayer(layerId: string, patch: Partial<QuotaLayerConfig>) {
    setConfig((prev) => ({
      ...prev,
      layers: (prev.layers ?? []).map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    }))
    setCheckResult(null)
  }

  function generateCellsForLayer(layerId: string) {
    const layer = (config.layers ?? []).find((l) => l.id === layerId)
    if (!layer || layer.variable_ids.length < 2) return
    const cells = generateLayerCells(layer.variable_ids, varMap)
    if (!cells.length) {
      setError('Too many combinations — pick fewer variables or options.')
      return
    }
    updateLayer(layerId, { cells })
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={28} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--canvas-subtle)] p-4 sm:p-6 et-scroll">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="et-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList size={20} className="text-[var(--et-teal)]" />
                <h2 className="et-section-title">Field quotas</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Set interview targets per answer option, then check progress against completed or QC-approved responses.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium text-slate-700">Check using</span>
                <select
                  value={checkBasis}
                  onChange={(e) => {
                    setCheckBasis(e.target.value as 'complete' | 'qc_approved')
                    setCheckResult(null)
                  }}
                  className="et-select text-sm"
                >
                  <option value="complete">Completed</option>
                  <option value="qc_approved">QC approved</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || checking}
                className="et-btn-secondary inline-flex items-center gap-1.5 text-sm"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
              <button
                type="button"
                onClick={() => void handleCheck()}
                disabled={checking || saving || config.fields.length === 0}
                className="et-btn-primary inline-flex items-center gap-1.5 text-sm"
              >
                {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Check quotas
              </button>
            </div>
          </div>

          {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
          {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

          {checkResult && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <span className="font-medium text-slate-800">
                {checkResult.total_completes.toLocaleString()} responses checked
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                {checkResult.summary.fields_ok + checkResult.summary.layers_ok} met
              </span>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                {checkResult.summary.fields_under + checkResult.summary.layers_under} under
              </span>
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                {checkResult.summary.fields_over + checkResult.summary.layers_over} over
              </span>
              <span className="text-xs text-slate-500">
                {new Date(checkResult.checked_at).toLocaleString()}
              </span>
            </div>
          )}

          <label className="mt-4 block max-w-md text-sm">
            <span className="mb-1 block font-medium text-slate-700">Interviewer variable (field reports)</span>
            <select
              value={config.interviewer_variable_id ?? ''}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  interviewer_variable_id: e.target.value || null,
                }))
              }
              className="et-select w-full text-sm"
            >
              <option value="">None</option>
              {variables
                .filter((v) => v.kind === 'single' || v.kind === 'text')
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} — {(v.text || v.code).slice(0, 40)}
                  </option>
                ))}
            </select>
          </label>
        </header>

        <section className="et-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Quota questions</h3>
            <select
              value=""
              disabled={available.length === 0}
              onChange={(e) => {
                if (e.target.value) addField(e.target.value)
                e.target.value = ''
              }}
              className="et-select text-sm"
            >
              <option value="">{available.length ? '+ Add quota question' : 'No more questions'}</option>
              {available.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} — {(v.text || v.code).slice(0, 48)}
                </option>
              ))}
            </select>
          </div>

          {eligible.length === 0 && (
            <p className="mt-4 text-sm text-amber-800">
              No single-choice questions with answer options are loaded yet. Open Explore and wait for the survey to finish loading, then return here.
            </p>
          )}

          {config.fields.length === 0 && eligible.length > 0 && (
            <p className="mt-4 text-sm text-slate-500">
              Choose a question above to set targets for each answer option (e.g. gender, age band, city).
            </p>
          )}

          <div className="mt-4 space-y-4">
            {config.fields.map((field) => {
              const variable = varMap.get(field.variable_id)
              if (!variable) return null
              const check = resultByField.get(field.variable_id)
              return (
                <QuotaFieldCard
                  key={field.variable_id}
                  field={field}
                  variable={variable}
                  check={check}
                  onRemove={() => removeField(field.variable_id)}
                  onQuotaTypeChange={(quota_type) => updateField(field.variable_id, { quota_type })}
                  onTargetChange={(code, target) => updateTarget(field.variable_id, code, target)}
                  onBoundsChange={(code, patch) => updateCellBounds(field.variable_id, code, patch)}
                />
              )
            })}
          </div>
        </section>

        <section className="et-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Layered quotas</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Cross variables (e.g. region × age) with combined cell targets.
              </p>
            </div>
            <button type="button" onClick={addLayer} className="et-btn-secondary text-sm">
              + Add layer
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {(config.layers ?? []).map((layer) => (
              <QuotaLayerCard
                key={layer.id}
                layer={layer}
                eligible={eligible}
                check={resultByLayer.get(layer.id)}
                onRemove={() => removeLayer(layer.id)}
                onChange={(patch) => updateLayer(layer.id, patch)}
                onGenerate={() => generateCellsForLayer(layer.id)}
                cellLabel={(codes) => layerCellLabel(codes, varMap)}
              />
            ))}
            {(config.layers ?? []).length === 0 && (
              <p className="text-sm text-slate-500">No layered quotas yet.</p>
            )}
          </div>
        </section>

        <section className="et-panel p-5">
          <h3 className="text-sm font-semibold text-slate-900">Reports</h3>
          <p className="mt-1 text-sm text-slate-500">Download CSV summaries to share with the field team.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportCsv('quota')}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exporting === 'quota' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Quota completion
            </button>
            <button
              type="button"
              onClick={() => void exportCsv('qc')}
              disabled={exporting !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {exporting === 'qc' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              QC summary
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function QuotaFieldCard({
  field,
  variable,
  check,
  onRemove,
  onQuotaTypeChange,
  onTargetChange,
  onBoundsChange,
}: {
  field: QuotaFieldConfig
  variable: SurveyVariable
  check?: QuotaCheckField
  onRemove: () => void
  onQuotaTypeChange: (t: 'count' | 'percent') => void
  onTargetChange: (code: string, target: number) => void
  onBoundsChange: (code: string, patch: { min_value?: number | null; max_value?: number | null }) => void
}) {
  const checkCells = new Map((check?.cells ?? []).map((c) => [c.code ?? '', c]))
  const isPercent = field.quota_type === 'percent'

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="min-w-0">
          <h4 className="font-semibold text-slate-900">{variable.text || variable.code}</h4>
          <p className="text-xs text-slate-500">
            {variable.code} · {variable.type_label}
            {check && (
              <span className="ml-2">
                · <StatusBadge status={check.status} />
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={field.quota_type}
            onChange={(e) => onQuotaTypeChange(e.target.value as 'count' | 'percent')}
            className="et-select text-xs"
          >
            <option value="count">Count targets</option>
            <option value="percent">Percent targets</option>
          </select>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-600"
            title="Remove quota"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Answer</th>
              <th className="px-4 py-2.5 w-28">Target {isPercent ? '%' : '#'}</th>
              <th className="px-4 py-2.5 w-20">Min</th>
              <th className="px-4 py-2.5 w-20">Max</th>
              {check && (
                <>
                  <th className="px-4 py-2.5 w-24">Actual</th>
                  <th className="px-4 py-2.5 w-20">Gap</th>
                  <th className="px-4 py-2.5 w-24">Status</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {field.cells.map((cell) => {
              const opt = variable.answer_options?.find((o) => o.code === cell.code)
              const checked = checkCells.get(cell.code)
              return (
                <tr key={cell.code}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{opt?.label || cell.code}</div>
                    <div className="text-[10px] text-slate-400">{cell.code}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min={0}
                      step={isPercent ? 0.1 : 1}
                      value={cell.target || ''}
                      onChange={(e) => onTargetChange(cell.code, Number(e.target.value) || 0)}
                      className="w-full max-w-[5.5rem] rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      value={cell.min_value ?? ''}
                      onChange={(e) =>
                        onBoundsChange(cell.code, {
                          min_value: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="w-full max-w-[4rem] rounded-lg border border-slate-200 px-2 py-1 text-xs tabular-nums"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      value={cell.max_value ?? ''}
                      onChange={(e) =>
                        onBoundsChange(cell.code, {
                          max_value: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="w-full max-w-[4rem] rounded-lg border border-slate-200 px-2 py-1 text-xs tabular-nums"
                    />
                  </td>
                  {check && (
                    <>
                      <td className="px-4 py-2.5 tabular-nums text-slate-800">
                        {checked
                          ? isPercent
                            ? `${checked.actual_pct}% (${checked.actual})`
                            : `${checked.actual} (${checked.actual_pct}%)`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">
                        {checked ? (checked.gap > 0 ? `+${checked.gap}` : checked.gap) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {checked ? <StatusBadge status={checked.status} /> : '—'}
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {check?.error && (
        <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">{check.error}</p>
      )}
    </article>
  )
}

function QuotaLayerCard({
  layer,
  eligible,
  check,
  onRemove,
  onChange,
  onGenerate,
  cellLabel,
}: {
  layer: QuotaLayerConfig
  eligible: SurveyVariable[]
  check?: QuotaCheckLayer
  onRemove: () => void
  onChange: (patch: Partial<QuotaLayerConfig>) => void
  onGenerate: () => void
  cellLabel: (codes: Record<string, string>) => string
}) {
  const selectedSet = new Set(layer.variable_ids)
  const checkCells = new Map(
    (check?.cells ?? []).map((c) => [
      JSON.stringify(c.codes ?? {}),
      c,
    ]),
  )

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <input
          type="text"
          value={layer.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="et-input max-w-xs text-sm font-semibold"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={layer.quota_type}
            onChange={(e) => onChange({ quota_type: e.target.value as 'count' | 'percent' })}
            className="et-select text-xs"
          >
            <option value="count">Count</option>
            <option value="percent">Percent</option>
          </select>
          <button type="button" onClick={onGenerate} className="et-btn-secondary text-xs">
            Generate cells
          </button>
          <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="mb-2 text-xs font-medium text-slate-600">Variables (pick 2+)</p>
        <div className="flex flex-wrap gap-2">
          {eligible.map((v) => (
            <label key={v.id} className="inline-flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={selectedSet.has(v.id)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...layer.variable_ids, v.id]
                    : layer.variable_ids.filter((id) => id !== v.id)
                  onChange({ variable_ids: next, cells: [] })
                }}
              />
              {v.code}
            </label>
          ))}
        </div>
        {check && (
          <p className="mt-2 text-xs text-slate-500">
            Status: <StatusBadge status={check.status} />
          </p>
        )}
      </div>

      {layer.cells.length > 0 && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Cell</th>
                <th className="px-4 py-2 w-24">Target</th>
                {check && (
                  <>
                    <th className="px-4 py-2 w-24">Actual</th>
                    <th className="px-4 py-2 w-20">Status</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {layer.cells.map((cell, idx) => {
                const key = JSON.stringify(cell.codes)
                const checked = checkCells.get(key)
                return (
                  <tr key={idx}>
                    <td className="px-4 py-2 text-xs text-slate-800">{cellLabel(cell.codes)}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        value={cell.target || ''}
                        onChange={(e) => {
                          const target = Number(e.target.value) || 0
                          const cells = layer.cells.map((c, i) =>
                            i === idx ? { ...c, target } : c,
                          )
                          onChange({ cells })
                        }}
                        className="w-20 rounded border border-slate-200 px-2 py-1 text-xs"
                      />
                    </td>
                    {check && (
                      <>
                        <td className="px-4 py-2 tabular-nums text-xs">{checked?.actual ?? '—'}</td>
                        <td className="px-4 py-2">
                          {checked ? <StatusBadge status={checked.status} /> : '—'}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}
