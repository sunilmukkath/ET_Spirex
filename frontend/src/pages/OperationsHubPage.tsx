import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bot,
  Briefcase,
  Code2,
  DollarSign,
  Download,
  FileUp,
  FileText,
  Link2,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Save,
  Users,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import {
  api,
  type PmAgentBrief,
  type PmAgentDraft,
  type PmClient,
  type PmFinanceSummary,
  type PmImportResult,
  type PmPipelineOverview,
  type Project,
  type ProjectRequirements,
} from '../api/client'
import { ProjectRequirementsEditor, emptyProjectRequirements } from '../components/ProjectRequirementsEditor'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { EmptyState, ErrorState, LoadingState } from '../components/States'

type Tab = 'pipeline' | 'clients' | 'finance' | 'programming' | 'links'

const TAB_IDS = new Set<Tab>(['pipeline', 'clients', 'finance', 'programming', 'links'])

function parseTab(value: string | null): Tab {
  if (value && TAB_IDS.has(value as Tab)) return value as Tab
  return 'pipeline'
}

const STAGES = [
  'Proposal',
  'Budgeting',
  'Vendor Setup',
  'Deployment Prep',
  'Fieldwork/Data Collection',
  'QC',
  'Analysis',
  'Reporting',
  'Close-out',
  'Delivered',
]

