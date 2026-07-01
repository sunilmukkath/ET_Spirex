import { Loader2, Sparkles } from 'lucide-react'
import type { AiStatus } from '../../api/client'

export function AiStatusBadge({
  status,
  className = '',
}: {
  status: AiStatus | null | undefined
  className?: string
}) {
  const ready = Boolean(status?.configured)
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        ready
          ? 'bg-[var(--et-yellow-light)] text-[var(--et-navy)] ring-1 ring-[var(--et-yellow)]/35'
          : 'bg-[var(--et-gray-100)] text-[var(--et-gray-500)] ring-1 ring-[var(--et-gray-200)]'
      } ${className}`}
    >
      <Sparkles size={10} />
      {ready ? 'AI on' : 'AI off'}
    </span>
  )
}

interface AiAssistPanelProps {
  title: string
  description: string
  briefLabel?: string
  brief: string
  onBriefChange: (v: string) => void
  onGenerate: () => void
  generating: boolean
  disabled?: boolean
  aiReady: boolean
  children?: React.ReactNode
}

export function AiAssistPanel({
  title,
  description,
  briefLabel = 'Brief / instructions',
  brief,
  onBriefChange,
  onGenerate,
  generating,
  disabled,
  aiReady,
  children,
}: AiAssistPanelProps) {
  return (
    <div className="et-ai-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--et-yellow)]" />
            <h3 className="text-sm font-semibold text-[var(--et-navy)]">{title}</h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{description}</p>
        </div>
        <span
          className={`text-[10px] font-medium ${aiReady ? 'text-[var(--et-navy)]' : 'text-[var(--muted)]'}`}
        >
          {aiReady ? 'Claude connected' : 'Uses template until API key is set'}
        </span>
      </div>

      <label className="mt-3 block text-xs font-medium text-[var(--et-gray-600)]">
        {briefLabel}
        <textarea
          value={brief}
          onChange={(e) => onBriefChange(e.target.value)}
          rows={3}
          placeholder="e.g. UK adults 25–54, 8-min online survey, brand awareness + consideration…"
          className="et-input mt-1 text-sm"
        />
      </label>

      <button
        type="button"
        onClick={onGenerate}
        disabled={generating || disabled || !brief.trim()}
        className="et-btn-accent mt-3 w-full py-2.5 text-sm disabled:opacity-50"
      >
        {generating ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Sparkles size={16} />
            Generate with AI
          </>
        )}
      </button>

      {children}
    </div>
  )
}
