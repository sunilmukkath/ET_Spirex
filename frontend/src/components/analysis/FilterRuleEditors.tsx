import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { api, type SurveyVariable } from '../../api/client'
import {
  FILTER_OPERATORS,
  emptyCondition,
  emptyGroup,
  isFilterGroup,
  type FilterCondition,
  type FilterGroup,
  type FilterNode,
  type FilterOperator,
} from '../../lib/filterTree'

export function schemaFilterOptions(v: SurveyVariable): { code: string; label: string }[] {
  if (v.answer_options?.length) {
    return v.answer_options.map((o) => ({ code: o.code, label: o.label || o.code }))
  }
  if (v.subquestions?.length) {
    return v.subquestions.map((sq) => ({ code: sq.code, label: sq.label || sq.code }))
  }
  return []
}

export function filterableVariables(variables: SurveyVariable[]) {
  return variables.filter(
    (v) => v.can_filter && ['single', 'multi', 'numeric'].includes(v.kind),
  )
}

export function ConditionEditor({
  condition,
  onChange,
  onRemove,
  variables,
  surveyId,
  completionStatus,
  compact,
}: {
  condition: FilterCondition
  onChange: (next: FilterCondition) => void
  onRemove: () => void
  variables: SurveyVariable[]
  surveyId: number
  completionStatus: string
  compact?: boolean
}) {
  const [options, setOptions] = useState<{ code: string; label: string }[]>([])
  const [loading, setLoading] = useState(false)

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])
  const selectedVar = condition.variable_id ? varMap.get(condition.variable_id) : null
  const multiValue = condition.operator === 'in' || condition.operator === 'not_in'
  const filterableVars = filterableVariables(variables)

  useEffect(() => {
    if (!selectedVar) {
      setOptions([])
      return
    }
    const fromSchema = schemaFilterOptions(selectedVar)
    if (fromSchema.length > 0) {
      setOptions(fromSchema)
      return
    }
    let cancelled = false
    setLoading(true)
    api
      .getFilterOptions(surveyId, selectedVar.id, completionStatus)
      .then((res) => {
        if (cancelled) return
        setOptions(res.options.map((o) => ({ code: o.code, label: o.label || o.code })))
      })
      .catch(() => {
        if (!cancelled) setOptions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [surveyId, completionStatus, selectedVar])

  const selectedOp = FILTER_OPERATORS.find((o) => o.value === condition.operator)

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white ${
        compact ? 'p-2.5' : 'p-3 shadow-sm'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {!compact && <span className="text-xs font-medium text-slate-500">Where</span>}

        <select
          value={condition.variable_id}
          onChange={(e) =>
            onChange({ ...condition, variable_id: e.target.value, values: multiValue ? [] : [''] })
          }
          className="min-w-[140px] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
          aria-label="Question"
        >
          <option value="">Select question…</option>
          {filterableVars.map((v) => (
            <option key={v.id} value={v.id}>
              {v.code} — {(v.text || v.code).slice(0, 55)}
            </option>
          ))}
        </select>

        <select
          value={condition.operator}
          onChange={(e) =>
            onChange({
              ...condition,
              operator: e.target.value as FilterOperator,
              values: e.target.value === 'in' || e.target.value === 'not_in' ? [] : [''],
            })
          }
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
          aria-label="Condition"
          title={selectedOp?.hint}
        >
          {FILTER_OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>

        <label
          className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200"
          title="Exclude matches (NOT)"
        >
          <input
            type="checkbox"
            checked={Boolean(condition.negate)}
            onChange={(e) => onChange({ ...condition, negate: e.target.checked })}
          />
          NOT
        </label>

        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          aria-label="Remove rule"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {selectedOp && !compact && (
        <p className="mt-1.5 pl-1 text-[11px] text-slate-400">{selectedOp.hint}</p>
      )}

      {selectedVar && (
        <div className="mt-2.5">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="animate-spin" size={14} />
              Loading answer options…
            </div>
          )}

          {!loading && options.length > 0 && multiValue && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-slate-500">Select one or more answers</p>
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => {
                  const checked = condition.values.includes(opt.code)
                  return (
                    <label
                      key={opt.code}
                      className={`inline-flex cursor-pointer items-center rounded-lg px-2.5 py-1 text-xs ring-1 transition ${
                        checked
                          ? 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)] ring-[var(--et-teal)]/30'
                          : 'bg-slate-50 text-slate-700 ring-slate-200 hover:ring-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? condition.values.filter((v) => v !== opt.code)
                            : [...condition.values, opt.code]
                          onChange({ ...condition, values: next })
                        }}
                      />
                      {opt.label}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {!loading && options.length > 0 && !multiValue && (
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-500">Answer value</p>
              <select
                value={condition.values[0] ?? ''}
                onChange={(e) => onChange({ ...condition, values: [e.target.value] })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
              >
                <option value="">Choose answer…</option>
                {options.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!loading && options.length === 0 && selectedVar.kind === 'numeric' && (
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-500">Number</p>
              <input
                type="number"
                value={condition.values[0] ?? ''}
                onChange={(e) => onChange({ ...condition, values: [e.target.value] })}
                placeholder="Enter number"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
              />
            </div>
          )}

          {!loading && options.length === 0 && selectedVar.kind !== 'numeric' && (
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-500">Text value</p>
              <input
                type="text"
                value={condition.values[0] ?? ''}
                onChange={(e) => onChange({ ...condition, values: [e.target.value] })}
                placeholder="Type value to match"
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function GroupEditor({
  group,
  onChange,
  onRemove,
  variables,
  surveyId,
  completionStatus,
  depth = 0,
}: {
  group: FilterGroup
  onChange: (next: FilterGroup) => void
  onRemove?: () => void
  variables: SurveyVariable[]
  surveyId: number
  completionStatus: string
  depth?: number
}) {
  function updateChild(index: number, next: FilterNode) {
    const children = [...group.children]
    children[index] = next
    onChange({ ...group, children })
  }

  function removeChild(index: number) {
    onChange({ ...group, children: group.children.filter((_, i) => i !== index) })
  }

  function addCondition() {
    onChange({ ...group, children: [...group.children, emptyCondition()] })
  }

  function addGroup(logic: 'and' | 'or') {
    onChange({ ...group, children: [...group.children, emptyGroup(logic)] })
  }

  const logicLabel = group.logic === 'or' ? 'Any rule matches (OR)' : 'All rules match (AND)'

  return (
    <div
      className={`space-y-2 rounded-xl border p-3 ${
        depth === 0 ? 'border-slate-200 bg-slate-50/80' : 'border-violet-100 bg-violet-50/30'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {depth === 0 ? (
          <span className="text-xs font-medium text-slate-600">Show responses where</span>
        ) : (
          <span className="text-xs font-medium text-violet-700">Nested group</span>
        )}
        <select
          value={group.logic}
          onChange={(e) => onChange({ ...group, logic: e.target.value as 'and' | 'or' })}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
          aria-label="Combine rules"
        >
          <option value="and">All rules match (AND)</option>
          <option value="or">Any rule matches (OR)</option>
        </select>
        <label
          className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200"
          title="Invert entire group"
        >
          <input
            type="checkbox"
            checked={Boolean(group.negate)}
            onChange={(e) => onChange({ ...group, negate: e.target.checked })}
          />
          NOT group
        </label>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {depth === 0 && (
        <p className="text-[11px] text-slate-400">
          {logicLabel} — add rules below. Use OR groups when respondents can match any one of several
          conditions.
        </p>
      )}

      <div className="space-y-2">
        {group.children.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-400">
            No rules yet — click &ldquo;Add rule&rdquo; to filter by a question answer.
          </p>
        )}
        {group.children.map((child, index) =>
          isFilterGroup(child) ? (
            <GroupEditor
              key={index}
              group={child}
              onChange={(next) => updateChild(index, next)}
              onRemove={() => removeChild(index)}
              variables={variables}
              surveyId={surveyId}
              completionStatus={completionStatus}
              depth={depth + 1}
            />
          ) : (
            <ConditionEditor
              key={index}
              condition={child}
              onChange={(next) => updateChild(index, next)}
              onRemove={() => removeChild(index)}
              variables={variables}
              surveyId={surveyId}
              completionStatus={completionStatus}
              compact={depth > 0}
            />
          ),
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={addCondition}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:text-[var(--et-teal-dark)]"
        >
          <Plus size={12} />
          Add rule
        </button>
        {depth < 2 && (
          <>
            <button
              type="button"
              onClick={() => addGroup('and')}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-violet-300 hover:text-violet-800"
            >
              <Plus size={12} />
              Add AND group
            </button>
            <button
              type="button"
              onClick={() => addGroup('or')}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-violet-300 hover:text-violet-800"
            >
              <Plus size={12} />
              Add OR group
            </button>
          </>
        )}
      </div>
    </div>
  )
}
