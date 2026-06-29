import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Layers,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Target,
  X,
  XCircle,
} from 'lucide-react'
import {
  api,
  type QuotaCheckResult,
  type QuotaConfig,
  type QuotaFieldConfig,
  type QuotaLayerCellTarget,
  type QuotaLayerConfig,
  type SurveyVariable,
} from '../../api/client'
import { ErrorState } from '../States'

interface Props {
  surveyId: number
  variables: SurveyVariable[]
}

type Selection =
  | { kind: 'field'; id: string }
  | { kind: 'layer'; id: string }

function eligibleForQuota(v: SurveyVariable): boolean {
  return v.kind === 'single' && (v.answer_options?.length ?? 0) > 0
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

function statusTone(status: string): string {
  if (status === 'met') return 'text-emerald-700 bg-emerald-50 ring-emerald-200'
  if (status === 'under') return 'text-amber-800 bg-amber-50 ring-amber-200'
  if (status === 'over') return 'text-rose-800 bg-rose-50 ring-rose-200'
  if (status === 'mixed') return 'text-violet-800 bg-violet-50 ring-violet-200'
  return 'text-slate-600 bg-slate-50 ring-slate-200'
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'met') return <CheckCircle2 size={14} className="text-emerald-600" />
  if (status === 'under' || status === 'mixed') return <AlertTriangle size={14} className="text-amber-600" />
  if (status === 'over') return <XCircle size={14} className="text-rose-600" />
  return <Minus size={14} className="text-slate-400" />
}

function buildFieldFromVariable(v: SurveyVariable): QuotaFieldConfig {
  return {
    variable_id: v.id,
    quota_type: 'count',
    cells: (v.answer_options ?? []).map((o) => ({
      code: o.code,
      target: 0,
      min_value: null,
      max_value: null,
    })),
  }
}

function cartesian<T>(arrays: T[][]): T[][] {
  if (!arrays.length) return []
  return arrays.reduce<T[][]>(
    (acc, curr) => acc.flatMap((prefix) => curr.map((item) => [...prefix, item])),
    [[]],
  )
}

function layerCellKey(variableIds: string[], codes: Record<string, string>): string {
  return variableIds.map((id) => `${id}:${codes[id] ?? ''}`).join('|')
}

function generateLayerCells(
  layer: QuotaLayerConfig,
  varMap: Map<string, SurveyVariable>,
): QuotaLayerCellTarget[] {
  const optionLists = layer.variable_ids.map((id) =>
    (varMap.get(id)?.answer_options ?? []).map((o) => o.code),
  )
  if (optionLists.length < 2 || optionLists.some((opts) => opts.length === 0)) return []
  return cartesian(optionLists).map((combo) => {
    const codes: Record<string, string> = {}
    layer.variable_ids.forEach((id, i) => {
      codes[id] = combo[i]
    })
    return { codes, target: 0, min_value: null, max_value: null }
  })
}

function newLayerId(): string {
  return `layer_${Date.now().toString(36)}`
}

