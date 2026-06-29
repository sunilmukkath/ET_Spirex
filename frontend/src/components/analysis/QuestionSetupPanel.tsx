import { useEffect, useMemo, useState } from 'react'
import {
  Layers,
  Minus,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react'
import {
  type CustomVariable,
  type CustomVariableType,
  type SurveyVariable,
} from '../../api/client'
import { CollapsibleSection } from '../CollapsibleSection'

function eligibleForNet(v: SurveyVariable): boolean {
  if (v.custom) return false
  return v.kind === 'numeric' || (v.kind === 'single' && (v.answer_options?.length ?? 0) > 0)
}

function defaultNetCodes(v: SurveyVariable): { top: string[]; bottom: string[] } {
  const opts = v.answer_options ?? []
  if (opts.length >= 2) {
    const codes = opts.map((o) => o.code)
    return { top: codes.slice(-2), bottom: codes.slice(0, 2) }
  }
  return { top: ['4', '5'], bottom: ['1', '2'] }
}

interface Props {
  variables: SurveyVariable[]
  groups: { id: number; title: string; order: number; variable_ids: string[] }[]
  customVariables: CustomVariable[]
  focusQuestionId?: string | null
  onFocusQuestionConsumed?: () => void
  onCreateVariable: (type: CustomVariableType, source: SurveyVariable) => void
  onEditVariable: (variable: CustomVariable) => void
}

export function QuestionSetupPanel({
  variables,
  groups,
  customVariables,
  focusQuestionId,
  onFocusQuestionConsumed,
  onCreateVariable,
  onEditVariable,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [browseOpen, setBrowseOpen] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(true)

  const surveyVars = useMemo(
    () => variables.filter((v) => !v.custom && v.group_id !== -1),
    [variables],
  )

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])

  useEffect(() => {
    if (focusQuestionId) {
      setSelectedId(focusQuestionId)
      onFocusQuestionConsumed?.()
    }
  }, [focusQuestionId, onFocusQuestionConsumed])

  useEffect(() => {
    if (!selectedId && surveyVars.length > 0) {
      setSelectedId(surveyVars[0].id)
    }
  }, [selectedId, surveyVars])

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups
      .map((g) => ({
        ...g,
        variable_ids: g.variable_ids.filter((id) => {
          const v = varMap.get(id)
          if (!v || v.custom) return false
          if (!q) return true
          return (
            `${v.text ?? ''}`.toLowerCase().includes(q) ||
            `${v.code ?? ''}`.toLowerCase().includes(q)
          )
        }),
      }))
      .filter((g) => g.variable_ids.length > 0)
  }, [groups, varMap, search])

  const selected = selectedId ? varMap.get(selectedId) ?? null : null

  const derivedVars = useMemo(() => {
    if (!selected) return []
    return customVariables.filter(
      (cv) =>
        cv.source_variable_id === selected.id ||
        (cv.source_variable_ids ?? []).includes(selected.id),
    )
  }, [customVariables, selected])

  return (
    <div className="space-y-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CollapsibleSection
        title="Browse questions"
        summary={
          selected
            ? `${selected.code} — ${(selected.text || selected.code).slice(0, 48)}`
            : `${surveyVars.length} questions`
        }
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        className="border-b border-slate-200"
      >
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
          />
        </div>
        <div className="mt-3 space-y-2">
          {filteredGroups.map((g) => (
            <div key={g.id}>
              <p className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {g.title}
              </p>
              <ul className="space-y-0.5">
                {g.variable_ids.map((id) => {
                  const v = varMap.get(id)
                  if (!v) return null
                  const active = id === selectedId
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(id)
                          setDetailsOpen(true)
                        }}
                        className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition ${
                          active
                            ? 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)]'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="line-clamp-2 font-medium">{v.text || v.code}</span>
                        <span className="mt-0.5 block text-[10px] text-slate-500">{v.type_label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Question details"
        summary={
          selected
            ? `${selected.type_label} · ${derivedVars.length} derived variable${derivedVars.length === 1 ? '' : 's'}`
            : 'Select a question'
        }
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        className="border-b-0"
      >
        {!selected ? (
          <p className="text-sm text-slate-500">Select a question above to configure analysis.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-2">
              <Layers size={18} className="mt-0.5 shrink-0 text-[var(--et-teal)]" />
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{selected.text || selected.code}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {selected.code} · LimeSurvey {selected.ls_type} · {selected.type_label}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  <span className="font-medium">Metrics:</span>{' '}
                  {selected.metrics.length ? selected.metrics.join(', ') : '—'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Analysis</p>
              <p className="mt-2 text-sm text-slate-600">
                Uses <strong>{selected.kind}</strong> analysis (
                {selected.can_banner ? 'can banner' : 'profile only'}
                {selected.can_filter ? ', filterable' : ''}).
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Derived variables
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onCreateVariable('recode', selected)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
                >
                  <Plus size={14} />
                  Recode
                </button>
                {eligibleForNet(selected) && (
                  <button
                    type="button"
                    onClick={() => onCreateVariable('net_score', selected)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
                  >
                    <Minus size={14} />
                    Net score
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onCreateVariable('combine', selected)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[var(--et-teal)] hover:bg-[var(--et-teal-light)]/40"
                >
                  <Sparkles size={14} />
                  Combine / net questions
                </button>
              </div>

              {derivedVars.length > 0 ? (
                <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {derivedVars.map((cv) => (
                    <li key={cv.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{cv.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {cv.code} · {cv.variable_type.replace('_', ' ')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onEditVariable(cv)}
                        className="shrink-0 text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                      >
                        Edit
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No custom variables from this question yet.</p>
              )}
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}

export function buildVariableFormFromSource(
  type: CustomVariableType,
  source: SurveyVariable,
): Partial<import('../../api/client').CustomVariableInput> {
  const base = {
    variable_type: type,
    name: '',
    code: '',
  }
  if (type === 'recode') {
    return {
      ...base,
      source_variable_id: source.id,
      name: `Recode: ${(source.text || source.code).slice(0, 40)}`,
      code: `${source.code}_RC`.slice(0, 24),
      categories: [{ label: 'Category 1', source_values: [] }],
    }
  }
  if (type === 'net_score') {
    const { top, bottom } = defaultNetCodes(source)
    return {
      ...base,
      source_variable_id: source.id,
      name: `Net: ${(source.text || source.code).slice(0, 36)}`,
      code: `${source.code}_NET`.slice(0, 24),
      top_codes: top,
      bottom_codes: bottom,
    }
  }
  return {
    ...base,
    source_variable_ids: [source.id],
    name: `Combined: ${(source.text || source.code).slice(0, 36)}`,
    code: `${source.code}_COMB`.slice(0, 24),
    tracked_codes: [],
  }
}
