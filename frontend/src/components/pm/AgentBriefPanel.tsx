import { Bot, Loader2 } from 'lucide-react'
import type { PmAgentBrief } from '../../api/client'

export function AgentBriefPanel({ brief, loading }: { brief: PmAgentBrief | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin text-[var(--et-teal)]" />
        Agent thinking…
      </div>
    )
  }
  if (!brief) return null
  return (
    <div className="rounded-xl border border-[var(--et-teal)]/25 bg-[var(--et-teal-light)]/30 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--et-teal-dark)]">
        <Bot size={14} />
        {brief.agent} agent {brief.configured ? '(AI)' : '(rules)'}
      </div>
      <p className="mt-2 text-sm text-slate-800">{brief.summary}</p>
      {brief.actions.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {brief.actions.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      )}
      {brief.risks.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-amber-800">
          {brief.risks.map((r) => (
            <li key={r}>⚠ {r}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
