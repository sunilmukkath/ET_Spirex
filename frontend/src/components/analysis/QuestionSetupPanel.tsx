import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import {
  api,
  type CustomVariable,
  type CustomVariableType,
  type SurveyVariable,
  type VariableSetupConfig,
  type VariableSetupEntry,
} from '../../api/client'
import { loadSurveySession, saveSurveySession } from '../../lib/workspaceSession'
import { QuestionSetupRow } from './QuestionSetupRow'

function defaultNetCodes(v: SurveyVariable): { top: string[]; bottom: string[] } {
  const opts = v.answer_options ?? []
  if (opts.length >= 2) {
    const codes = opts.map((o) => o.code)
    return { top: codes.slice(-2), bottom: codes.slice(0, 2) }
  }
  return { top: ['4', '5'], bottom: ['1', '2'] }
}

interface Props {
  surveyId: number
  variables: SurveyVariable[]
  groups: { id: number; title: string; order: number; variable_ids: string[] }[]
  customVariables: CustomVariable[]
  focusQuestionId?: string | null
  onFocusQuestionConsumed?: () => void
  username?: string | null
  onCreateVariable: (type: CustomVariableType, source: SurveyVariable) => void
  onEditVariable: (variable: CustomVariable) => void
  onChanged?: () => void
}

export function QuestionSetupPanel({
  surveyId,
  variables,
  groups,
  customVariables,
  focusQuestionId,
  onFocusQuestionConsumed,
  username,
  onCreateVariable,
  onEditVariable,
  onChanged,
}: Props) {
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(() => {
    if (focusQuestionId) return focusQuestionId
    if (username) return loadSurveySession(username, surveyId)?.setupExpandedQuestionId ?? null
    return null
  })
  const [setupConfig, setSetupConfig] = useState<VariableSetupConfig>({ variables: {} })
  const [setupLoading, setSetupLoading] = useState(true)

  const varMap = useMemo(() => new Map(variables.map((v) => [v.id, v])), [variables])

  const loadSetup = useCallback(async () => {
    setSetupLoading(true)
    try {
      const config = await api.getVariableSetup(surveyId)
      setSetupConfig(config)
    } catch {
      setSetupConfig({ variables: {} })
    } finally {
      setSetupLoading(false)
    }
  }, [surveyId])

  useEffect(() => {
    void loadSetup()
  }, [loadSetup])

  useEffect(() => {
    if (focusQuestionId) {
      setExpandedId(focusQuestionId)
      onFocusQuestionConsumed?.()
    }
  }, [focusQuestionId, onFocusQuestionConsumed])

  useEffect(() => {
    if (!username) return
    const saved = loadSurveySession(username, surveyId)
    if (saved?.setupExpandedQuestionId && varMap.has(saved.setupExpandedQuestionId)) {
      setExpandedId(saved.setupExpandedQuestionId)
    }
  }, [username, surveyId, varMap])

  useEffect(() => {
    if (!username) return
    saveSurveySession(username, surveyId, { setupExpandedQuestionId: expandedId })
  }, [username, surveyId, expandedId])

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

  const visibleCount = filteredGroups.reduce((n, g) => n + g.variable_ids.length, 0)

  function toggleQuestion(id: string) {
    setExpandedId((current) => (current === id ? null : id))
  }

  function handleSaved(variableId: string, entry: VariableSetupEntry | null) {
    setSetupConfig((prev) => {
      const next = { ...prev.variables }
      if (entry) next[variableId] = entry
      else delete next[variableId]
      return { variables: next }
    })
    onChanged?.()
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Questions</h3>
            <p className="mt-1 text-xs text-slate-500">
              Tap a question to expand setup below it — analysis type, weights, and derived variables.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
            {visibleCount} question{visibleCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="relative mt-3">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by question text or code…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--et-teal)]"
          />
        </div>
      </div>

      <div className="max-h-[min(70vh,720px)] overflow-y-auto et-scroll">
        {filteredGroups.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No questions match your search.</p>
        ) : (
          filteredGroups.map((g) => (
            <div key={g.id}>
              <p className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur sm:px-5">
                {g.title}
              </p>
              <ul>
                {g.variable_ids.map((id) => {
                  const v = varMap.get(id)
                  if (!v) return null
                  const derivedCount = customVariables.filter(
                    (cv) =>
                      cv.source_variable_id === id || (cv.source_variable_ids ?? []).includes(id),
                  ).length

                  return (
                    <QuestionSetupRow
                      key={id}
                      variable={v}
                      isOpen={expandedId === id}
                      onToggle={() => toggleQuestion(id)}
                      setupEntry={setupConfig.variables[id]}
                      setupLoading={setupLoading}
                      surveyId={surveyId}
                      customVariables={customVariables}
                      derivedCount={derivedCount}
                      onCreateVariable={onCreateVariable}
                      onEditVariable={onEditVariable}
                      onSaved={handleSaved}
                    />
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </div>
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