function AgentPanel({ brief, loading }: { brief: PmAgentBrief | null; loading: boolean }) {
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

function DraftAgentPanel({ draft, loading }: { draft: PmAgentDraft | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin text-[var(--et-teal)]" />
        Drafting…
      </div>
    )
  }
  if (!draft) return null
  return (
    <div className="rounded-xl border border-[var(--et-teal)]/25 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--et-teal-dark)]">
          <Bot size={14} />
          {draft.agent} writing agent {draft.configured ? '(AI)' : '(template)'}
        </div>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(draft.draft_markdown)}
          className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
        >
          Copy markdown
        </button>
      </div>
      <h3 className="mt-3 font-display text-lg font-semibold text-slate-900">{draft.title}</h3>
      <div className="mt-4 space-y-4">
        {draft.sections.map((s) => (
          <section key={s.heading}>
            <h4 className="text-sm font-semibold text-slate-800">{s.heading}</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{s.body}</p>
          </section>
        ))}
      </div>
      {draft.actions.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-700">
          {draft.actions.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function OperationsHubPage() {
  const { user } = useAuth()
  const { prefs } = useUserPreferences(user?.username)
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get('tab')))
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [pipeline, setPipeline] = useState<PmPipelineOverview | null>(null)
  const [clients, setClients] = useState<PmClient[]>([])
  const [limeSurveys, setLimeSurveys] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [finance, setFinance] = useState<PmFinanceSummary | null>(null)
  const [financeAgent, setFinanceAgent] = useState<PmAgentBrief | null>(null)
  const [crmAgent, setCrmAgent] = useState<PmAgentBrief | null>(null)
  const [proposalDraft, setProposalDraft] = useState<PmAgentDraft | null>(null)
  const [proposalProjectId, setProposalProjectId] = useState('')
  const [proposalBrief, setProposalBrief] = useState('')
  const [agentLoading, setAgentLoading] = useState(false)
  const [proposalLoading, setProposalLoading] = useState(false)
  const [requirementsProjectId, setRequirementsProjectId] = useState<string | null>(null)
  const [requirementsProjectName, setRequirementsProjectName] = useState('')
  const [requirementsDraft, setRequirementsDraft] = useState<ProjectRequirements>(emptyProjectRequirements())
  const [requirementsSaving, setRequirementsSaving] = useState(false)

  const [newClientName, setNewClientName] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [linkSurveyId, setLinkSurveyId] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<PmImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await api.getPmStatus()
      setEnabled(status.enabled)
      if (!status.enabled || !status.ready) {
        setPipeline(null)
        return
      }
      const [pipe, clientRows, surveysRaw] = await Promise.all([
        api.getPmPipeline(),
        api.listPmClients(),
        api.getProjects().catch(() => [] as Project[]),
      ])
      const surveys = Array.isArray(surveysRaw) ? surveysRaw : surveysRaw.projects
      setPipeline(pipe)
      setClients(clientRows)
      setLimeSurveys(surveys)
      const first = pipe.projects[0]?.project_id ?? ''
      setSelectedProjectId((cur) => cur || first)
      setProposalProjectId((cur) => cur || first)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load operations hub')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const next = parseTab(searchParams.get('tab'))
    setTab(next)
  }, [searchParams])

  useEffect(() => {
    if (!searchParams.get('tab') && prefs.operations_default_tab) {
      setTab(parseTab(prefs.operations_default_tab))
    }
  }, [prefs.operations_default_tab, searchParams])

  useEffect(() => {
    if (!selectedProjectId || tab !== 'finance') return
    void (async () => {
      try {
        const f = await api.getPmFinance(selectedProjectId)
        setFinance(f)
      } catch {
        setFinance(null)
      }
    })()
  }, [selectedProjectId, tab])

  async function handleCreateClient(e: FormEvent) {
    e.preventDefault()
    if (!newClientName.trim()) return
    await api.createPmClient({ client_name: newClientName.trim() })
    setNewClientName('')
    await load()
  }

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault()
    if (!newProjectName.trim()) return
    await api.createPmProject({
      project_name: newProjectName.trim(),
      project_type: 'quant',
      engagement_type: 'ad-hoc',
      stage: 'Proposal',
    })
    setNewProjectName('')
    await load()
  }

  async function handleImportProjects(file: File) {
    setImporting(true)
    setImportError(null)
    setImportResult(null)
    try {
      const result = await api.importPmProjects(file)
      setImportResult(result)
      await load()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  async function handleStageChange(projectId: string, stage: string) {
    await api.updatePmProject(projectId, { stage })
    await load()
  }

  async function handleLinkSurvey(projectId: string) {
    const sid = linkSurveyId ? Number(linkSurveyId) : null
    await api.linkPmSurvey(projectId, sid)
    setLinkSurveyId('')
    await load()
  }

  async function runFinanceAgent() {
    if (!selectedProjectId) return
    setAgentLoading(true)
    try {
      setFinanceAgent(await api.runFinanceAgent(selectedProjectId))
    } finally {
      setAgentLoading(false)
    }
  }

  async function runCrmAgentForProject(projectId: string) {
    setAgentLoading(true)
    try {
      setCrmAgent(await api.runCrmAgent({ project_id: projectId }))
      setTab('clients')
    } finally {
      setAgentLoading(false)
    }
  }

  async function runProposalAgent() {
    if (!proposalProjectId) return
    setProposalLoading(true)
    try {
      setProposalDraft(
        await api.runProposalWritingAgent({
          project_id: proposalProjectId,
          context: proposalBrief.trim() || undefined,
        }),
      )
    } finally {
      setProposalLoading(false)
    }
  }

  async function runProposalAgentForProject(projectId: string) {
    setProposalProjectId(projectId)
    setProposalLoading(true)
    try {
      setProposalDraft(
        await api.runProposalWritingAgent({
          project_id: projectId,
          context: proposalBrief.trim() || undefined,
        }),
      )
    } finally {
      setProposalLoading(false)
    }
  }

  async function openRequirements(projectId: string, projectName: string) {
    setRequirementsProjectId(projectId)
    setRequirementsProjectName(projectName)
    try {
      const project = await api.getPmProject(projectId)
      setRequirementsDraft(project.requirements ?? emptyProjectRequirements())
    } catch {
      setRequirementsDraft(emptyProjectRequirements())
    }
  }

  async function saveRequirements() {
    if (!requirementsProjectId) return
    setRequirementsSaving(true)
    try {
      await api.updatePmProjectRequirements(requirementsProjectId, requirementsDraft)
      setRequirementsProjectId(null)
      await load()
    } finally {
      setRequirementsSaving(false)
    }
  }

  if (loading) return <LoadingState message="Loading operations hub…" />
  if (enabled === false) {
    return (
      <div className="et-page et-page-wide py-10">
        <EmptyState
          title="Operations database not configured"
          description="Set DATABASE_URL on the server to enable proposal-to-closure tracking, finance, CRM, and survey linking."
        />
      </div>
    )
  }
  if (error) return <div className="et-page py-10"><ErrorState message={error} /></div>

  const projects = pipeline?.projects ?? []
  const surveyTitleById = new Map(limeSurveys.map((s) => [s.id, s.title]))

  return (
    <div className="et-page et-page-wide space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Operations hub</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            End-to-end from proposal to closure — clients, finance, marketing, survey programming, and LimeSurvey links in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      <div className="et-segment flex flex-wrap gap-1">
        {(
          [
            ['pipeline', 'Pipeline', Briefcase],
            ['clients', 'CRM & marketing', Users],
            ['finance', 'Finance', DollarSign],
            ['programming', 'Programming', Code2],
            ['links', 'Survey links', Link2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`et-segment-btn inline-flex items-center gap-1.5 text-xs ${
              tab === id ? 'et-segment-btn-active' : 'et-segment-btn-inactive'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'pipeline' && (
        <div className="space-y-6">
          <div className="grid gap-2 sm:grid-cols-5 lg:grid-cols-10">
            {(pipeline?.stages ?? STAGES.map((s) => ({ stage: s, count: 0 }))).map((s) => (
              <div
                key={s.stage}
                className="rounded-lg border border-slate-200 bg-white px-2 py-3 text-center shadow-sm"
              >
                <p className="text-lg font-semibold text-[var(--et-teal-dark)]">{s.count}</p>
                <p className="mt-1 text-[10px] leading-tight text-slate-500">{s.stage}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-[var(--et-navy)]">Import projects from Excel</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Upload a sheet with project names and LimeSurvey IDs or survey titles — ET Scout creates pipeline
              entries and links studies automatically.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void api.downloadPmProjectImportTemplate().catch(() => setImportError('Template download failed'))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download size={14} />
                Download template
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xlsm,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleImportProjects(file)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                disabled={importing}
                onClick={() => importInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg et-btn-accent px-3 py-2 text-xs disabled:opacity-50"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                Upload project sheet
              </button>
            </div>
            {importError && <p className="mt-2 text-xs text-rose-600">{importError}</p>}
            {importResult && (
              <div className="mt-3 rounded-lg bg-[var(--et-gray-50)] px-3 py-2 text-xs text-slate-700">
                <p className="font-medium text-[var(--et-navy)]">
                  Import complete — {importResult.created} created, {importResult.skipped} skipped,{' '}
                  {importResult.errors} errors
                </p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto et-scroll">
                  {importResult.rows.map((row) => (
                    <li key={`${row.row_number}-${row.project_name}`}>
                      <span
                        className={
                          row.status === 'created'
                            ? 'text-emerald-700'
                            : row.status === 'skipped'
                              ? 'text-amber-700'
                              : 'text-rose-700'
                        }
                      >
                        Row {row.row_number}: {row.project_name}
                      </span>
                      {row.message ? ` — ${row.message}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <form onSubmit={(e) => void handleCreateProject(e)} className="flex flex-wrap gap-2">
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="New project name (proposal stage)"
              className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm font-medium text-white"
            >
              <Plus size={16} />
              Add project
            </button>
          </form>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Survey</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.project_id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.project_name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.client_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={p.stage}
                        onChange={(e) => void handleStageChange(p.project_id, e.target.value)}
                        className="et-select text-xs"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {p.limesurvey_survey_id ? (
                        <Link
                          to={`/projects/${p.limesurvey_survey_id}`}
                          className="text-[var(--et-teal-dark)] hover:underline"
                        >
                          #{p.limesurvey_survey_id}
                        </Link>
                      ) : (
                        <span className="text-amber-700">Unlinked</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void openRequirements(p.project_id, p.project_name)}
                          className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                        >
                          Requirements
                        </button>
                        <button
                          type="button"
                          onClick={() => void runProposalAgentForProject(p.project_id)}
                          className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                        >
                          Proposal agent
                        </button>
                        <button
                          type="button"
                          onClick={() => void runCrmAgentForProject(p.project_id)}
                          className="text-xs font-medium text-[var(--et-teal-dark)] hover:underline"
                        >
                          CRM agent
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {projects.length === 0 && (
              <p className="p-8 text-center text-sm text-slate-500">No PM projects yet — create one above.</p>
            )}
          </div>

          {(pipeline?.unlinked_survey_ids.length ?? 0) > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">
                {pipeline!.unlinked_survey_ids.length} LimeSurvey stud
                {pipeline!.unlinked_survey_ids.length === 1 ? 'y' : 'ies'} not assigned to a PM project
              </p>
              <p className="mt-1 text-xs">
                Open the <button type="button" className="font-semibold underline" onClick={() => setTab('links')}>Survey links</button> tab to assign them.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Proposal writing agent</h3>
              <p className="mt-1 text-xs text-slate-500">
                Draft a client-facing proposal from PM project details, budget, and optional brief notes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="text-sm text-slate-700">
                Project
                <select
                  value={proposalProjectId}
                  onChange={(e) => setProposalProjectId(e.target.value)}
                  className="et-select mt-1 block min-w-[200px]"
                >
                  {projects.map((p) => (
                    <option key={p.project_id} value={p.project_id}>
                      {p.project_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              value={proposalBrief}
              onChange={(e) => setProposalBrief(e.target.value)}
              placeholder="Optional client brief or objectives (used as additional context)"
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void runProposalAgent()}
              disabled={!proposalProjectId || proposalLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--et-teal)]/40 bg-[var(--et-teal-light)]/50 px-4 py-2 text-sm font-medium text-[var(--et-teal-dark)] disabled:opacity-50"
            >
              <Bot size={16} />
              Draft proposal
            </button>
            <DraftAgentPanel draft={proposalDraft} loading={proposalLoading} />
          </div>
        </div>
      )}

      {tab === 'clients' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <form onSubmit={(e) => void handleCreateClient(e)} className="flex gap-2">
              <input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Client organisation name"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-lg bg-[var(--et-teal)] px-4 py-2 text-sm text-white">
                Add client
              </button>
            </form>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {clients.map((c) => (
                <li key={c.client_id} className="px-4 py-3">
                  <p className="font-medium text-slate-900">{c.client_name}</p>
                  <p className="text-xs text-slate-500">
                    {c.contact_person ?? 'No contact'} · {c.project_count ?? 0} projects
                    {c.repeat_client && ' · Repeat'}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <AgentPanel brief={crmAgent} loading={agentLoading} />
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Megaphone size={16} className="text-[var(--et-teal)]" />
                Marketing follow-ups
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Log nurture, campaign, and proposal follow-up activities from the pipeline CRM agent suggestions, or create via API.
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'finance' && (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Project</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="et-select mt-1 w-full max-w-md"
            >
              {projects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.project_name}
                </option>
              ))}
            </select>
          </label>
          {finance && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Budget estimate</p>
                <p className="text-xl font-semibold">{finance.budget_estimate?.toLocaleString() ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Actual</p>
                <p className="text-xl font-semibold">{finance.budget_actual?.toLocaleString() ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">Outstanding</p>
                <p className="text-xl font-semibold">{finance.total_outstanding?.toLocaleString() ?? '—'}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void runFinanceAgent()}
            disabled={!selectedProjectId || agentLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--et-teal)]/40 bg-[var(--et-teal-light)]/50 px-4 py-2 text-sm font-medium text-[var(--et-teal-dark)] disabled:opacity-50"
          >
            <Bot size={16} />
            Run finance agent
          </button>
          <AgentPanel brief={financeAgent} loading={agentLoading} />
        </div>
      )}

      {tab === 'programming' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Survey programming uses LimeSurvey as the engine. Link a survey to a PM project, then open the workspace for question setup, quotas, and spec export.
          </p>
          <ul className="space-y-3">
            {projects.map((p) => (
              <li
                key={p.project_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium text-slate-900">{p.project_name}</p>
                  <p className="text-xs text-slate-500">Stage: {p.stage}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.limesurvey_survey_id ? (
                    <>
                      <Link
                        to={`/projects/${p.limesurvey_survey_id}?mode=variables`}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                      >
                        Data setup
                      </Link>
                      <Link
                        to={`/projects/${p.limesurvey_survey_id}?mode=workflow`}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                      >
                        Workflow
                      </Link>
                      <a
                        href={`/api/projects/${p.limesurvey_survey_id}/questionnaire/export?format=xlsx`}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                      >
                        Export spec
                      </a>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(p.project_id)
                        setTab('links')
                      }}
                      className="text-xs font-medium text-amber-700 underline"
                    >
                      Link survey first
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'links' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Assign each LimeSurvey study to exactly one PM project. Team members open the linked workspace from the dashboard or pipeline.
          </p>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">PM project</th>
                  <th className="px-4 py-3">LimeSurvey ID</th>
                  <th className="px-4 py-3">Assign</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.project_id} className="border-b border-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.project_name}</p>
                      <p className="text-xs text-slate-500">{p.client_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      {p.limesurvey_survey_id ? (
                        <Link
                          to={`/projects/${p.limesurvey_survey_id}`}
                          className="font-mono text-[var(--et-teal-dark)] hover:underline"
                        >
                          {p.limesurvey_survey_id}
                          {surveyTitleById.get(p.limesurvey_survey_id)
                            ? ` — ${surveyTitleById.get(p.limesurvey_survey_id)}`
                            : ''}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={selectedProjectId === p.project_id ? linkSurveyId : ''}
                          onFocus={() => setSelectedProjectId(p.project_id)}
                          onChange={(e) => {
                            setSelectedProjectId(p.project_id)
                            setLinkSurveyId(e.target.value)
                          }}
                          className="et-select max-w-[220px] text-xs"
                        >
                          <option value="">Select survey…</option>
                          {limeSurveys.map((s) => (
                            <option key={s.id} value={String(s.id)}>
                              {s.id} — {s.title.slice(0, 40)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleLinkSurvey(p.project_id)}
                          className="rounded-lg bg-[var(--et-teal)] px-3 py-1.5 text-xs text-white"
                        >
                          Save link
                        </button>
                        {p.limesurvey_survey_id && (
                          <button
                            type="button"
                            onClick={() => void api.linkPmSurvey(p.project_id, null).then(() => load())}
                            className="text-xs text-slate-500 hover:text-red-600"
                          >
                            Unlink
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Fieldwork daily tracking: <Link to="/fieldwork" className="text-[var(--et-teal-dark)] hover:underline">Fieldwork tracker</Link>
        {' · '}
        LimeSurvey studies: <Link to="/dashboard" className="text-[var(--et-teal-dark)] hover:underline">Dashboard</Link>
      </p>

      {requirementsProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl et-scroll">
            <div className="flex items-start gap-2">
              <FileText size={20} className="mt-0.5 text-[var(--et-teal)]" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Project requirements</h3>
                <p className="text-sm text-slate-500">{requirementsProjectName}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              PM-level brief — feeds proposal agent and operations. Linked LimeSurvey workflow can hold a copy under Workflow.
            </p>
            <div className="mt-4">
              <ProjectRequirementsEditor
                value={requirementsDraft}
                onChange={setRequirementsDraft}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="et-btn-secondary"
                onClick={() => setRequirementsProjectId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="et-btn-primary"
                disabled={requirementsSaving}
                onClick={() => void saveRequirements()}
              >
                {requirementsSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save requirements
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
