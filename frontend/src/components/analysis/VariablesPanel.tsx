import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Eye,
  Layers,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import {
  api,
  type CustomVariable,
  type CustomVariableInput,
  type CustomVariablePreview,
  type CustomVariableType,
  type SurveySchema,
  type SurveyVariable,
} from '../../api/client'
import {
  loadCustomVariableBackup,
  saveCustomVariableBackup,
} from '../../lib/customVariableBackup'
import { EmptyState, ErrorState } from '../States'
import { QuestionSetupPanel, buildVariableFormFromSource } from './QuestionSetupPanel'
import { WeightingPanel } from './WeightingPanel'

interface Props {
  surveyId: number
  schema: SurveySchema | null
  completionStatus: string
  username?: string | null
  focusQuestionId?: string | null
  onFocusQuestionConsumed?: () => void
  onChanged?: () => void
}

const EMPTY_FORM: CustomVariableInput = {
  name: '',
  code: '',
  variable_type: 'recode',
  source_variable_id: '',
  source_variable_ids: [],
  categories: [{ label: 'Category 1', source_values: [] }],
  include_unmapped: true,
  unmapped_label: 'Other',
  tracked_codes: [],
  top_codes: [],
  bottom_codes: [],
}

const TYPE_OPTIONS: { value: CustomVariableType; label: string; hint: string }[] = [
  {
    value: 'recode',
    label: 'Recode',
    hint: 'Group answer codes into new categories',
  },
  {
    value: 'combine',
    label: 'Net similar questions',
    hint: 'Combine questions with the same codes (e.g. TOM + spontaneous + aided = total awareness)',
  },
  {
    value: 'net_score',
    label: 'Net responses',
    hint: 'Top-box minus bottom-box score on a scale question',
  },
]

function sharedCodesFromVariables(variables: SurveyVariable[], ids: string[]): string[] {
  const selected = variables.filter((v) => ids.includes(v.id))
  if (selected.length < 2) return []

  const codeSets = selected.map((v) => {
    const codes = new Set<string>()
    for (const sq of v.subquestions ?? []) {
      if (sq.code) codes.add(sq.code)
    }
    for (const opt of v.answer_options ?? []) {
      if (opt.code) codes.add(opt.code)
    }
    return codes
  })

  let shared = codeSets[0] ?? new Set<string>()
  for (let i = 1; i < codeSets.length; i += 1) {
    shared = new Set([...shared].filter((c) => codeSets[i].has(c)))
  }
  return [...shared].sort()
}

function optionsForVariable(v: SurveyVariable): { code: string; label: string }[] {
  if (v.answer_options?.length) {
    return v.answer_options.map((o) => ({ code: o.code, label: o.label || o.code }))
  }
  if (v.subquestions?.length) {
    return v.subquestions.map((sq) => ({ code: sq.code, label: sq.label || sq.code }))
  }
  return []
}

function labelForTrackedCode(variables: SurveyVariable[], sourceIds: string[], code: string): string {
  for (const id of sourceIds) {
    const v = variables.find((x) => x.id === id)
    if (!v) continue
    for (const opt of optionsForVariable(v)) {
      if (opt.code === code && opt.label && opt.label !== code) return opt.label
    }
  }
  for (const id of sourceIds) {
    const v = variables.find((x) => x.id === id)
    if (!v) continue
    for (const opt of optionsForVariable(v)) {
      if (opt.code === code && opt.label) return opt.label
    }
  }
  return code
}

function typeLabel(v: CustomVariable): string {
  if (v.variable_type === 'combine') return 'Combined'
  if (v.variable_type === 'net_score') return 'Net score'
  return 'Recode'
}

