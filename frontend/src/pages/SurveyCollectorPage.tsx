import { useEffect, useMemo, useState } from 'react'
import { applyRandomizeOrder } from '../lib/etSurveyRandomize'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { api, type EtCollectorSurvey, type EtQuestion } from '../api/client'
import { BrandLogo } from '../components/BrandLogo'
import { EtQuestionField } from '../components/survey/EtQuestionField'
import { ErrorState, LoadingState } from '../components/States'

function matchesShowIf(
  rule: EtQuestion['show_if'],
  answers: Record<string, unknown>,
): boolean {
  if (!rule) return true
  const raw = answers[rule.question_id]
  const values = Array.isArray(raw) ? raw.map(String) : [String(raw ?? '')]
  const target = rule.values.map(String)
  switch (rule.operator) {
    case 'equals':
      return target.some((t) => values.includes(t))
    case 'not_equals':
      return !target.some((t) => values.includes(t))
    case 'includes':
      return target.every((t) => values.includes(t))
    case 'not_includes':
      return !target.every((t) => values.includes(t))
    default:
      return true
  }
}

export function SurveyCollectorPage() {
  const { slug } = useParams<{ slug: string }>()
  const [survey, setSurvey] = useState<EtCollectorSurvey | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [blockIndex, setBlockIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    api
      .getCollectorSurvey(slug)
      .then(setSurvey)
      .catch((err) => setError(err instanceof Error ? err.message : 'Survey not available'))
      .finally(() => setLoading(false))
  }, [slug])

  const blocks = useMemo(() => {
    const raw = survey?.definition.blocks ?? []
    return applyRandomizeOrder(raw).map((block) => ({
      ...block,
      questions: applyRandomizeOrder(block.questions),
    }))
  }, [survey])
  const settings = survey?.definition.settings
  const currentBlock = blocks[blockIndex]
  const singlePage = settings?.single_page ?? false

  const visibleQuestions = useMemo(() => {
    if (!currentBlock) return []
    return currentBlock.questions.filter((q) => matchesShowIf(q.show_if, answers))
  }, [currentBlock, answers])

  function setAnswer(questionId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  async function submit(final: boolean) {
    if (!slug) return
    setSubmitting(true)
    setError(null)
    try {
      await api.submitCollectorResponse(slug, { answers, complete: final })
      if (final) setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingState message="Loading survey…" />
  if (error && !survey) return <ErrorState message={error} />
  if (!survey) return <ErrorState message="Survey not found" />

  if (done) {
    return (
      <div className="et-canvas-dots flex min-h-screen items-center justify-center p-6">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <BrandLogo size="sm" />
          <h1 className="text-xl font-semibold text-slate-900">{settings?.thank_you_title ?? 'Thank you'}</h1>
          <p className="mt-2 text-sm text-slate-600">{settings?.thank_you_message}</p>
        </div>
      </div>
    )
  }

  const isLast = blockIndex >= blocks.length - 1

  return (
    <div className="et-canvas-dots min-h-screen py-8">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-6 flex items-center justify-between">
          <BrandLogo size="sm" />
          {settings?.show_progress && blocks.length > 1 && (
            <span className="text-xs text-slate-500">
              Section {blockIndex + 1} of {blocks.length}
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {blockIndex === 0 && (
            <header className="mb-6 border-b border-slate-100 pb-4">
              <h1 className="text-xl font-semibold text-slate-900">{survey.title}</h1>
              {survey.description && <p className="mt-1 text-sm text-slate-600">{survey.description}</p>}
              <p className="mt-2 text-sm text-slate-500">{settings?.welcome_message}</p>
            </header>
          )}

          {currentBlock && (
            <>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--et-teal)]">
                {currentBlock.title}
              </h2>
              <div className="space-y-6">
                {visibleQuestions.map((q) => (
                  <EtQuestionField
                    key={q.id}
                    slug={slug}
                    question={q}
                    value={answers[q.id]}
                    onChange={(v) => setAnswer(q.id, v)}
                  />
                ))}
              </div>
            </>
          )}

          {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

          <div className="mt-8 flex justify-between gap-3">
            <button
              type="button"
              disabled={blockIndex === 0 || submitting}
              onClick={() => setBlockIndex((i) => Math.max(0, i - 1))}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-40"
            >
              Back
            </button>
            {singlePage || isLast ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--et-teal)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                Submit
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => setBlockIndex((i) => i + 1)}
                className="rounded-lg bg-[var(--et-teal)] px-5 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
