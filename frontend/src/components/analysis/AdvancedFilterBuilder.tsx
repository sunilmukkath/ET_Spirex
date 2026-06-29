import { useEffect, useMemo, useState } from 'react'
import { Filter, X } from 'lucide-react'
import type { FilterSpec, SurveyVariable } from '../../api/client'
import {
  buildDraftTree,
  emptyCondition,
  sanitizeFilterTree,
  summarizeFilterTree,
  type FilterGroup,
} from '../../lib/filterTree'
import { GroupEditor, schemaFilterOptions } from './FilterRuleEditors'

interface Props {
  open: boolean
  onClose: () => void
  surveyId: number
  completionStatus: string
  variables: SurveyVariable[]
  value: FilterGroup | null
  filters?: FilterSpec[]
  onApply: (tree: FilterGroup | null) => void
}

/** Modal wrapper — prefer inline FilterEditor for most views. */
export function AdvancedFilterBuilder({
  open,
  onClose,
  surveyId,
  completionStatus,
  variables,
  value,
  filters = [],
  onApply,
}: Props) {
  const [draft, setDraft] = useState<FilterGroup>(() => buildDraftTree(value, filters))

  useEffect(() => {
    if (!open) return
    const next = buildDraftTree(value, filters)
    if (!next.children.length) {
      next.children = [emptyCondition()]
    }
    setDraft(next)
  }, [open, value, filters])

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])
  const preview = summarizeFilterTree(
    draft,
    (id) => varMap.get(id)?.text || varMap.get(id)?.code || id,
    (varId, code) => {
      const v = varMap.get(varId)
      if (!v) return code
      return schemaFilterOptions(v).find((o) => o.code === code)?.label || code
    },
  )

  if (!open) return null

  function handleApply() {
    onApply(sanitizeFilterTree(draft))
    onClose()
  }

  function handleClear() {
    onApply(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-[var(--et-teal)]" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Filter responses</h2>
              <p className="text-xs text-slate-500">
                Build rules with equals, not equal, AND, OR, and NOT
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <GroupEditor
            group={draft}
            onChange={setDraft}
            variables={variables}
            surveyId={surveyId}
            completionStatus={completionStatus}
          />
          {preview && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Preview
              </p>
              <p className="mt-0.5 text-sm text-slate-700">{preview}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Clear all
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
            >
              Apply filters
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { ConditionEditor, GroupEditor } from './FilterRuleEditors'
