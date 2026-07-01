import { useMemo, useState } from 'react'
import { applyRandomizeOrder } from '../../lib/etSurveyRandomize'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { EtQuestion } from '../../api/client'

function shuffledOptions<T extends { sort_order: number }>(items: T[], randomize: boolean): T[] {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)
  if (!randomize) return sorted
  const copy = [...sorted]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function EtQuestionField({
  question,
  value,
  onChange,
}: {
  question: EtQuestion
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (question.type === 'display') {
    return <p className="text-sm leading-relaxed text-slate-700">{question.text}</p>
  }

  const options = useMemo(() => {
    const sorted = [...(question.options ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    if (question.randomize_options) return shuffledOptions(sorted, true)
    return applyRandomizeOrder(sorted)
  }, [question.options, question.randomize_options])

  return (
    <div>
      <p className="text-sm font-medium text-slate-900">
        {question.text}
        {question.required && <span className="text-rose-500"> *</span>}
      </p>
      {question.help_text && <p className="mt-0.5 text-xs text-slate-500">{question.help_text}</p>}

      {(question.type === 'single' || question.type === 'yes_no') && (
        <ul className="mt-2 space-y-2">
          {options.map((opt) => (
            <li key={opt.code}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:border-[var(--et-navy)]/25">
                <input
                  type="radio"
                  name={question.id}
                  checked={String(value) === opt.code}
                  onChange={() => onChange(opt.code)}
                />
                <span className="text-sm text-slate-800">{opt.label}</span>
              </label>
            </li>
          ))}
          {question.allow_other && (
            <li>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                <input
                  type="radio"
                  name={question.id}
                  checked={String(value).startsWith('other:')}
                  onChange={() => onChange('other:')}
                />
                <span className="text-sm">{question.other_label || 'Other'}</span>
              </label>
              {String(value).startsWith('other:') && (
                <input
                  type="text"
                  className="et-input mt-2 w-full text-sm"
                  placeholder="Please specify"
                  value={String(value).replace(/^other:/, '')}
                  onChange={(e) => onChange(`other:${e.target.value}`)}
                />
              )}
            </li>
          )}
        </ul>
      )}

      {question.type === 'dropdown' && (
        <select
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || null)}
          className="et-select mt-2 w-full text-sm"
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {question.type === 'multi' && (
        <ul className="mt-2 space-y-2">
          {options.map((opt) => {
            const selected = Array.isArray(value) ? value.map(String) : []
            const checked = selected.includes(opt.code)
            return (
              <li key={opt.code}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = new Set(selected)
                      if (checked) next.delete(opt.code)
                      else next.add(opt.code)
                      onChange([...next])
                    }}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {question.type === 'ranking' && (
        <ul className="mt-2 space-y-2">
          {options.map((opt) => {
            const ranks = (value as Record<string, string> | undefined) ?? {}
            return (
              <li key={opt.code} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm text-slate-800">{opt.label}</span>
                <select
                  value={ranks[opt.code] ?? ''}
                  onChange={(e) => onChange({ ...ranks, [opt.code]: e.target.value })}
                  className="et-select text-xs"
                >
                  <option value="">Rank…</option>
                  {options.map((_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </li>
            )
          })}
        </ul>
      )}

      {question.type === 'scale' && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
            <span>{question.scale_min_label || question.scale_min}</span>
            <span>{question.scale_max_label || question.scale_max}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from(
              { length: (question.scale_max ?? 5) - (question.scale_min ?? 1) + 1 },
              (_, i) => (question.scale_min ?? 1) + i,
            ).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(String(n))}
                className={`h-10 min-w-10 rounded-full border px-2 text-sm ${
                  String(value) === String(n)
                    ? 'border-[var(--et-navy)] bg-[var(--et-navy)] text-white'
                    : 'border-slate-200 text-slate-700 hover:border-[var(--et-navy)]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {question.type === 'numeric' && (
        <input
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="et-input mt-2 w-full max-w-xs"
        />
      )}

      {question.type === 'email' && (
        <input
          type="email"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="et-input mt-2 w-full max-w-md"
          autoComplete="email"
        />
      )}

      {question.type === 'date' && (
        <input
          type="date"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="et-input mt-2 w-full max-w-xs"
        />
      )}

      {question.type === 'text' && (
        <input
          type="text"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="et-input mt-2 w-full"
        />
      )}

      {question.type === 'long_text' && (
        <textarea
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="et-input mt-2 w-full"
        />
      )}

      {question.type === 'matrix' && (
        <MatrixTable question={question} value={value} onChange={onChange} />
      )}

      {question.type === 'array_carousel' && (
        <CarouselArray question={question} value={value} onChange={onChange} />
      )}
    </div>
  )
}

function MatrixTable({
  question,
  value,
  onChange,
}: {
  question: EtQuestion
  value: unknown
  onChange: (v: unknown) => void
}) {
  const columns = useColumnDefs(question)
  const rows = useMemo(() => applyRandomizeOrder(question.rows ?? []), [question.rows])
  const matrixVal = (value as Record<string, string> | undefined) ?? {}

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left" />
            {columns.map((col) => (
              <th key={col.code} className="p-2 text-center font-normal text-slate-500">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code} className="border-t border-slate-100">
              <td className="p-2 font-medium text-slate-800">{row.label}</td>
              {columns.map((col) => (
                <td key={col.code} className="p-2 text-center">
                  <input
                    type="radio"
                    name={`${question.id}_${row.code}`}
                    checked={matrixVal[row.code] === col.code}
                    onChange={() => onChange({ ...matrixVal, [row.code]: col.code })}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CarouselArray({
  question,
  value,
  onChange,
}: {
  question: EtQuestion
  value: unknown
  onChange: (v: unknown) => void
}) {
  const rows = useMemo(() => applyRandomizeOrder(question.rows ?? []), [question.rows])
  const [index, setIndex] = useState(0)
  const columns = useColumnDefs(question)
  const matrixVal = (value as Record<string, string> | undefined) ?? {}
  const row = rows[index]
  const answered = rows.filter((r) => matrixVal[r.code]).length

  if (!row) {
    return <p className="mt-2 text-xs text-slate-500">Add sub-questions in the survey builder.</p>
  }

  return (
    <div className="et-array-carousel mt-4">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          Item {index + 1} of {rows.length}
        </span>
        <span>
          {answered}/{rows.length} answered
        </span>
      </div>
      <div className="mt-2 flex gap-1">
        {rows.map((r, i) => (
          <span
            key={r.code}
            className={`h-1.5 flex-1 rounded-full ${
              matrixVal[r.code] ? 'bg-[var(--et-yellow)]' : i === index ? 'bg-[var(--et-navy)]/40' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-[var(--canvas-subtle)] p-4">
        <p className="text-sm font-semibold text-[var(--et-navy)]">{row.label}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {columns.map((col) => (
            <button
              key={col.code}
              type="button"
              onClick={() => onChange({ ...matrixVal, [row.code]: col.code })}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                matrixVal[row.code] === col.code
                  ? 'border-[var(--et-navy)] bg-[var(--et-navy)] text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-[var(--et-navy)]/30'
              }`}
            >
              {col.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-between gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-40"
        >
          <ChevronLeft size={14} />
          Previous
        </button>
        <button
          type="button"
          disabled={index >= rows.length - 1}
          onClick={() => setIndex((i) => Math.min(rows.length - 1, i + 1))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

function useColumnDefs(question: EtQuestion) {
  return useMemo(() => {
    const opts = [...(question.options ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    if (opts.length > 0) return opts
    const min = question.scale_min ?? 1
    const max = question.scale_max ?? 5
    return Array.from({ length: max - min + 1 }, (_, i) => {
      const n = min + i
      return { code: String(n), label: String(n), sort_order: i }
    })
  }, [question.options, question.scale_min, question.scale_max])
}
