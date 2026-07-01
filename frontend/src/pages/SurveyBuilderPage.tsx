import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react'
import {
  api,
  type AiStatus,
  type EtBlock,
  type EtQuestion,
  type EtQuestionType,
  type EtStudioSurvey,
  type EtSurveyDefinition,
} from '../api/client'
import { AiAssistPanel } from '../components/ai/AiAssistPanel'
import { ErrorState, LoadingState } from '../components/States'
import {
  ALL_QUESTION_TYPES,
  QUESTION_TYPE_GROUPS,
  newQuestion,
  patchQuestionForType,
  usesColumnOptions,
  usesOptions,
  usesRows,
  usesScale,
} from '../lib/etSurveyQuestionTypes'

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function SurveyBuilderPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const id = Number(workspaceId)
  const [survey, setSurvey] = useState<EtStudioSurvey | null>(null)
  const [definition, setDefinition] = useState<EtSurveyDefinition | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [aiBrief, setAiBrief] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [aiMessage, setAiMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getStudioSurvey(id)
      setSurvey(data)
      setDefinition(data.definition)
      const firstBlock = data.definition.blocks[0]
      setSelectedBlockId(firstBlock?.id ?? null)
      setSelectedQuestionId(firstBlock?.questions[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load survey')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    api.getAiStatus().then(setAiStatus).catch(() => setAiStatus(null))
  }, [])

  const selectedBlock = useMemo(
    () => definition?.blocks.find((b) => b.id === selectedBlockId) ?? null,
    [definition, selectedBlockId],
  )

  const selectedQuestion = useMemo(() => {
    if (!selectedBlock || !selectedQuestionId) return null
    return selectedBlock.questions.find((q) => q.id === selectedQuestionId) ?? null
  }, [selectedBlock, selectedQuestionId])

  function updateDefinition(next: EtSurveyDefinition) {
    setDefinition(next)
    setSaved(false)
  }

  function updateBlock(blockId: string, patch: Partial<EtBlock>) {
    if (!definition) return
    updateDefinition({
      ...definition,
      blocks: definition.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    })
  }

  function updateQuestion(blockId: string, questionId: string, patch: Partial<EtQuestion>) {
    if (!definition) return
    updateDefinition({
      ...definition,
      blocks: definition.blocks.map((b) =>
        b.id !== blockId
          ? b
          : {
              ...b,
              questions: b.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q)),
            },
      ),
    })
  }

  function addBlock() {
    if (!definition) return
    const n = definition.blocks.length + 1
    const block: EtBlock = {
      id: uid('block'),
      title: `Section ${n}`,
      description: '',
      sort_order: n - 1,
      questions: [],
    }
    updateDefinition({ ...definition, blocks: [...definition.blocks, block] })
    setSelectedBlockId(block.id)
  }

  function addQuestion(type: EtQuestionType) {
    if (!definition || !selectedBlockId) return
    const block = definition.blocks.find((b) => b.id === selectedBlockId)
    if (!block) return
    const q = newQuestion(type, block.questions.length + 1)
    updateBlock(selectedBlockId, { questions: [...block.questions, q] })
    setSelectedQuestionId(q.id)
  }

  async function handleSave() {
    if (!survey || !definition) return
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateStudioSurvey(survey.workspace_id, {
        title: survey.title,
        description: survey.description,
        definition: { ...definition, version: definition.version },
      })
      setSurvey(updated)
      setDefinition(updated.definition)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (!survey) return
    await handleSave()
    setPublishing(true)
    try {
      const updated = await api.publishStudioSurvey(survey.workspace_id)
      setSurvey(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  async function handleAiDraft() {
    if (!survey || !aiBrief.trim()) return
    setAiGenerating(true)
    setError(null)
    setAiMessage(null)
    try {
      const result = await api.draftStudioQuestionnaire(survey.workspace_id, { brief: aiBrief.trim() })
      setDefinition(result.definition)
      setSaved(false)
      setAiMessage(result.message)
      const firstBlock = result.definition.blocks[0]
      setSelectedBlockId(firstBlock?.id ?? null)
      setSelectedQuestionId(firstBlock?.questions[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI draft failed')
    } finally {
      setAiGenerating(false)
    }
  }

  const aiReady = Boolean(aiStatus?.configured)

  if (loading) return <LoadingState message="Loading survey builder…" />
  if (error && !survey) return <ErrorState message={error} />
  if (!survey || !definition) return <ErrorState message="Survey not found" />

  const collectorUrl = `${window.location.origin}/s/${survey.public_slug}`

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas)]">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/studio" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{survey.title}</h1>
              <p className="text-xs text-slate-500">
                ET Survey · {survey.status} · ID {survey.workspace_id}
                {saved && <span className="ml-2 text-emerald-600">Saved</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(collectorUrl)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Copy size={14} />
              Copy link
            </button>
            <a
              href={collectorUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink size={14} />
              Preview
            </a>
            <Link
              to={`/projects/${survey.workspace_id}`}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Workspace
            </Link>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={publishing}
              className="inline-flex items-center gap-1 rounded-lg et-btn-accent px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Publish
            </button>
          </div>
        </div>
      </header>

      {error && <p className="bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p>}

      <div className="mx-auto w-full max-w-7xl p-4 pb-0">
        <AiAssistPanel
          title="Draft questionnaire with AI"
          description="Describe audience, objectives, and key topics. AI generates sections and questions you can edit before publishing."
          brief={aiBrief}
          onBriefChange={setAiBrief}
          onGenerate={() => void handleAiDraft()}
          generating={aiGenerating}
          aiReady={aiReady}
        >
          {aiMessage && (
            <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs text-[var(--et-navy)]">{aiMessage}</p>
          )}
        </AiAssistPanel>
      </div>

      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-12">
        <aside className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sections</h2>
            <button type="button" onClick={addBlock} className="rounded p-1 text-[var(--et-teal)] hover:bg-slate-50">
              <Plus size={16} />
            </button>
          </div>
          <ul className="space-y-1">
            {definition.blocks.map((block) => (
              <li key={block.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBlockId(block.id)
                    setSelectedQuestionId(block.questions[0]?.id ?? null)
                  }}
                  className={`w-full rounded-lg px-2 py-2 text-left text-sm ${
                    selectedBlockId === block.id ? 'bg-[var(--et-teal)]/10 font-medium text-[var(--et-navy)]' : 'hover:bg-slate-50'
                  }`}
                >
                  {block.title}
                  <span className="ml-1 text-xs text-slate-400">({block.questions.length})</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-5">
          {selectedBlock ? (
            <>
              <input
                value={selectedBlock.title}
                onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                className="mb-2 w-full border-b border-transparent text-base font-semibold text-slate-900 focus:border-[var(--et-teal)] focus:outline-none"
              />
              <label className="mb-3 block text-xs text-slate-500">
                Randomise code{' '}
                <span className="text-slate-400">(sections with the same code shuffle together)</span>
                <input
                  value={selectedBlock.randomize_code ?? ''}
                  onChange={(e) => updateBlock(selectedBlock.id, { randomize_code: e.target.value.trim() })}
                  className="et-input mt-1 w-full font-mono text-sm"
                  placeholder="e.g. G1"
                />
              </label>
              <div className="mb-3 space-y-2">
                {QUESTION_TYPE_GROUPS.map((group) => (
                  <div key={group.title}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group.title}</p>
                    <div className="flex flex-wrap gap-1">
                      {group.types.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          title={t.hint}
                          onClick={() => addQuestion(t.value)}
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:border-[var(--et-navy)] hover:text-[var(--et-navy)]"
                        >
                          + {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <ul className="space-y-2">
                {selectedBlock.questions.map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedQuestionId(q.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                        selectedQuestionId === q.id
                          ? 'border-[var(--et-teal)] bg-[var(--et-teal)]/5'
                          : 'border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <span className="font-mono text-[10px] text-slate-400">{q.code}</span>
                      <p className="line-clamp-2 text-slate-800">{q.text}</p>
                      <p className="text-[10px] text-slate-500">{q.type}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-slate-500">Add a section to start programming.</p>
          )}
        </section>

        <aside className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-4">
          {selectedQuestion && selectedBlock ? (
            <QuestionEditor
              question={selectedQuestion}
              onChange={(patch) => updateQuestion(selectedBlock.id, selectedQuestion.id, patch)}
              onDelete={() => {
                updateBlock(selectedBlock.id, {
                  questions: selectedBlock.questions.filter((q) => q.id !== selectedQuestion.id),
                })
                setSelectedQuestionId(selectedBlock.questions[0]?.id ?? null)
              }}
            />
          ) : (
            <p className="text-sm text-slate-500">Select a question to edit.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

function QuestionEditor({
  question,
  onChange,
  onDelete,
}: {
  question: EtQuestion
  onChange: (patch: Partial<EtQuestion>) => void
  onDelete: () => void
}) {
  const showOptions = usesOptions(question.type)
  const showScale = usesScale(question.type)
  const showRows = usesRows(question.type)
  const showColumns = usesColumnOptions(question.type)
  const showChoiceExtras = question.type === 'single' || question.type === 'multi' || question.type === 'dropdown'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Question editor</h3>
        <button type="button" onClick={onDelete} className="text-rose-600 hover:text-rose-800">
          <Trash2 size={16} />
        </button>
      </div>
      <label className="block text-xs text-slate-500">
        Code
        <input
          value={question.code}
          onChange={(e) => onChange({ code: e.target.value.toUpperCase().replace(/\s+/g, '') })}
          className="et-input mt-1 w-full font-mono text-sm"
        />
      </label>
      <label className="block text-xs text-slate-500">
        Type
        <select
          value={question.type}
          onChange={(e) => {
            const next = e.target.value as EtQuestionType
            onChange(patchQuestionForType(question, next))
          }}
          className="et-select mt-1 w-full text-sm"
        >
          {ALL_QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-slate-500">
        Question text
        <textarea
          value={question.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={3}
          className="et-input mt-1 w-full text-sm"
        />
      </label>
      <label className="block text-xs text-slate-500">
        Help text <span className="text-slate-400">(optional)</span>
        <input
          value={question.help_text ?? ''}
          onChange={(e) => onChange({ help_text: e.target.value })}
          className="et-input mt-1 w-full text-sm"
          placeholder="Shown below the question"
        />
      </label>
      {question.type !== 'display' && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(question.required)}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Required
        </label>
      )}
      {question.type !== 'display' && (
        <label className="block text-xs text-slate-500">
          Randomise code{' '}
          <span className="text-slate-400">(questions with the same code shuffle together)</span>
          <input
            value={question.randomize_code ?? ''}
            onChange={(e) => onChange({ randomize_code: e.target.value.trim() })}
            className="et-input mt-1 w-full font-mono text-sm"
            placeholder="e.g. Q1"
          />
        </label>
      )}
      {showChoiceExtras && (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(question.randomize_options)}
              onChange={(e) => onChange({ randomize_options: e.target.checked })}
            />
            Randomize option order
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(question.allow_other)}
              onChange={(e) => onChange({ allow_other: e.target.checked })}
            />
            Allow &quot;Other&quot; with text box
          </label>
          {question.allow_other && (
            <input
              value={question.other_label ?? ''}
              onChange={(e) => onChange({ other_label: e.target.value })}
              className="et-input w-full text-sm"
              placeholder="Other label"
            />
          )}
        </>
      )}
      {showScale && (
        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600">Scale range</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              Min
              <input
                type="number"
                value={question.scale_min ?? 1}
                onChange={(e) => onChange({ scale_min: Number(e.target.value) })}
                className="et-input mt-1 w-full"
              />
            </label>
            <label className="text-xs text-slate-500">
              Max
              <input
                type="number"
                value={question.scale_max ?? 5}
                onChange={(e) => onChange({ scale_max: Number(e.target.value) })}
                className="et-input mt-1 w-full"
              />
            </label>
            <label className="text-xs text-slate-500">
              Min label
              <input
                value={question.scale_min_label ?? ''}
                onChange={(e) => onChange({ scale_min_label: e.target.value })}
                className="et-input mt-1 w-full"
                placeholder="e.g. Not at all"
              />
            </label>
            <label className="text-xs text-slate-500">
              Max label
              <input
                value={question.scale_max_label ?? ''}
                onChange={(e) => onChange({ scale_max_label: e.target.value })}
                className="et-input mt-1 w-full"
                placeholder="e.g. Extremely"
              />
            </label>
          </div>
        </div>
      )}
      {showOptions && (
        <OptionListEditor
          title="Answer options"
          items={question.options ?? []}
          onChange={(options) => onChange({ options })}
        />
      )}
      {showRows && (
        <OptionListEditor
          title={question.type === 'array_carousel' ? 'Carousel items (sub-questions)' : 'Matrix rows'}
          items={question.rows ?? []}
          codePrefix="R"
          showRandomizeCode
          onChange={(rows) => onChange({ rows })}
        />
      )}
      {showColumns && (
        <OptionListEditor
          title="Column options (scale labels)"
          items={question.options ?? []}
          onChange={(options) => onChange({ options })}
          hint="Leave as Likert labels, or clear and use numeric scale min/max only."
        />
      )}
      {question.type === 'array_carousel' && (
        <p className="rounded-lg bg-[var(--et-yellow-light)] px-3 py-2 text-xs text-[var(--et-navy)]">
          Respondents see one sub-question at a time with Previous / Next navigation — ideal for mobile.
        </p>
      )}
      {question.type === 'photo' && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(question.camera_only)}
            onChange={(e) => onChange({ camera_only: e.target.checked })}
          />
          Camera only (no gallery on supported devices)
        </label>
      )}
      {question.type === 'audio' && (
        <label className="block text-xs text-slate-500">
          Max recording length (seconds)
          <input
            type="number"
            min={10}
            max={600}
            value={question.max_recording_seconds ?? 120}
            onChange={(e) => onChange({ max_recording_seconds: Number(e.target.value) })}
            className="et-input mt-1 w-full"
          />
        </label>
      )}
      {(question.type === 'gps' || question.type === 'photo' || question.type === 'audio') && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {question.type === 'gps' && 'Stores latitude/longitude for maps and QC proximity checks in the workspace.'}
          {question.type === 'photo' && 'Respondents capture or upload an image; files are stored with the response.'}
          {question.type === 'audio' && 'Respondents record audio in the browser; playback is available in exported data.'}
        </p>
      )}
    </div>
  )
}

function OptionListEditor({
  title,
  items,
  onChange,
  codePrefix = '',
  hint,
  showRandomizeCode = false,
}: {
  title: string
  items: { code: string; label: string; sort_order: number; randomize_code?: string }[]
  onChange: (items: { code: string; label: string; sort_order: number; randomize_code?: string }[]) => void
  codePrefix?: string
  hint?: string
  showRandomizeCode?: boolean
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500">{title}</p>
      {hint && <p className="mb-2 text-[10px] text-slate-400">{hint}</p>}
      {showRandomizeCode && (
        <p className="mb-2 text-[10px] text-slate-400">
          Optional randomise code per row — rows sharing a code shuffle together.
        </p>
      )}
      <ul className="space-y-2">
        {items.map((opt, i) => (
          <li key={`${opt.code}-${i}`} className="flex flex-wrap gap-2">
            <input
              value={opt.code}
              onChange={(e) => {
                const next = [...items]
                next[i] = { ...opt, code: e.target.value }
                onChange(next)
              }}
              className="et-input w-16 font-mono text-xs"
              placeholder="Code"
            />
            <input
              value={opt.label}
              onChange={(e) => {
                const next = [...items]
                next[i] = { ...opt, label: e.target.value }
                onChange(next)
              }}
              className="et-input min-w-0 flex-1 text-sm"
              placeholder="Label"
            />
            {showRandomizeCode && (
              <input
                value={opt.randomize_code ?? ''}
                onChange={(e) => {
                  const next = [...items]
                  next[i] = { ...opt, randomize_code: e.target.value.trim() }
                  onChange(next)
                }}
                className="et-input w-20 font-mono text-xs"
                placeholder="Rand"
                title="Randomise code"
              />
            )}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-slate-400 hover:text-rose-600"
              aria-label="Remove"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() =>
          onChange([
            ...items,
            {
              code: codePrefix ? `${codePrefix}${items.length + 1}` : String(items.length + 1),
              label: 'New item',
              sort_order: items.length,
            },
          ])
        }
        className="mt-2 text-xs font-medium text-[var(--et-navy)] hover:underline"
      >
        + Add item
      </button>
    </div>
  )
}
