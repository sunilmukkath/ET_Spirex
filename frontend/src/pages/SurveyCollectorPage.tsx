import { useEffect, useMemo, useState } from 'react'
import { applyRandomizeOrder } from '../lib/etSurveyRandomize'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { api, type EtCollectorSurvey, type EtQuestion } from '../api/client'
import { BrandLogo } from '../components/BrandLogo'
import { EtQuestionField } from '../components/survey/EtQuestionField'
import { ErrorState, LoadingState } from '../components/States'
import {
  getNextPage,
  visibleQuestionsOnBlock,
  type ParticipantSession,
} from '../lib/surveyLogic'

export function SurveyCollectorPage() {
  const { slug } = useParams<{ slug: string }>()
  const [survey, setSurvey] = useState<EtCollectorSurvey | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [blockIndex, setBlockIndex] = useState(0)
  const [quotaFull, setQuotaFull] = useState(false)
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

  const session: ParticipantSession | null = useMemo(() => {
    if (!survey) return null
    return {
      session_id: slug ?? 'local',
      survey_id: slug ?? '',
      current_block_index: blockIndex,
      answers,
      quota_counts: {},
      terminated: quotaFull,
      termination_reason: quotaFull ? 'quota_full' : null,
      started_at: Date.now(),
      updated_at: Date.now(),
    }
  }, [survey, slug, blockIndex, answers, quotaFull])

  const visibleQuestions = useMemo(() => {
    if (!currentBlock || !survey || !session) return [] as EtQuestion[]
    if (singlePage) {
      return blocks.flatMap((b) =>
        visibleQuestionsOnBlock(b, survey.definition, session),
      )
    }
    return visibleQuestionsOnBlock(currentBlock, survey.definition, session)
  }, [currentBlock, survey, session, singlePage, blocks])

  const routed = useMemo(() => {
    if (!survey || !session) return null
    return getNextPage(survey.definition, session, blockIndex)
  }, [survey, session, blockIndex])

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

  if (quotaFull) {
    return (
      <div className="et-canvas-dots flex min-h-screen items-center justify-center p-6">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <BrandLogo size="sm" />
          <h1 className="text-xl font-semibold text-slate-900">
            {settings?.quota_full_title ?? 'Quota full'}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {settings?.quota_full_message ?? 'Thank you for your interest. This survey has reached its target.'}
          </p>
        </div>
      </div>
    )
  }

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

  const isLast = singlePage || (routed?.type === 'page' ? routed.routed.is_last : true)

  function goNext() {
    if (!survey || !session) return
    const next = getNextPage(survey.definition, session, blockIndex + 1)
    if (next.type === 'quota_full') {
      setQuotaFull(true)
      return
    }
    if (next.type === 'page') {
      setBlockIndex(next.routed.block_index)
      return
    }
    void submit(true)
  }

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

          {!singlePage && currentBlock && (
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--et-teal)]">
              {currentBlock.title}
            </h2>
          )}
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
                onClick={goNext}
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