export function VariablesPanel({
  surveyId,
  schema,
  completionStatus,
  username,
  focusQuestionId,
  onFocusQuestionConsumed,
  onChanged,
}: Props) {
  const [pageTab, setPageTab] = useState<'questions' | 'custom' | 'weighting'>('questions')
  const [variables, setVariables] = useState<CustomVariable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CustomVariable | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CustomVariableInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<CustomVariablePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let { variables: rows } = await api.getCustomVariables(surveyId)
      if (username) {
        const backup = loadCustomVariableBackup(username, surveyId)
        if (backup?.length && backup.length > rows.length) {
          const synced = await api.syncCustomVariables(surveyId, backup)
          rows = synced.variables
        }
        saveCustomVariableBackup(username, surveyId, rows)
      }
      setVariables(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load variables')
    } finally {
      setLoading(false)
    }
  }, [surveyId, username])

  useEffect(() => {
    load()
  }, [load])

  const allCandidates = useMemo(
    () =>
      (schema?.variables ?? []).filter((v) =>
        ['single', 'multi', 'numeric', 'array'].includes(v.kind),
      ),
    [schema],
  )

  const combineCandidates = useMemo(
    () => allCandidates.filter((v) => ['single', 'multi'].includes(v.kind)),
    [allCandidates],
  )

  const netCandidates = useMemo(
    () => allCandidates.filter((v) => ['single', 'numeric', 'array'].includes(v.kind)),
    [allCandidates],
  )

  const sourceVar = useMemo(
    () => allCandidates.find((v) => v.id === form.source_variable_id) ?? null,
    [allCandidates, form.source_variable_id],
  )

  const sourceOptions = useMemo(() => (sourceVar ? optionsForVariable(sourceVar) : []), [sourceVar])

  const inferredSharedCodes = useMemo(
    () => sharedCodesFromVariables(combineCandidates, form.source_variable_ids),
    [combineCandidates, form.source_variable_ids],
  )

  const trackedOptions = useMemo(() => {
    const sourceIds = form.source_variable_ids
    if (inferredSharedCodes.length > 0) {
      return inferredSharedCodes.map((code) => ({
        code,
        label: labelForTrackedCode(combineCandidates, sourceIds, code),
      }))
    }
    const codes = new Set<string>()
    for (const id of sourceIds) {
      const v = combineCandidates.find((x) => x.id === id)
      if (!v) continue
      for (const opt of optionsForVariable(v)) codes.add(opt.code)
    }
    return [...codes].sort().map((code) => ({
      code,
      label: labelForTrackedCode(combineCandidates, sourceIds, code),
    }))
  }, [combineCandidates, form.source_variable_ids, inferredSharedCodes])

  function openCreate() {
    setPageTab('custom')
    setCreating(true)
    setEditing(null)
    setForm(EMPTY_FORM)
    setPreview(null)
  }

  function openCreateFromQuestion(type: CustomVariableType, source: SurveyVariable) {
    setPageTab('custom')
    setCreating(true)
    setEditing(null)
    setForm({ ...EMPTY_FORM, ...buildVariableFormFromSource(type, source) })
    setPreview(null)
  }

  function openEdit(v: CustomVariable) {
    setPageTab('custom')
    setEditing(v)
    setCreating(false)
    setForm({
      name: v.name,
      code: v.code,
      variable_type: v.variable_type ?? 'recode',
      source_variable_id: v.source_variable_id ?? '',
      source_variable_ids: v.source_variable_ids ?? [],
      categories: v.categories.length ? v.categories : [{ label: 'Category 1', source_values: [] }],
      include_unmapped: v.include_unmapped,
      unmapped_label: v.unmapped_label,
      tracked_codes: v.tracked_codes ?? [],
      top_codes: v.top_codes ?? [],
      bottom_codes: v.bottom_codes ?? [],
    })
    setPreview(null)
  }

  function closeForm() {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setPreview(null)
  }

  function setVariableType(type: CustomVariableType) {
    setForm({
      ...EMPTY_FORM,
      variable_type: type,
      name: form.name,
      code: form.code,
    })
    setPreview(null)
  }

  function toggleCombineSource(id: string) {
    setForm((f) => {
      const ids = f.source_variable_ids.includes(id)
        ? f.source_variable_ids.filter((x) => x !== id)
        : [...f.source_variable_ids, id]
      const shared = sharedCodesFromVariables(combineCandidates, ids)
      return {
        ...f,
        source_variable_ids: ids,
        tracked_codes: shared.length > 0 ? shared : f.tracked_codes,
      }
    })
    setPreview(null)
  }

  function toggleTrackedCode(code: string) {
    setForm((f) => ({
      ...f,
      tracked_codes: f.tracked_codes.includes(code)
        ? f.tracked_codes.filter((c) => c !== code)
        : [...f.tracked_codes, code],
    }))
  }

  function toggleCodeList(field: 'top_codes' | 'bottom_codes', code: string) {
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(code) ? f[field].filter((c) => c !== code) : [...f[field], code],
    }))
  }

  function addCategory() {
    setForm((f) => ({
      ...f,
      categories: [...f.categories, { label: `Category ${f.categories.length + 1}`, source_values: [] }],
    }))
  }

  function removeCategory(index: number) {
    setForm((f) => ({
      ...f,
      categories: f.categories.filter((_, i) => i !== index),
    }))
  }

  function updateCategory(index: number, patch: Partial<{ label: string; source_values: string[] }>) {
    setForm((f) => ({
      ...f,
      categories: f.categories.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }))
  }

  function toggleSourceValue(catIndex: number, code: string) {
    setForm((f) => ({
      ...f,
      categories: f.categories.map((c, i) => {
        if (i !== catIndex) {
          return { ...c, source_values: c.source_values.filter((v) => v !== code) }
        }
        const has = c.source_values.includes(code)
        return {
          ...c,
          source_values: has ? c.source_values.filter((v) => v !== code) : [...c.source_values, code],
        }
      }),
    }))
  }

  function formIsValid(): boolean {
    if (!form.name.trim() || !form.code.trim()) return false
    if (form.variable_type === 'recode') {
      return Boolean(form.source_variable_id) && form.categories.some((c) => c.source_values.length > 0)
    }
    if (form.variable_type === 'combine') {
      return form.source_variable_ids.length >= 2 && form.tracked_codes.length >= 1
    }
    return Boolean(form.source_variable_id) && form.top_codes.length > 0 && form.bottom_codes.length > 0
  }

  async function runPreview() {
    setPreviewLoading(true)
    try {
      const result = await api.previewCustomVariable(surveyId, form, completionStatus)
      setPreview(result)
    } catch (err) {
      setPreview({ error: err instanceof Error ? err.message : 'Preview failed', counts: [] })
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleSave() {
    if (!formIsValid()) return
    setSaving(true)
    try {
      if (editing) {
        await api.updateCustomVariable(surveyId, editing.id, form)
      } else {
        await api.createCustomVariable(surveyId, form)
      }
      await load()
      if (username) {
        const { variables: saved } = await api.getCustomVariables(surveyId)
        saveCustomVariableBackup(username, surveyId, saved)
      }
      onChanged?.()
      closeForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this custom variable?')) return
    try {
      await api.deleteCustomVariable(surveyId, id)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  useEffect(() => {
    if (focusQuestionId) {
      setPageTab('questions')
    }
  }, [focusQuestionId])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="animate-spin text-[var(--et-teal)]" size={32} />
      </div>
    )
  }

  const showForm = creating || editing

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--canvas-subtle)] et-scroll overscroll-y-contain">
        <div className="mx-auto max-w-5xl space-y-6 p-4 pb-16 sm:p-6 sm:pb-20">
        <div className="et-panel flex flex-wrap items-start justify-between gap-4 p-5">
          <div>
            <h2 className="et-section-title">Data Setup</h2>
            <p className="mt-1 text-sm text-slate-500">
              Set analysis types per question, create recodes and nets, and configure weighting.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="et-segment">
              <button
                type="button"
                onClick={() => setPageTab('questions')}
                className={`et-segment-btn text-xs ${
                  pageTab === 'questions' ? 'et-segment-btn-active' : 'et-segment-btn-inactive'
                }`}
              >
                Questions
              </button>
              <button
                type="button"
                onClick={() => setPageTab('custom')}
                className={`et-segment-btn text-xs ${
                  pageTab === 'custom' ? 'et-segment-btn-active' : 'et-segment-btn-inactive'
                }`}
              >
                Custom variables ({variables.length})
              </button>
              <button
                type="button"
                onClick={() => setPageTab('weighting')}
                className={`et-segment-btn text-xs ${
                  pageTab === 'weighting' ? 'et-segment-btn-active' : 'et-segment-btn-inactive'
                }`}
              >
                Weighting
              </button>
            </div>
            {pageTab === 'custom' && !showForm && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--et-teal)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
              >
                <Plus size={16} /> New variable
              </button>
            )}
          </div>
        </div>

        {error && <ErrorState message={error} />}

        {pageTab === 'questions' && (
          <QuestionSetupPanel
            surveyId={surveyId}
            variables={schema?.variables ?? []}
            groups={schema?.groups ?? []}
            customVariables={variables}
            focusQuestionId={focusQuestionId}
            onFocusQuestionConsumed={onFocusQuestionConsumed}
            onCreateVariable={openCreateFromQuestion}
            onEditVariable={openEdit}
            onChanged={onChanged}
          />
        )}

        {pageTab === 'weighting' && (
          <WeightingPanel surveyId={surveyId} variables={schema?.variables ?? []} />
        )}

        {pageTab === 'custom' && (
          <>
            {showForm ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{editing ? 'Edit variable' : 'Create variable'}</h3>
              <button type="button" onClick={closeForm} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mb-5 grid gap-2 sm:grid-cols-3">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVariableType(opt.value)}
                  className={`rounded-xl border p-3 text-left transition ${
                    form.variable_type === opt.value
                      ? 'border-[var(--et-teal)] bg-[var(--et-teal-light)]/40 ring-2 ring-[var(--et-teal)]/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{opt.hint}</p>
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 font-medium text-slate-700">Display name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={form.variable_type === 'combine' ? 'e.g. Total awareness' : 'e.g. Net satisfaction'}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 font-medium text-slate-700">Variable code</span>
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                  placeholder="e.g. TOTAL_AWARE"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
                />
              </label>
            </div>

            {form.variable_type === 'recode' && (
              <>
                <label className="mt-4 block text-sm">
                  <span className="mb-1 font-medium text-slate-700">Source question</span>
                  <select
                    value={form.source_variable_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        source_variable_id: e.target.value,
                        categories: [{ label: 'Category 1', source_values: [] }],
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
                  >
                    <option value="">Select a question…</option>
                    {allCandidates.filter((v) => ['single', 'multi', 'numeric'].includes(v.kind)).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.code} — {v.text.slice(0, 80)}
                      </option>
                    ))}
                  </select>
                </label>

                {sourceVar && sourceOptions.length === 0 && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Answer options still loading — wait for enrichment or enter codes manually.
                  </p>
                )}

                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-800">Category mappings</h4>
                    <button type="button" onClick={addCategory} className="text-sm font-medium text-[var(--et-teal-dark)] hover:underline">
                      + Add category
                    </button>
                  </div>
                  {form.categories.map((cat, ci) => (
                    <div key={ci} className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <input
                          value={cat.label}
                          onChange={(e) => updateCategory(ci, { label: e.target.value })}
                          className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
                        />
                        {form.categories.length > 1 && (
                          <button type="button" onClick={() => removeCategory(ci)} className="text-slate-400 hover:text-red-600">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      {sourceOptions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {sourceOptions.map((opt) => {
                            const checked = cat.source_values.includes(opt.code)
                            const usedElsewhere = form.categories.some(
                              (c, i) => i !== ci && c.source_values.includes(opt.code),
                            )
                            return (
                              <button
                                key={opt.code}
                                type="button"
                                disabled={usedElsewhere && !checked}
                                onClick={() => toggleSourceValue(ci, opt.code)}
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${
                                  checked
                                    ? 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)] ring-[var(--et-teal)]/30'
                                    : 'bg-white text-slate-600 ring-slate-200 hover:ring-[var(--et-teal)]/40'
                                }`}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <input
                          value={cat.source_values.join(', ')}
                          onChange={(e) =>
                            updateCategory(ci, {
                              source_values: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                            })
                          }
                          placeholder="Enter answer codes, comma-separated"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.include_unmapped}
                    onChange={(e) => setForm((f) => ({ ...f, include_unmapped: e.target.checked }))}
                    className="accent-[var(--et-teal)]"
                  />
                  Put unmapped answers in
                  <input
                    value={form.unmapped_label}
                    onChange={(e) => setForm((f) => ({ ...f, unmapped_label: e.target.value }))}
                    className="w-24 rounded border border-slate-200 px-2 py-0.5 text-sm"
                  />
                </label>
              </>
            )}

            {form.variable_type === 'combine' && (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Layers size={16} className="text-indigo-600" />
                    <h4 className="text-sm font-semibold text-slate-800">Source questions (pick 2+)</h4>
                  </div>
                  <p className="mb-3 text-xs text-slate-500">
                    e.g. Top of mind + Spontaneous + Aided awareness. A code counts as aware if selected in any question.
                  </p>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                    {combineCandidates.map((v) => {
                      const checked = form.source_variable_ids.includes(v.id)
                      return (
                        <label
                          key={v.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-sm ${
                            checked ? 'bg-indigo-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCombineSource(v.id)}
                            className="mt-1 accent-indigo-600"
                          />
                          <span>
                            <span className="font-medium text-slate-800">{v.code}</span>
                            <span className="block text-xs text-slate-500 line-clamp-2">{v.text}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {form.source_variable_ids.length >= 2 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-slate-800">Codes to combine</h4>
                    {inferredSharedCodes.length > 0 && (
                      <p className="mb-2 text-xs text-emerald-700">
                        {inferredSharedCodes.length} shared code(s) found across selected questions.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {trackedOptions.map((opt) => {
                        const checked = form.tracked_codes.includes(opt.code)
                        return (
                          <button
                            key={opt.code}
                            type="button"
                            onClick={() => toggleTrackedCode(opt.code)}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${
                              checked
                                ? 'bg-indigo-100 text-indigo-800 ring-indigo-300'
                                : 'bg-white text-slate-600 ring-slate-200 hover:ring-indigo-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                    {trackedOptions.length === 0 && (
                      <p className="text-sm text-amber-700">No matching codes — ensure questions share the same brand/option codes.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {form.variable_type === 'net_score' && (
              <div className="mt-4 space-y-4">
                <label className="block text-sm">
                  <span className="mb-1 font-medium text-slate-700">Source scale question</span>
                  <select
                    value={form.source_variable_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        source_variable_id: e.target.value,
                        top_codes: [],
                        bottom_codes: [],
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
                  >
                    <option value="">Select a question…</option>
                    {netCandidates.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.code} — {v.text.slice(0, 80)}
                      </option>
                    ))}
                  </select>
                </label>

                {sourceVar && sourceOptions.length > 0 && (
                  <>
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-slate-800">Top box codes</h4>
                      <div className="flex flex-wrap gap-2">
                        {sourceOptions.map((opt) => (
                          <button
                            key={`top-${opt.code}`}
                            type="button"
                            onClick={() => toggleCodeList('top_codes', opt.code)}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                              form.top_codes.includes(opt.code)
                                ? 'bg-emerald-100 text-emerald-800 ring-emerald-300'
                                : 'bg-white text-slate-600 ring-slate-200'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="mb-2 flex items-center gap-1 text-sm font-semibold text-slate-800">
                        <Minus size={14} /> Bottom box codes
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {sourceOptions.map((opt) => (
                          <button
                            key={`bottom-${opt.code}`}
                            type="button"
                            onClick={() => toggleCodeList('bottom_codes', opt.code)}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                              form.bottom_codes.includes(opt.code)
                                ? 'bg-red-100 text-red-800 ring-red-300'
                                : 'bg-white text-slate-600 ring-slate-200'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">Net = Top box % − Bottom box % (shown in preview).</p>
                  </>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={runPreview}
                disabled={previewLoading || !formIsValid()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {previewLoading ? <Loader2 className="animate-spin" size={16} /> : <Eye size={16} />}
                Preview
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !formIsValid()}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Save variable
              </button>
            </div>

            {preview && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                {preview.error ? (
                  <p className="text-sm text-red-600">{preview.error}</p>
                ) : preview.preview_type === 'net_score' ? (
                  <>
                    <p className="mb-2 text-sm font-medium text-slate-700">
                      Net score preview — {preview.total?.toLocaleString()} responses
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                        <p className="text-xs text-slate-500">Top box</p>
                        <p className="text-lg font-bold text-emerald-700">{preview.top_pct}%</p>
                      </div>
                      <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
                        <p className="text-xs text-slate-500">Bottom box</p>
                        <p className="text-lg font-bold text-red-700">{preview.bottom_pct}%</p>
                      </div>
                      <div className="rounded-lg bg-white p-3 ring-1 ring-indigo-200">
                        <p className="text-xs text-slate-500">Net (Top − Bottom)</p>
                        <p className="text-lg font-bold text-indigo-800">{preview.net_pct} pts</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-2 text-sm font-medium text-slate-700">
                      Preview — {preview.total?.toLocaleString()} responses
                      {preview.preview_type === 'combine' && ' · % aware per code'}
                    </p>
                    <div className="space-y-1">
                      {preview.counts.map((row) => (
                        <div key={row.label} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{row.label}</span>
                          <span className="tabular-nums text-slate-500">
                            {row.count} ({row.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : variables.length === 0 ? (
          <EmptyState
            title="No custom variables yet"
            description="Create a recoded, combined awareness, or net score variable for analysis."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {variables.map((v) => (
              <VariableCard key={v.id} v={v} schema={schema} onEdit={() => openEdit(v)} onDelete={() => handleDelete(v.id)} />
            ))}
          </div>
        )}
          </>
        )}
      </div>
      </div>
    </div>
  )
}

function VariableCard({
  v,
  schema,
  onEdit,
  onDelete,
}: {
  v: CustomVariable
  schema: SurveySchema | null
  onEdit: () => void
  onDelete: () => void
}) {
  const sources =
    v.variable_type === 'combine'
      ? (v.source_variable_ids ?? [])
          .map((id) => schema?.variables.find((s) => s.id === id)?.code ?? id)
          .join(', ')
      : schema?.variables.find((s) => s.id === v.source_variable_id)?.code ?? v.source_variable_id

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-[var(--et-teal)]" />
            <h3 className="font-semibold text-slate-900">{v.name}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
              {typeLabel(v)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {v.code}
            {sources ? ` · from ${sources}` : ''}
          </p>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={onEdit} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <Pencil size={16} />
          </button>
          <button type="button" onClick={onDelete} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {v.variable_type === 'combine' && (v.tracked_codes?.length ?? 0) > 0 && (
        <p className="mt-3 text-xs text-slate-600">
          <span className="font-medium">Codes:</span> {v.tracked_codes.join(', ')}
        </p>
      )}
      {v.variable_type === 'net_score' && (
        <p className="mt-3 text-xs text-slate-600">
          <span className="font-medium">Top:</span> {v.top_codes.join(', ') || '—'}{' '}
          <span className="font-medium">· Bottom:</span> {v.bottom_codes.join(', ') || '—'}
        </p>
      )}
      {v.variable_type === 'recode' && (
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          {v.categories.map((c) => (
            <li key={c.label}>
              <span className="font-medium">{c.label}:</span> {c.source_values.join(', ') || '—'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function customVariableToSurvey(
  v: CustomVariable,
  baseVariables: SurveyVariable[] = [],
): SurveyVariable {
  if (v.variable_type === 'combine') {
    const codes = v.tracked_codes ?? []
    const sourceIds = v.source_variable_ids ?? []
    return {
      id: v.id,
      qid: 0,
      code: v.code,
      text: v.name,
      ls_type: 'custom',
      kind: 'multi',
      type_label: 'Custom (combined)',
      group_id: -1,
      group_title: 'Custom variables',
      columns: codes.map((c) => `_cv_${v.id}_${c}`),
      answer_options: [],
      subquestions: codes.map((code, i) => ({
        code,
        label: labelForTrackedCode(baseVariables, sourceIds, code),
        column: `_cv_${v.id}_${code}`,
        sort_order: i,
      })),
      metrics: ['distribution'],
      can_banner: true,
      can_filter: true,
      custom: true,
    }
  }

  if (v.variable_type === 'net_score') {
    return {
      id: v.id,
      qid: 0,
      code: v.code,
      text: v.name,
      ls_type: 'custom',
      kind: 'numeric',
      type_label: 'Custom (net score)',
      group_id: -1,
      group_title: 'Custom variables',
      columns: [`_cv_${v.id}`],
      answer_options: [],
      subquestions: [],
      metrics: ['mean', 'distribution'],
      can_banner: true,
      can_filter: true,
      custom: true,
      source_variable_id: v.source_variable_id,
    }
  }

  const labels = [...v.categories.map((c) => c.label)]
  if (v.include_unmapped && !labels.includes(v.unmapped_label)) labels.push(v.unmapped_label)
  return {
    id: v.id,
    qid: 0,
    code: v.code,
    text: v.name,
    ls_type: 'custom',
    kind: 'single',
    type_label: 'Custom (recode)',
    group_id: -1,
    group_title: 'Custom variables',
    columns: [`_cv_${v.id}`],
    answer_options: labels.map((label, i) => ({ code: label, label, sort_order: i })),
    subquestions: [],
    metrics: ['distribution'],
    can_banner: true,
    can_filter: true,
    custom: true,
    source_variable_id: v.source_variable_id,
  }
}
