import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import { api, type SurveyVariable } from '../../api/client'

function eligibleForOverride(v: SurveyVariable): boolean {
  if (v.custom) return false
  const kind = v.original_kind || v.kind
  if (!['numeric', 'rank'].includes(kind)) return false
  if (kind === 'numeric' && v.ls_type === 'K' && (v.subquestions?.length ?? 0) > 1) return false
  return true
}

interface Props {
  surveyId: number
  variables: SurveyVariable[]
  onChanged?: () => void
}

export function KindOverrideSection({ surveyId, variables, onChanged }: Props) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const eligible = useMemo(() => variables.filter(eligibleForOverride), [variables])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { overrides: rows } = await api.getKindOverrides(surveyId)
      setOverrides(rows)
    } catch {
      setOverrides({})
    } finally {
      setLoading(false)
    }
  }, [surveyId])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(variableId: string, enabled: boolean) {
    setSavingId(variableId)
    try {
      const { overrides: next } = await api.setKindOverride(surveyId, variableId, enabled)
      setOverrides(next)
      onChanged?.()
    } finally {
      setSavingId(null)
    }
  }

  if (!eligible.length) return null

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Treat as categorical</h3>
        <p className="mt-1 text-xs text-slate-500">
          One-click override for numeric and rank questions — each answer value becomes its own category for
          Compare, Statistics, and filters. No recode buckets needed.
        </p>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="animate-spin" size={16} /> Loading…
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {eligible.map((v) => {
            const on = Boolean(overrides[v.id] || v.treat_as_categorical)
            const busy = savingId === v.id
            return (
              <li key={v.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{v.text || v.code}</p>
                  <p className="text-xs text-slate-400">
                    {v.code} · {v.type_label}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggle(v.id, !on)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    on
                      ? 'bg-[var(--et-teal-light)] text-[var(--et-teal-dark)] ring-1 ring-[var(--et-teal)]/30'
                      : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200'
                  }`}
                >
                  {busy ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : on ? (
                    <ToggleRight size={16} />
                  ) : (
                    <ToggleLeft size={16} />
                  )}
                  {on ? 'Categorical' : 'Numeric'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