export function FieldManagementPanel({ surveyId, variables }: Props) {
  const [config, setConfig] = useState<QuotaConfig>(emptyConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [checkResult, setCheckResult] = useState<QuotaCheckResult | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [checkBasis, setCheckBasis] = useState<'complete' | 'qc_approved'>('complete')

  const eligible = useMemo(() => variables.filter(eligibleForQuota), [variables])
  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getQuotaConfig(surveyId)
      const normalized = { ...emptyConfig(), ...data, layers: data.layers ?? [] }
      setConfig(normalized)
      setCheckBasis(data.basis)
      setSelection((prev) => {
        if (prev) return prev
        if (normalized.layers[0]) return { kind: 'layer', id: normalized.layers[0].id }
        if (normalized.fields[0]) return { kind: 'field', id: normalized.fields[0].variable_id }
        return null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quota config')
    } finally {
      setLoading(false)
    }
  }, [surveyId])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const selectedField = useMemo(
    () =>
      selection?.kind === 'field'
        ? config.fields.find((f) => f.variable_id === selection.id) ?? null
        : null,
    [config.fields, selection],
  )

  const selectedLayer = useMemo(
    () =>
      selection?.kind === 'layer' ? config.layers.find((l) => l.id === selection.id) ?? null : null,
    [config.layers, selection],
  )

  const selectedVar = selectedField ? varMap.get(selectedField.variable_id) : null

  const checkFieldResult = useMemo(
    () =>
      selection?.kind === 'field'
        ? checkResult?.fields.find((f) => f.variable_id === selection.id) ?? null
        : null,
    [checkResult, selection],
  )

  const checkLayerResult = useMemo(
    () =>
      selection?.kind === 'layer'
        ? checkResult?.layers.find((l) => l.id === selection.id) ?? null
        : null,
    [checkResult, selection],
  )

  const hasQuotas = config.fields.length > 0 || config.layers.length > 0

  async function handleSave() {
    setSaving(true)
    setSaveMessage(null)
    try {
      const saved = await api.setQuotaConfig(surveyId, config)
      setConfig({ ...saved, layers: saved.layers ?? [] })
      setSaveMessage('Quota settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleCheck() {
    setChecking(true)
    setError(null)
    try {
      const result = await api.checkQuotas(surveyId, checkBasis)
      setCheckResult({ ...result, layers: result.layers ?? [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quota check failed')
    } finally {
      setChecking(false)
    }
  }

  function addField(variableId: string) {
    const v = varMap.get(variableId)
    if (!v || config.fields.some((f) => f.variable_id === variableId)) return
    setConfig((prev) => ({ ...prev, fields: [...prev.fields, buildFieldFromVariable(v)] }))
    setSelection({ kind: 'field', id: variableId })
  }

  function removeField(variableId: string) {
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.variable_id !== variableId),
    }))
    if (selection?.kind === 'field' && selection.id === variableId) {
      setSelection(null)
    }
  }

  function addLayer() {
    const layer: QuotaLayerConfig = {
      id: newLayerId(),
      name: '',
      variable_ids: [],
      quota_type: 'count',
      cells: [],
    }
    setConfig((prev) => ({ ...prev, layers: [...prev.layers, layer] }))
    setSelection({ kind: 'layer', id: layer.id })
  }

  function removeLayer(layerId: string) {
    setConfig((prev) => ({ ...prev, layers: prev.layers.filter((l) => l.id !== layerId) }))
    if (selection?.kind === 'layer' && selection.id === layerId) setSelection(null)
  }

  function updateLayer(layerId: string, patch: Partial<QuotaLayerConfig>) {
    setConfig((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
    }))
  }

  function updateSelectedField(patch: Partial<QuotaFieldConfig>) {
    if (!selectedField) return
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.variable_id === selectedField.variable_id ? { ...f, ...patch } : f,
      ),
    }))
  }

  function updateFieldCell(code: string, patch: Partial<QuotaFieldConfig['cells'][0]>) {
    if (!selectedField) return
    updateSelectedField({
      cells: selectedField.cells.map((c) => (c.code === code ? { ...c, ...patch } : c)),
    })
  }

  function updateLayerCell(
    cellKey: string,
    patch: Partial<QuotaLayerCellTarget>,
    layer: QuotaLayerConfig,
  ) {
    updateLayer(layer.id, {
      cells: layer.cells.map((c) =>
        layerCellKey(layer.variable_ids, c.codes) === cellKey ? { ...c, ...patch } : c,
      ),
    })
  }

  function addVariableToLayer(layerId: string, variableId: string) {
    const layer = config.layers.find((l) => l.id === layerId)
    if (!layer || layer.variable_ids.includes(variableId)) return
    const nextIds = [...layer.variable_ids, variableId]
    const nextLayer = { ...layer, variable_ids: nextIds, cells: [] }
    updateLayer(layerId, {
      variable_ids: nextIds,
      cells: nextIds.length >= 2 ? generateLayerCells(nextLayer, varMap) : [],
      name: nextIds.map((id) => varMap.get(id)?.code || id).join(' × '),
    })
  }

  function removeVariableFromLayer(layerId: string, variableId: string) {
    const layer = config.layers.find((l) => l.id === layerId)
    if (!layer) return
    const nextIds = layer.variable_ids.filter((id) => id !== variableId)
    const nextLayer = { ...layer, variable_ids: nextIds, cells: [] }
    updateLayer(layerId, {
      variable_ids: nextIds,
      cells: nextIds.length >= 2 ? generateLayerCells(nextLayer, varMap) : [],
      name: nextIds.map((id) => varMap.get(id)?.code || id).join(' × '),
    })
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={28} />
      </div>
    )
  }

  if (error && !hasQuotas && !checkResult) {
    return <ErrorState message={error} />
  }

  const usedFieldIds = new Set(config.fields.map((f) => f.variable_id))

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--canvas-subtle)] p-6 et-scroll">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="et-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList size={20} className="text-[var(--et-teal)]" />
                <h2 className="et-section-title">Field quotas</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Set single-field targets or layered interlocking quotas (e.g. gender × age). Check against
                completed or QC-approved responses.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleSave} disabled={saving} className="et-btn-secondary inline-flex items-center gap-1.5 text-sm">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
              <button
                type="button"
                onClick={handleCheck}
                disabled={checking || !hasQuotas}
                className="et-btn-primary inline-flex items-center gap-1.5 text-sm"
              >
                {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Check quotas
              </button>
            </div>
          </div>

          {saveMessage && <p className="mt-3 text-sm text-emerald-700">{saveMessage}</p>}
          {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Default check basis</span>
              <select
                value={config.basis}
                onChange={(e) => setConfig((c) => ({ ...c, basis: e.target.value as QuotaConfig['basis'] }))}
                className="et-select"
              >
                <option value="complete">Completed responses</option>
                <option value="qc_approved">QC approved</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Count tolerance (±)</span>
              <input
                type="number"
                min={0}
                value={config.tolerance_count}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, tolerance_count: Math.max(0, Number(e.target.value) || 0) }))
                }
                className="et-input w-24"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Percent tolerance (±)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={config.tolerance_pct}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, tolerance_pct: Math.max(0, Number(e.target.value) || 0) }))
                }
                className="et-input w-24"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Check using</span>
              <select
                value={checkBasis}
                onChange={(e) => setCheckBasis(e.target.value as 'complete' | 'qc_approved')}
                className="et-select"
              >
                <option value="complete">Completed responses</option>
                <option value="qc_approved">QC approved</option>
              </select>
            </label>
          </div>
        </div>

        {checkResult && (
          <div className="et-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Quota check results</h3>
                <p className="text-xs text-slate-500">
                  {checkResult.total_completes.toLocaleString()} responses ·{' '}
                  {checkResult.basis === 'qc_approved' ? 'QC approved' : 'completed'} ·{' '}
                  {new Date(checkResult.checked_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 ring-1 ring-emerald-200">
                  {(checkResult.summary.fields_ok ?? 0) + (checkResult.summary.layers_ok ?? 0)} met
                </span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800 ring-1 ring-amber-200">
                  {(checkResult.summary.fields_under ?? 0) + (checkResult.summary.layers_under ?? 0)} under
                </span>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-800 ring-1 ring-rose-200">
                  {(checkResult.summary.fields_over ?? 0) + (checkResult.summary.layers_over ?? 0)} over
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <section className="et-panel space-y-4 p-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Single fields</h3>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addField(e.target.value)
                    e.target.value = ''
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
                >
                  <option value="">+ Add</option>
                  {eligible
                    .filter((v) => !usedFieldIds.has(v.id))
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {(v.code || v.text).slice(0, 32)}
                      </option>
                    ))}
                </select>
              </div>
              {config.fields.length === 0 ? (
                <p className="text-xs text-slate-500">Independent quotas per question.</p>
              ) : (
                <ul className="space-y-1">
                  {config.fields.map((f) => {
                    const v = varMap.get(f.variable_id)
                    const result = checkResult?.fields.find((r) => r.variable_id === f.variable_id)
                    const active = selection?.kind === 'field' && selection.id === f.variable_id
                    return (
                      <li key={f.variable_id}>
                        <button
                          type="button"
                          onClick={() => setSelection({ kind: 'field', id: f.variable_id })}
                          className={`flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                            active ? 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="line-clamp-2 font-medium">{v?.text || v?.code}</span>
                          {result && (
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${statusTone(result.status)}`}>
                              {result.status}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Layers size={12} />
                  Layered quotas
                </h3>
                <button
                  type="button"
                  onClick={addLayer}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)]"
                >
                  <Plus size={12} />
                  Add layer
                </button>
              </div>
              {config.layers.length === 0 ? (
                <p className="text-xs text-slate-500">Cross two or more fields (e.g. age × gender).</p>
              ) : (
                <ul className="space-y-1">
                  {config.layers.map((layer, idx) => {
                    const result = checkResult?.layers.find((r) => r.id === layer.id)
                    const active = selection?.kind === 'layer' && selection.id === layer.id
                    return (
                      <li key={layer.id}>
                        <button
                          type="button"
                          onClick={() => setSelection({ kind: 'layer', id: layer.id })}
                          className={`flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                            active ? 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block font-medium">Layer {idx + 1}</span>
                            <span className="mt-0.5 block truncate text-[10px] opacity-70">
                              {layer.name || layer.variable_ids.map((id) => varMap.get(id)?.code).filter(Boolean).join(' × ') || 'Pick fields…'}
                            </span>
                          </span>
                          {result && (
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${statusTone(result.status)}`}>
                              {result.status}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="et-panel p-5">
            {selectedField && selectedVar && (
              <FieldQuotaEditor
                field={selectedField}
                variable={selectedVar}
                checkResult={checkFieldResult}
                onRemove={() => removeField(selectedField.variable_id)}
                onUpdateField={updateSelectedField}
                onUpdateCell={updateFieldCell}
              />
            )}

            {selectedLayer && (
              <LayerQuotaEditor
                layer={selectedLayer}
                eligible={eligible}
                varMap={varMap}
                checkResult={checkLayerResult}
                onRemove={() => removeLayer(selectedLayer.id)}
                onUpdateLayer={(patch) => updateLayer(selectedLayer.id, patch)}
                onAddVariable={(vid) => addVariableToLayer(selectedLayer.id, vid)}
                onRemoveVariable={(vid) => removeVariableFromLayer(selectedLayer.id, vid)}
                onUpdateCell={(key, patch) => updateLayerCell(key, patch, selectedLayer)}
                onRegenerate={() =>
                  updateLayer(selectedLayer.id, {
                    cells: generateLayerCells(selectedLayer, varMap),
                  })
                }
              />
            )}

            {!selectedField && !selectedLayer && (
              <p className="text-sm text-slate-500">Select a single-field quota or layered quota to configure targets.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function FieldQuotaEditor({
  field,
  variable,
  checkResult,
  onRemove,
  onUpdateField,
  onUpdateCell,
}: {
  field: QuotaFieldConfig
  variable: SurveyVariable
  checkResult: QuotaCheckResult['fields'][0] | null
  onRemove: () => void
  onUpdateField: (patch: Partial<QuotaFieldConfig>) => void
  onUpdateCell: (code: string, patch: Partial<QuotaFieldConfig['cells'][0]>) => void
}) {
  return (
    <div className="space-y-4">
      <QuotaEditorHeader
        title={variable.text || variable.code}
        subtitle={`${variable.code} · ${variable.type_label}`}
        quotaType={field.quota_type}
        onQuotaTypeChange={(quota_type) => onUpdateField({ quota_type })}
        onRemove={onRemove}
      />
      <QuotaCellsTable
        quotaType={field.quota_type}
        rows={field.cells.map((cell) => {
          const opt = variable.answer_options?.find((o) => o.code === cell.code)
          const checked = checkResult?.cells.find((c) => c.code === cell.code)
          return {
            key: cell.code,
            label: opt?.label || cell.code,
            sublabel: cell.code,
            target: cell.target,
            min_value: cell.min_value,
            max_value: cell.max_value,
            checked,
            onTarget: (v) => onUpdateCell(cell.code, { target: v }),
            onMin: (v) => onUpdateCell(cell.code, { min_value: v }),
            onMax: (v) => onUpdateCell(cell.code, { max_value: v }),
          }
        })}
        hasCheck={Boolean(checkResult)}
      />
    </div>
  )
}

function LayerQuotaEditor({
  layer,
  eligible,
  varMap,
  checkResult,
  onRemove,
  onUpdateLayer,
  onAddVariable,
  onRemoveVariable,
  onUpdateCell,
  onRegenerate,
}: {
  layer: QuotaLayerConfig
  eligible: SurveyVariable[]
  varMap: Map<string, SurveyVariable>
  checkResult: QuotaCheckResult['layers'][0] | null | undefined
  onRemove: () => void
  onUpdateLayer: (patch: Partial<QuotaLayerConfig>) => void
  onAddVariable: (id: string) => void
  onRemoveVariable: (id: string) => void
  onUpdateCell: (key: string, patch: Partial<QuotaLayerCellTarget>) => void
  onRegenerate: () => void
}) {
  const unused = eligible.filter((v) => !layer.variable_ids.includes(v.id))

  return (
    <div className="space-y-4">
      <QuotaEditorHeader
        title={layer.name || 'Layered quota'}
        subtitle="Interlocking cells across multiple fields"
        quotaType={layer.quota_type}
        onQuotaTypeChange={(quota_type) => onUpdateLayer({ quota_type })}
        onRemove={onRemove}
      />

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-700">Quota fields in this layer</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {layer.variable_ids.map((id) => {
            const v = varMap.get(id)
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
              >
                {v?.code || id}
                <button type="button" onClick={() => onRemoveVariable(id)} className="text-slate-400 hover:text-rose-600">
                  <X size={12} />
                </button>
              </span>
            )
          })}
          {unused.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onAddVariable(e.target.value)
                e.target.value = ''
              }}
              className="rounded-full border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
            >
              <option value="">+ Add field</option>
              {unused.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code}
                </option>
              ))}
            </select>
          )}
        </div>
        {layer.variable_ids.length < 2 && (
          <p className="mt-2 text-xs text-amber-700">Add at least two fields to build interlocking quota cells.</p>
        )}
        {layer.variable_ids.length >= 2 && (
          <button
            type="button"
            onClick={onRegenerate}
            className="mt-2 text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
          >
            Regenerate all cell combinations
          </button>
        )}
      </div>

      {layer.cells.length > 0 && (
        <QuotaCellsTable
          quotaType={layer.quota_type}
          rows={layer.cells.map((cell) => {
            const key = layerCellKey(layer.variable_ids, cell.codes)
            const checked = checkResult?.cells.find(
              (c) => layerCellKey(layer.variable_ids, c.codes ?? {}) === key,
            )
            const label = layer.variable_ids
              .map((id) => {
                const v = varMap.get(id)
                const code = cell.codes[id]
                const opt = v?.answer_options?.find((o) => o.code === code)
                return opt?.label || code
              })
              .join(' · ')
            return {
              key,
              label,
              sublabel: layer.variable_ids.map((id) => cell.codes[id]).join(' / '),
              target: cell.target,
              min_value: cell.min_value,
              max_value: cell.max_value,
              checked,
              onTarget: (v) => onUpdateCell(key, { target: v }),
              onMin: (v) => onUpdateCell(key, { min_value: v }),
              onMax: (v) => onUpdateCell(key, { max_value: v }),
            }
          })}
          hasCheck={Boolean(checkResult)}
        />
      )}
    </div>
  )
}

function QuotaEditorHeader({
  title,
  subtitle,
  quotaType,
  onQuotaTypeChange,
  onRemove,
}: {
  title: string
  subtitle: string
  quotaType: 'count' | 'percent'
  onQuotaTypeChange: (t: 'count' | 'percent') => void
  onRemove: () => void
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <Target size={16} className="text-[var(--et-teal)]" />
          <h3 className="font-semibold text-slate-900">{title}</h3>
        </div>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <select value={quotaType} onChange={(e) => onQuotaTypeChange(e.target.value as 'count' | 'percent')} className="et-select text-sm">
          <option value="count">Count targets</option>
          <option value="percent">Percent targets</option>
        </select>
        <button type="button" onClick={onRemove} className="rounded-lg px-2 py-1.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50">
          Remove
        </button>
      </div>
    </div>
  )
}

function QuotaCellsTable({
  quotaType,
  rows,
  hasCheck,
}: {
  quotaType: 'count' | 'percent'
  rows: {
    key: string
    label: string
    sublabel: string
    target: number
    min_value?: number | null
    max_value?: number | null
    checked?: QuotaCheckResult['fields'][0]['cells'][0]
    onTarget: (v: number) => void
    onMin: (v: number | null) => void
    onMax: (v: number | null) => void
  }[]
  hasCheck: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Cell</th>
            <th className="px-3 py-2">Target {quotaType === 'percent' ? '%' : '#'}</th>
            <th className="px-3 py-2">Min</th>
            <th className="px-3 py-2">Max</th>
            {hasCheck && (
              <>
                <th className="px-3 py-2">Actual</th>
                <th className="px-3 py-2">Gap</th>
                <th className="px-3 py-2">Status</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-2">
                <div className="font-medium text-slate-800">{row.label}</div>
                <div className="text-[10px] text-slate-400">{row.sublabel}</div>
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  min={0}
                  step={quotaType === 'percent' ? 0.1 : 1}
                  value={row.target || ''}
                  onChange={(e) => row.onTarget(Number(e.target.value) || 0)}
                  className="w-20 rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  min={0}
                  value={row.min_value ?? ''}
                  onChange={(e) => row.onMin(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-16 rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  min={0}
                  value={row.max_value ?? ''}
                  onChange={(e) => row.onMax(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-16 rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </td>
              {hasCheck && row.checked && (
                <>
                  <td className="px-3 py-2 tabular-nums text-slate-800">
                    {quotaType === 'percent' ? `${row.checked.actual_pct}% (${row.checked.actual})` : row.checked.actual}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-600">
                    {row.checked.gap > 0 ? `+${row.checked.gap}` : row.checked.gap}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusTone(row.checked.status)}`}>
                      <StatusIcon status={row.checked.status} />
                      {row.checked.status}
                    </span>
                  </td>
                </>
              )}
              {hasCheck && !row.checked && (
                <>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2">—</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
